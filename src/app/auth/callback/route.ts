import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    const error = requestUrl.searchParams.get("error_description")
      ?? requestUrl.searchParams.get("error")
      ?? "Não foi possível concluir o login com Google";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] OAuth exchange failed:", error.message);
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("Não foi possível concluir o login com Google")}`,
        requestUrl.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL(
      safeNextPath(requestUrl.searchParams.get("next")),
      requestUrl.origin,
    ),
  );
}
