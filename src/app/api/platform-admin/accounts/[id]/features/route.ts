import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  isPlatformFeatureKey,
} from "@/lib/platform-features";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin()
      .from("account_feature_access")
      .select("feature_key, enabled")
      .eq("account_id", id);
    if (error) {
      console.error("[platform-admin/account-features] load failed:", error.message);
      return NextResponse.json({ error: "Could not load feature access" }, { status: 500 });
    }

    const features = { ...DEFAULT_PLATFORM_FEATURE_ACCESS };
    for (const row of data ?? []) {
      if (isPlatformFeatureKey(row.feature_key)) features[row.feature_key] = row.enabled;
    }
    return NextResponse.json({ features }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let body: { feature?: unknown; enabled?: unknown };
    try {
      body = (await request.json()) as { feature?: unknown; enabled?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!isPlatformFeatureKey(body.feature) || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid feature access update" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (accountError || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { error } = await admin.from("account_feature_access").upsert(
      {
        account_id: id,
        feature_key: body.feature,
        enabled: body.enabled,
        updated_by: platformAdmin.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,feature_key" },
    );
    if (error) {
      console.error("[platform-admin/account-features] update failed:", error.message);
      return NextResponse.json({ error: "Could not update feature access" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
