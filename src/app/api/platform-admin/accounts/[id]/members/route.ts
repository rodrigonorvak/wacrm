import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { parseNewMemberInput } from "@/lib/auth/member-provisioning";
import { supabaseAdmin } from "@/lib/flows/admin-client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }

    const { id: accountId } = await params;
    if (!UUID_PATTERN.test(accountId)) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    const parsed = parseNewMemberInput(await request.json().catch(() => null));
    if (!parsed.ok) {
      const message = parsed.error === "A valid email is required"
        ? "Informe um e-mail válido."
        : parsed.error === "Temporary password must be between 12 and 128 characters"
          ? "A senha temporária precisa ter entre 12 e 128 caracteres."
          : parsed.error === "Role must be admin, agent, or viewer"
            ? "Escolha o papel de administrador, atendente ou visualizador."
            : "Não foi possível ler os dados do subusuário.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError || !account) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.value.email,
      password: parsed.value.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.value.fullName || parsed.value.email.split("@")[0],
      },
      app_metadata: {
        member_provisioning_account_id: accountId,
        member_provisioning_role: parsed.value.role,
      },
    });

    if (error?.code === "email_exists") {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }
    if (error?.code === "weak_password") {
      return NextResponse.json({ error: "A senha foi recusada por ser fraca." }, { status: 400 });
    }
    if (error || !data.user) {
      console.error("[platform-admin/members] create failed:", error?.message);
      return NextResponse.json({ error: "Não foi possível criar o subusuário." }, { status: 500 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, account_id, account_role")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile || profile.account_id !== accountId) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: "O usuário foi criado, mas não entrou nesta conta." }, { status: 500 });
    }

    return NextResponse.json({
      member: {
        user_id: data.user.id,
        email: parsed.value.email,
        role: profile.account_role,
      },
    }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
