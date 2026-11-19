import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { summarizeAccountActivity, type ActivityInput } from "@/lib/admin/account-activity";
import { emailPhotoUrl } from "@/lib/admin/email-photo";

const ROW_LIMIT = 8000;

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function dayKey(value: string | null): string | null {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function stageName(stage: unknown): string {
  const row = Array.isArray(stage) ? stage[0] : stage;
  if (row && typeof row === "object" && "name" in row && typeof row.name === "string" && row.name.trim()) {
    return row.name;
  }
  return "Sem etapa";
}

async function loadRows(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  columns: string,
  accountIds: string[],
  column: string,
  from: string | null,
  to: string | null,
  requireValue = false,
) {
  let query = admin.from(table).select(columns).in("account_id", accountIds).limit(ROW_LIMIT);
  if (requireValue) query = query.not(column, "is", null);
  if (from) query = query.gte(column, from);
  if (to) query = query.lte(column, to);
  const { data, error } = await query;
  return { rows: (data ?? []) as unknown as Record<string, unknown>[], error: error?.message ?? null };
}

export async function GET(request: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const from = isoDate(url.searchParams.get("from"));
    const to = isoDate(url.searchParams.get("to"));
    if (url.searchParams.get("from") && !from) {
      return NextResponse.json({ error: "from must be a date" }, { status: 400 });
    }
    if (url.searchParams.get("to") && !to) {
      return NextResponse.json({ error: "to must be a date" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: accounts, error: accountsError } = await admin
      .from("accounts")
      .select("id, name, owner_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (accountsError) {
      console.error("[platform-admin/overview] accounts failed:", accountsError.message);
      return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
    }

    const accountRows = accounts ?? [];
    const accountIds = accountRows.map((account) => account.id);
    if (accountIds.length === 0) {
      return NextResponse.json({ accounts: [], warnings: [] });
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("user_id, account_id, full_name, email, avatar_url, account_role")
      .in("account_id", accountIds);
    if (profilesError) {
      console.error("[platform-admin/overview] profiles failed:", profilesError.message);
      return NextResponse.json({ error: "Failed to load account members" }, { status: 500 });
    }

    const [contacts, deals, appointments, messages, broadcasts, emails] = await Promise.all([
      loadRows(admin, "contacts", "account_id, has_ad_referral", accountIds, "created_at", from, to),
      loadRows(admin, "deals", "account_id, value, stage:pipeline_stages(name)", accountIds, "created_at", from, to),
      loadRows(admin, "deals", "account_id", accountIds, "scheduled_date", dayKey(from), dayKey(to), true),
      loadRows(admin, "scheduled_whatsapp_messages", "account_id", accountIds, "scheduled_at", from, to),
      loadRows(admin, "broadcasts", "account_id, sent_count, status", accountIds, "created_at", from, to),
      loadRows(admin, "email_campaign_deliveries", "account_id, status", accountIds, "sent_at", from, to),
    ]);

    const warnings = [
      contacts.error && "leads",
      deals.error && "negócios",
      appointments.error && "agendamentos",
      messages.error && "mensagens agendadas",
      broadcasts.error && "disparos",
      emails.error && "e-mails",
    ].filter((item): item is string => Boolean(item));

    const activity: ActivityInput = {
      contacts: contacts.rows.map((row) => ({
        account_id: String(row.account_id),
        ad: row.has_ad_referral === true,
      })),
      deals: deals.rows.map((row) => ({
        account_id: String(row.account_id),
        value: Number(row.value) || 0,
        stage: stageName(row.stage),
      })),
      appointments: [
        ...appointments.rows.map((row) => ({ account_id: String(row.account_id) })),
        ...messages.rows.map((row) => ({ account_id: String(row.account_id) })),
      ],
      broadcasts: broadcasts.rows
        .filter((row) => row.status === "sent" || row.status === "sending")
        .map((row) => ({ account_id: String(row.account_id), sent_count: Number(row.sent_count) || 0 })),
      emails: emails.rows
        .filter((row) => row.status === "sent")
        .map((row) => ({ account_id: String(row.account_id) })),
    };

    const membersByAccount = new Map<string, typeof profiles>();
    for (const profile of profiles ?? []) {
      const current = membersByAccount.get(profile.account_id) ?? [];
      current.push(profile);
      membersByAccount.set(profile.account_id, current);
    }

    return NextResponse.json({
      from,
      to,
      warnings,
      truncated: [contacts, deals, appointments, messages, broadcasts, emails].some((result) => result.rows.length >= ROW_LIMIT),
      accounts: accountRows.map((account) => {
        const members = membersByAccount.get(account.id) ?? [];
        const owner = members.find((member) => member.user_id === account.owner_user_id) ?? members[0] ?? null;
        return {
          id: account.id,
          name: account.name,
          created_at: account.created_at,
          member_count: members.length,
          owner: owner
            ? {
                full_name: owner.full_name,
                email: owner.email,
                photo_url: emailPhotoUrl(owner.email, owner.avatar_url),
              }
            : null,
          members: members.slice(0, 5).map((member) => ({
            full_name: member.full_name,
            email: member.email,
            photo_url: emailPhotoUrl(member.email, member.avatar_url),
          })),
          activity: summarizeAccountActivity(account.id, activity),
        };
      }),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
