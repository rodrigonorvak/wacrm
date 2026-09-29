"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlatformUser {
  id: string;
  email: string | null;
  full_name: string | null;
  account_id: string | null;
  account_name: string | null;
  account_role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  access_status: "enabled" | "suspended";
}

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function PlatformUsersPage() {
  const t = useTranslations("PlatformAdmin");
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">CRM Malybo</p>
            <h1 className="mt-2 text-2xl font-semibold">{t("usersPage")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
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
        </header>

        <nav className="flex gap-5 border-b border-border text-sm" aria-label="Platform administration">
          <Link href="/admin" className="py-3 text-muted-foreground hover:text-foreground">{t("accountsPage")}</Link>
          <Link href="/admin/users" aria-current="page" className="border-b-2 border-primary py-3 font-medium text-foreground">{t("usersPage")}</Link>
        </nav>

        <section className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border py-5">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">{t("email")}</th>
                    <th className="py-3 pr-4 font-medium">{t("account")}</th>
                    <th className="py-3 pr-4 font-medium">{t("members")}</th>
                    <th className="py-3 pr-4 font-medium">{t("confirmed")}</th>
                    <th className="py-3 pr-4 font-medium">{t("access")}</th>
                    <th className="py-3 pr-4 font-medium">{t("createdAt")}</th>
                    <th className="py-3 font-medium">{t("lastLogin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border/70 align-top">
                      <td className="py-4 pr-4">
                        <p className="font-medium">{user.email ?? "—"}</p>
                        {user.full_name && <p className="mt-1 text-xs text-muted-foreground">{user.full_name}</p>}
                      </td>
                      <td className="py-4 pr-4">
                        {user.account_name ?? t("noProfile")}
                        {user.account_id && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{user.account_id}</p>}
                      </td>
                      <td className="py-4 pr-4">{user.account_role ?? "—"}</td>
                      <td className="py-4 pr-4 text-muted-foreground">{user.email_confirmed ? t("confirmed") : t("unconfirmed")}</td>
                      <td className="py-4 pr-4">{t(user.access_status)}</td>
                      <td className="py-4 pr-4 text-muted-foreground">{formatDate(user.created_at)}</td>
                      <td className="py-4 text-muted-foreground">{formatDate(user.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </main>
  );
}
