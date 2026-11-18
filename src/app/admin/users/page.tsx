"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/admin/user-avatar";

interface PlatformUser {
  id: string;
  email: string | null;
  full_name: string | null;
  photo_url: string | null;
  account_id: string | null;
  account_name: string | null;
  account_role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  access_status: "enabled" | "suspended";
  profile_status: "pending" | "approved" | "denied" | "suspended";
}

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  agent: "Atendente",
  viewer: "Visualizador",
};

export default function PlatformUsersPage() {
  const t = useTranslations("PlatformAdmin");
  const router = useRouter();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setFailed(false);
    try {
      const response = await fetch(`/api/platform-admin/users?page=${page}`, {
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const data = (await response.json()) as {
        users: PlatformUser[];
        hasMore: boolean;
      };
      setUsers(data.users);
      setHasMore(data.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const unlinkedCount = users.filter((user) => !user.account_id).length;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    if (!normalizedQuery) return true;
    return [user.email, user.full_name, user.account_name, user.account_role]
      .some((value) => value?.toLowerCase().includes(normalizedQuery));
  });

  return (
    <div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <h2 className="text-lg font-semibold">{t("usersPage")}</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadUsers()}
            disabled={loading}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span>{t("refresh")}</span>
          </Button>
        </div>
        <label className="mb-4 block max-w-md">
          <span className="sr-only">Buscar usuário</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail ou conta"
            className="h-10 w-full rounded-md border border-[#8c8f94] bg-white px-3 text-sm"
          />
        </label>
        <section className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-md border border-[#dcdcde] bg-white px-4 py-4 shadow-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("usersPage")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : users.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("unlinkedCount")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : unlinkedCount}</p>
          </div>
        </section>

        {denied ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="size-8 text-amber-500" />
            <p className="max-w-md text-sm text-muted-foreground">{t("accessDenied")}</p>
          </div>
        ) : failed ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-destructive">{t("loadFailed")}</div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />{t("loading")}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleUsers.map((user) => {
                const name = user.full_name || user.email || "Usuário";
                return (
                  <article
                    key={user.id}
                    className="rounded-2xl border border-[#e6ebf2] bg-white p-5 text-center shadow-[0_8px_24px_rgb(15_23_42_/_4%)]"
                  >
                    <UserAvatar name={name} src={user.photo_url} size={72} />
                    <p className="mt-3 truncate text-base font-semibold text-[#1d2327]">{name}</p>
                    <p className="truncate text-sm text-[#646970]">{user.email ?? "Sem e-mail"}</p>
                    <p className="mt-1 truncate text-xs text-[#646970]">{user.account_name ?? "Sem conta"}</p>
                    <span className="mt-3 inline-flex rounded-full bg-[#f4f7fb] px-3 py-1 text-xs font-medium text-[#1d2327]">
                      {user.account_role ? ROLE_LABELS[user.account_role] ?? user.account_role : "Sem papel"}
                    </span>
                    <p className="mt-3 text-xs text-[#646970]">Último acesso {formatDate(user.last_sign_in_at)}</p>
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={() => router.push(user.account_id
                        ? `/admin/accounts/${user.account_id}?user=${user.id}`
                        : `/admin/users/${user.id}`)}
                    >
                      Abrir
                    </Button>
                  </article>
                );
              })}
            </div>

            <footer className="flex items-center justify-between border-t border-border py-4">
              <span className="text-xs text-muted-foreground">{t("page", { page })} · {PAGE_SIZE} / page</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={loading || page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("previous")}</Button>
                <Button type="button" variant="outline" disabled={loading || !hasMore} onClick={() => setPage((current) => current + 1)}>{t("next")}</Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
