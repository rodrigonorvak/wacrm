// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { canManageMembers, isAccountRole } from '@/lib/auth/roles';
import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { parseNewMemberInput } from '@/lib/auth/member-provisioning';
import { privateAvatarUrl } from '@/lib/storage/avatar-url';
import type { AccountMember } from '@/types';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/account/members] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load members' },
        { status: 500 }
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? '',
          email: canSeeEmails ? row.email : null,
          avatar_url: privateAvatarUrl(row.avatar_url, row.user_id),
          role: row.account_role,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:memberCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const parsed = parseNewMemberInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const createAuthUser = () =>
      admin.auth.admin.createUser({
        email: parsed.value.email,
        password: parsed.value.password,
        email_confirm: true,
        user_metadata: {
          full_name: parsed.value.fullName || parsed.value.email.split('@')[0],
        },
        app_metadata: {
          member_provisioning_account_id: ctx.accountId,
          member_provisioning_role: parsed.value.role,
        },
      });

    let { data, error } = await createAuthUser();

    if (error?.code === 'email_exists') {
      const { data: existingProfile, error: lookupError } = await admin
        .from('profiles')
        .select('user_id, account_id, account_role, access_status')
        .ilike('email', parsed.value.email)
        .maybeSingle();

      if (lookupError) {
        console.error(
          '[POST /api/account/members] existing profile lookup failed',
          lookupError.code,
          lookupError.message
        );
        return NextResponse.json(
          {
            error: 'Could not verify existing account',
            code: 'profile_lookup_failed',
          },
          { status: 500 }
        );
      }

      if (existingProfile?.access_status === 'pending') {
        const { error: passwordError } = await admin.auth.admin.updateUserById(
          existingProfile.user_id,
          { password: parsed.value.password, email_confirm: true }
        );

        if (passwordError) {
          console.error(
            '[POST /api/account/members] pending member password setup failed',
            passwordError.code,
            passwordError.message
          );
          return NextResponse.json(
            {
              error: 'Could not set the member password',
              code: passwordError.code ?? 'auth_update_failed',
            },
            { status: passwordError.code === 'weak_password' ? 400 : 500 }
          );
        }

        const { data: promotedProfile, error: promoteError } = await admin
          .from('profiles')
          .update({
            full_name:
              parsed.value.fullName || parsed.value.email.split('@')[0],
            email: parsed.value.email,
            account_id: ctx.accountId,
            account_role: parsed.value.role,
            access_status: 'approved',
          })
          .eq('user_id', existingProfile.user_id)
          .eq('access_status', 'pending')
          .select('user_id')
          .maybeSingle();

        if (promoteError || !promotedProfile) {
          console.error(
            '[POST /api/account/members] pending profile promotion failed',
            promoteError?.code,
            promoteError?.message
          );
          return NextResponse.json(
            {
              error: 'Could not add the pending user to this account',
              code: promoteError?.code ?? 'profile_promotion_failed',
            },
            { status: 500 }
          );
        }

        const { error: requestCleanupError } = await admin
          .from('account_creation_requests')
          .delete()
          .eq('user_id', existingProfile.user_id);
        if (requestCleanupError) {
          console.error(
            '[POST /api/account/members] pending signup request cleanup failed',
            requestCleanupError.code,
            requestCleanupError.message
          );
        }

        return NextResponse.json(
          {
            member: {
              user_id: existingProfile.user_id,
              email: parsed.value.email,
              role: parsed.value.role,
              requires_password_change: false,
            },
          },
          { status: 201 }
        );
      }
    }

    // A previous failed attempt can leave an auth user without a profile;
    // remove that orphan so the email can be used again.
    if (error?.code === 'email_exists') {
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('user_id')
        .ilike('email', parsed.value.email)
        .maybeSingle();
      if (!existingProfile) {
        for (let page = 1; page <= 20; page++) {
          const { data: list } = await admin.auth.admin.listUsers({
            page,
            perPage: 1000,
          });
          const users = list?.users ?? [];
          const orphan = users.find(
            (u) => u.email?.toLowerCase() === parsed.value.email
          );
          if (orphan) {
            const { data: orphanProfile } = await admin
              .from('profiles')
              .select('user_id')
              .eq('user_id', orphan.id)
              .maybeSingle();
            if (!orphanProfile) {
              await admin.auth.admin.deleteUser(orphan.id);
              ({ data, error } = await createAuthUser());
            }
            break;
          }
          if (users.length < 1000) break;
        }
      }
    }

    if (error || !data.user) {
      if (error?.code === 'email_exists') {
        return NextResponse.json(
          {
            error: 'An account with this email already exists',
            code: 'email_exists',
          },
          { status: 409 }
        );
      }
      if (error?.code === 'weak_password') {
        return NextResponse.json(
          { error: 'Password rejected as too weak', code: 'weak_password' },
          { status: 400 }
        );
      }
      console.error(
        '[POST /api/account/members] auth user creation failed',
        error?.code,
        error?.message
      );
      return NextResponse.json(
        {
          error: 'Failed to create member',
          code: error?.code ?? 'auth_create_failed',
        },
        { status: 500 }
      );
    }

    const user = data.user;
    const loadProfile = () =>
      admin
        .from('profiles')
        .select('user_id, account_id, account_role')
        .eq('user_id', user.id)
        .maybeSingle();

    let { data: profile, error: profileError } = await loadProfile();
    let insertErrorCode: string | undefined;

    // The signup trigger swallows its own failures; create the profile
    // directly when it did not run so the member is not lost.
    if (!profile && !profileError) {
      const { error: insertError } = await admin.from('profiles').insert({
        user_id: user.id,
        full_name: parsed.value.fullName || parsed.value.email.split('@')[0],
        email: parsed.value.email,
        account_id: ctx.accountId,
        account_role: parsed.value.role,
        access_status: 'approved',
      });
      if (insertError) {
        insertErrorCode = insertError.code || 'profile_insert_failed';
        console.error(
          '[POST /api/account/members] profile insert failed',
          insertError.code,
          insertError.message
        );
      }
      ({ data: profile, error: profileError } = await loadProfile());
    }

    if (
      profileError ||
      !profile ||
      profile.account_id !== ctx.accountId ||
      profile.account_role !== parsed.value.role
    ) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(
        user.id
      );
      console.error('[POST /api/account/members] profile provisioning failed', {
        cleanupSucceeded: !cleanupError,
      });
      return NextResponse.json(
        {
          error: 'Member setup did not complete; no access was granted',
          code: insertErrorCode
            ? `profile_not_created:${insertErrorCode}`
            : 'profile_not_created',
        },
        { status: 500 }
      );
    }

    const appMetadata: Record<string, unknown> = { ...user.app_metadata };
    delete appMetadata.must_change_password;
    delete appMetadata.member_provisioning_account_id;
    delete appMetadata.member_provisioning_role;
    const { error: metadataError } = await admin.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: appMetadata,
      }
    );
    if (metadataError) {
      console.error(
        '[POST /api/account/members] temporary provisioning metadata cleanup failed'
      );
    }

    return NextResponse.json(
      {
        member: {
          user_id: user.id,
          email: parsed.value.email,
          role: parsed.value.role,
          requires_password_change: false,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
