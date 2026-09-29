"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlatformAccount {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  owner: {
    user_id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export default function PlatformAdminPage() {
  const t = useTranslations("PlatformAdmin");
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setFailed(false);
    try {
      const response = await fetch("/api/platform-admin/accounts", {
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
        accounts: PlatformAccount[];
        truncated: boolean;
      };
      setAccounts(data.accounts);
      setTruncated(data.truncated);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const memberTotal = accounts.reduce((total, account) => total + account.member_count, 0);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">CRM Malybo</p>
            <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadAccounts()}
            disabled={loading}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span>{t("refresh")}</span>
          </Button>
        </header>

        <nav className="flex gap-5 border-b border-border text-sm" aria-label="Platform administration">
          <Link href="/admin" aria-current="page" className="border-b-2 border-primary py-3 font-medium text-foreground">{t("accountsPage")}</Link>
          <Link href="/admin/users" className="py-3 text-muted-foreground hover:text-foreground">{t("usersPage")}</Link>
        </nav>

        <section className="grid grid-cols-2 gap-6 border-b border-border py-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("accounts")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : accounts.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("members")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : memberTotal}</p>
          </div>
        </section>

        {denied ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="size-8 text-amber-500" />
            <p className="max-w-md text-sm text-muted-foreground">{t("accessDenied")}</p>
          </div>
        ) : failed ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-destructive">
            {t("loadFailed")}
          </div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">{t("account")}</th>
                    <th className="py-3 pr-4 font-medium">{t("owner")}</th>
                    <th className="py-3 pr-4 font-medium">{t("members")}</th>
                    <th className="py-3 font-medium">{t("created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-border/70 align-top">
                      <td className="py-4 pr-4">
                        <Link href={`/admin/accounts/${encodeURIComponent(account.id)}`} className="font-medium text-primary hover:underline">{account.name}</Link>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{account.id}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <p>{account.owner?.full_name || account.owner?.email || "—"}</p>
                        {account.owner?.full_name && account.owner.email && (
                          <p className="mt-1 text-xs text-muted-foreground">{account.owner.email}</p>
                        )}
                      </td>
                      <td className="py-4 pr-4 tabular-nums">{account.member_count}</td>
                      <td className="py-4 text-muted-foreground">
                        {new Date(account.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {truncated && (
              <p className="border-t border-border py-3 text-xs text-muted-foreground">
                {t("truncated")}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
