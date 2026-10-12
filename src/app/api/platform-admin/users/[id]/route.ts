import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }
    const { id } = await context.params;
    const body = (await request.json()) as { action?: unknown };
    if (body.action !== "suspend" && body.action !== "reactivate") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const banned = body.action === "suspend";
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: banned ? "876000h" : "none",
    });
    if (authError) {
      console.error("[platform-admin/users] access update failed:", authError.message);
      return NextResponse.json({ error: "Failed to update user access" }, { status: 500 });
    }
    const { error: profileError } = await admin
      .from("profiles")
      .update({ access_status: banned ? "suspended" : "approved" })
      .eq("user_id", id);
    if (profileError) {
      console.error("[platform-admin/users] profile access update failed:", profileError.message);
      return NextResponse.json({ error: "Failed to update profile access" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const platformAdmin = await requirePlatformAdmin();
    if (platformAdmin.role !== "super_admin") {
      return NextResponse.json({ error: "Super administrator access required" }, { status: 403 });
    }
    const { id } = await context.params;
    if (id === platformAdmin.userId) {
      return NextResponse.json({ error: "You cannot delete your own administrator account" }, { status: 400 });
    }
    const admin = supabaseAdmin();
    const { error: accountError } = await admin
      .from("accounts")
      .delete()
      .eq("owner_user_id", id);
    if (accountError) {
      console.error("[platform-admin/users] owned account deletion failed:", accountError.message);
      return NextResponse.json({ error: "Failed to delete the user's account data" }, { status: 500 });
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      console.error("[platform-admin/users] deletion failed:", error.message);
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
