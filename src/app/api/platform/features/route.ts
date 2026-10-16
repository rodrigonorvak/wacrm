import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  isPlatformFeatureKey,
} from "@/lib/platform-features";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("platform_feature_access")
    .select("feature_key, enabled");

  if (error) {
    console.error("[platform/features] access lookup failed:", error.message);
    return NextResponse.json({ error: "Could not load feature access" }, { status: 500 });
  }

  const features = { ...DEFAULT_PLATFORM_FEATURE_ACCESS };
  for (const row of data ?? []) {
    if (isPlatformFeatureKey(row.feature_key)) features[row.feature_key] = row.enabled;
  }

  return NextResponse.json({ features }, { headers: { "Cache-Control": "no-store" } });
}
