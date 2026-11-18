"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { UserAvatar } from "@/components/admin/user-avatar";
import { UserAccessBar } from "@/components/admin/user-access-bar";

interface OpenedUser {
  id: string;
  email: string | null;
  full_name: string | null;
  photo_url: string | null;
  account_name: string | null;
  access_status: "enabled" | "suspended";
}

export default function OpenedUserPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<OpenedUser | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const response = await fetch(`/api/platform-admin/users/${encodeURIComponent(params.id)}`, { cache: "no-store" });
    if (!response.ok) {
      setFailed(true);
      return;
    }
    const body = (await response.json()) as { user: OpenedUser };
    setUser(body.user);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = user?.full_name || user?.email || "Usuário";

  return (
    <div>
      <Link href="/admin/users" className="text-xs text-[#646970] hover:text-[#1d2327]">← Voltar para usuários</Link>
      {!user && !failed ? (
        <p className="flex items-center py-16 text-sm text-[#646970]"><LoaderCircle className="mr-2 size-4 animate-spin" />Carregando usuário...</p>
      ) : failed || !user ? (
        <p className="py-16 text-sm text-red-600">Não foi possível abrir este usuário.</p>
      ) : (
        <div className="mt-4">
          <UserAccessBar userId={user.id} accessStatus={user.access_status} onChanged={() => void load()} />
          <div className="flex items-center gap-4 rounded-2xl border border-[#e6ebf2] bg-white p-5">
            <UserAvatar name={name} src={user.photo_url} size={72} />
            <div>
              <h2 className="text-xl font-semibold">{name}</h2>
              <p className="text-sm text-[#646970]">{user.email}</p>
              <p className="text-sm text-[#646970]">{user.account_name ?? "Sem conta"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
