import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";

export async function GET() {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin()
      .from("account_creation_requests")
      .select("id, user_id, account_id, full_name, email, company, phone, status, denial_reason, created_at, decided_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[platform-admin/account-requests] list failed:", error.message);
      return NextResponse.json({ error: "Failed to load account requests" }, { status: 500 });
    }
    const completeRequests = (data ?? []).filter(
      (accountRequest) => accountRequest.company.trim() && accountRequest.phone.trim(),
    );
    return NextResponse.json({ requests: completeRequests });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }

    const body = (await request.json()) as {
      requestId?: unknown;
      action?: unknown;
      denialReason?: unknown;
    };
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const action = body.action === "approve" || body.action === "deny" ? body.action : "";
    if (!requestId || !action) {
      return NextResponse.json({ error: "requestId and a valid action are required" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    if (action === "approve") {
      const { data, error } = await admin.rpc("approve_account_creation_request", {
        p_request_id: requestId,
        p_decided_by: platformAdmin.userId,
      });
      if (error) {
        console.error("[platform-admin/account-requests] approval failed:", error.message);
        return NextResponse.json({ error: "Failed to approve account request" }, { status: 500 });
      }
      if (data !== true) return NextResponse.json({ error: "Request is no longer pending" }, { status: 409 });
    } else {
      const denialReason = typeof body.denialReason === "string" ? body.denialReason.trim() : null;
      const { data: requestRow, error: lookupError } = await admin
        .from("account_creation_requests")
        .select("id, user_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (lookupError) {
        console.error("[platform-admin/account-requests] lookup failed:", lookupError.message);
        return NextResponse.json({ error: "Failed to load account request" }, { status: 500 });
      }
      if (!requestRow || requestRow.status !== "pending") {
        return NextResponse.json({ error: "Request is no longer pending" }, { status: 409 });
      }
      const { error: updateError } = await admin
        .from("account_creation_requests")
        .update({ status: "denied", denial_reason: denialReason, decided_by: platformAdmin.userId, decided_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updateError) {
        console.error("[platform-admin/account-requests] denial failed:", updateError.message);
        return NextResponse.json({ error: "Failed to deny account request" }, { status: 500 });
      }
      const { error: profileError } = await admin
        .from("profiles")
        .update({ access_status: "denied" })
        .eq("user_id", requestRow.user_id);
      if (profileError) {
        console.error("[platform-admin/account-requests] profile denial failed:", profileError.message);
        return NextResponse.json({ error: "Failed to deny account access" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
