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

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { parseNewMemberInput } from "@/lib/auth/member-provisioning";
import { privateAvatarUrl } from "@/lib/storage/avatar-url";
import type { AccountMember } from "@/types";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

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
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, account_role, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
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
          full_name: row.full_name ?? "",
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
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(
      `admin:memberCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const parsed = parseNewMemberInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.value.email,
      password: parsed.value.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.value.fullName || parsed.value.email.split("@")[0],
      },
      app_metadata: {
        must_change_password: true,
        member_provisioning_account_id: ctx.accountId,
        member_provisioning_role: parsed.value.role,
      },
    });

    if (error || !data.user) {
      if (error?.code === "email_exists" || error?.status === 422) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 },
        );
      }
      console.error("[POST /api/account/members] auth user creation failed", error?.code);
      return NextResponse.json({ error: "Failed to create member" }, { status: 500 });
    }

    const user = data.user;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.account_id !== ctx.accountId ||
      profile.account_role !== parsed.value.role
    ) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(user.id);
      console.error("[POST /api/account/members] profile provisioning failed", {
        cleanupSucceeded: !cleanupError,
      });
      return NextResponse.json(
        { error: "Member setup did not complete; no access was granted" },
        { status: 500 },
      );
    }

    const appMetadata: Record<string, unknown> = {
      ...user.app_metadata,
      must_change_password: true,
    };
    delete appMetadata.member_provisioning_account_id;
    delete appMetadata.member_provisioning_role;
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: appMetadata,
    });
    if (metadataError) {
      console.error("[POST /api/account/members] temporary provisioning metadata cleanup failed");
    }

    return NextResponse.json(
      {
        member: {
          user_id: user.id,
          email: parsed.value.email,
          role: parsed.value.role,
          requires_password_change: true,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
