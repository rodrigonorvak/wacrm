import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { isPlatformFeatureKey } from "@/lib/platform-features";

export async function GET() {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin()
      .from("platform_feature_access")
      .select("feature_key, enabled")
      .order("feature_key");
    if (error) {
      console.error("[platform-admin/features] load failed:", error.message);
      return NextResponse.json({ error: "Could not load feature access" }, { status: 500 });
    }

    return NextResponse.json({ features: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
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

    const { data, error } = await supabaseAdmin()
      .from("platform_feature_access")
      .upsert(
        {
          feature_key: body.feature,
          enabled: body.enabled,
          updated_by: platformAdmin.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "feature_key" },
      )
      .select("feature_key, enabled")
      .single();

    if (error || !data) {
      console.error("[platform-admin/features] update failed:", error?.message ?? "No row returned");
      return NextResponse.json({ error: "Could not update feature access" }, { status: 500 });
    }

    return NextResponse.json({ feature: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
