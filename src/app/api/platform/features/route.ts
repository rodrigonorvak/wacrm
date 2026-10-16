import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  ALL_PLATFORM_FEATURES_ENABLED,
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  isPlatformFeatureKey,
} from "@/lib/platform-features";

// Module access for the signed-in user's account. Platform administrators
// always get every module so they can maintain the CRM themselves.
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
  const headers = { "Cache-Control": "no-store" };

  const [adminResult, profileResult] = await Promise.all([
    admin
      .from("platform_admins")
      .select("active")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin.from("profiles").select("account_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (adminResult.data?.active === true) {
    return NextResponse.json({ features: ALL_PLATFORM_FEATURES_ENABLED }, { headers });
  }

  const accountId = profileResult.data?.account_id;
  if (profileResult.error || !accountId) {
    return NextResponse.json({ features: DEFAULT_PLATFORM_FEATURE_ACCESS }, { headers });
  }

  const { data, error } = await admin
    .from("account_feature_access")
    .select("feature_key, enabled")
    .eq("account_id", accountId);
  if (error) {
    console.error("[platform/features] access lookup failed:", error.message);
    return NextResponse.json({ error: "Could not load feature access" }, { status: 500 });
  }

  const features = { ...DEFAULT_PLATFORM_FEATURE_ACCESS };
  for (const row of data ?? []) {
    if (isPlatformFeatureKey(row.feature_key)) features[row.feature_key] = row.enabled;
  }
  return NextResponse.json({ features }, { headers });
}
