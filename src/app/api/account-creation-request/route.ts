import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: request, error } = await supabase
    .from("account_creation_requests")
    .select("id, full_name, email, company, phone, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[account-creation-request] lookup failed:", error.message);
    return NextResponse.json({ error: "Não foi possível carregar o pedido" }, { status: 500 });
  }

  return NextResponse.json({ request });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  const fullName = typeof values.fullName === "string" ? values.fullName.trim() : "";
  const company = typeof values.company === "string" ? values.company.trim() : "";
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";

  if (!fullName || !company || !phone) {
    return NextResponse.json(
      { error: "Nome completo, empresa e telefone são obrigatórios" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("account_creation_requests")
    .update({ full_name: fullName, company, phone })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[account-creation-request] update failed:", error.message);
    return NextResponse.json({ error: "Não foi possível enviar o pedido" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Pedido não encontrado ou já decidido" }, { status: 409 });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("user_id", user.id);
  if (profileError) {
    console.error("[account-creation-request] profile update failed:", profileError.message);
    return NextResponse.json({ error: "Não foi possível atualizar o perfil" }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
