"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UserAccessBar({
  userId,
  accessStatus,
  onChanged,
}: {
  userId: string;
  accessStatus: "enabled" | "suspended";
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(action: "suspend" | "reactivate" | "delete") {
    if (action === "delete" && !window.confirm("Tem certeza que deseja excluir?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/platform-admin/users/${encodeURIComponent(userId)}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action === "delete" ? {} : { body: JSON.stringify({ action }) }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível atualizar o usuário.");
      if (action === "delete") {
        router.push("/admin/users");
        return;
      }
      onChanged?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {accessStatus === "suspended" ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void update("reactivate")}>Reativar</Button>
      ) : (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void update("suspend")}>Suspender</Button>
      )}
      <Button type="button" variant="destructive" disabled={busy} onClick={() => void update("delete")}>Excluir</Button>
    </div>
  );
}
