"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PLATFORM_FEATURES } from "@/lib/platform-features";

interface PlatformAccount {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  access_status: "approved" | "suspended";
  features: Record<string, boolean>;
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
      const response = await fetch("/api/platform-admin/accounts", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const data = (await response.json()) as { accounts: PlatformAccount[]; truncated: boolean };
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
  const suspendedTotal = accounts.filter((account) => account.access_status === "suspended").length;

  async function updateAccount(account: PlatformAccount, action: "suspend" | "reactivate") {
    const label = action === "suspend" ? "Desativar" : "Reativar";
    if (!window.confirm(`${label} a conta "${account.name}"?`)) return;
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? `Não foi possível ${label.toLowerCase()} a conta.`);
      }
      await loadAccounts();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : `Não foi possível ${label.toLowerCase()} a conta.`);
    }
  }

  const stats = [
    { label: "Contas", value: accounts.length },
    { label: "Ativas", value: accounts.length - suspendedTotal },
    { label: "Desativadas", value: suspendedTotal },
    { label: "Usuários", value: memberTotal },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Contas</h2>
        <Button type="button" variant="outline" onClick={() => void loadAccounts()} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          <span>{t("refresh")}</span>
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : stat.value}</p>
          </div>
        ))}
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
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          {t("loading")}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">{t("empty")}</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Conta</th>
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <th className="px-4 py-3 font-medium">Usuários</th>
                  <th className="px-4 py-3 font-medium">Módulos liberados</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const suspended = account.access_status === "suspended";
                  const enabled = PLATFORM_FEATURES.filter((feature) => account.features[feature.key]);
                  return (
                    <tr key={account.id} className="border-t border-border/70 align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/accounts/${encodeURIComponent(account.id)}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {account.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Criada em {new Date(account.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{account.owner?.full_name || account.owner?.email || "—"}</p>
                        {account.owner?.full_name && account.owner.email && (
                          <p className="mt-1 text-xs text-muted-foreground">{account.owner.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{account.member_count}</td>
                      <td className="px-4 py-3">
                        {enabled.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhum</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {enabled.map((feature) => (
                              <span key={feature.key} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                                {feature.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={suspended ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive" : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"}>
                          {suspended ? "Desativada" : "Ativa"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/accounts/${encodeURIComponent(account.id)}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Gerenciar
                          </Link>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void updateAccount(account, suspended ? "reactivate" : "suspend")}
                          >
                            {suspended ? "Reativar" : "Desativar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {truncated && <p className="text-xs text-muted-foreground">{t("truncated")}</p>}
        </>
      )}
    </div>
  );
}
