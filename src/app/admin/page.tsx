"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, LockKeyhole, RefreshCw, ShieldAlert, UnlockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  PLATFORM_FEATURES,
  type PlatformFeatureAccess,
  type PlatformFeatureKey,
} from "@/lib/platform-features";

interface PlatformAccount {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  access_status: "approved" | "suspended";
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
  const [featureAccess, setFeatureAccess] = useState<PlatformFeatureAccess>(
    DEFAULT_PLATFORM_FEATURE_ACCESS,
  );
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresFailed, setFeaturesFailed] = useState(false);
  const [updatingFeature, setUpdatingFeature] = useState<PlatformFeatureKey | null>(null);

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

  const loadFeatures = useCallback(async () => {
    setFeaturesLoading(true);
    setFeaturesFailed(false);
    try {
      const response = await fetch("/api/platform-admin/features", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as liberações dos módulos.");
      const body = (await response.json()) as {
        features: { feature_key: PlatformFeatureKey; enabled: boolean }[];
      };
      const next = { ...DEFAULT_PLATFORM_FEATURE_ACCESS };
      for (const item of body.features) {
        if (item.feature_key in next) next[item.feature_key] = item.enabled;
      }
      setFeatureAccess(next);
    } catch {
      setFeaturesFailed(true);
    } finally {
      setFeaturesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  async function updateFeature(feature: PlatformFeatureKey, enabled: boolean) {
    setUpdatingFeature(feature);
    try {
      const response = await fetch("/api/platform-admin/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Não foi possível atualizar o acesso ao módulo.");
      }
      setFeatureAccess((current) => ({ ...current, [feature]: enabled }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o acesso ao módulo.");
    } finally {
      setUpdatingFeature(null);
    }
  }

  const memberTotal = accounts.reduce((total, account) => total + account.member_count, 0);

  async function deleteAccount(account: PlatformAccount) {
    if (!window.confirm(`Excluir a conta "${account.name}" e todos os dados associados? Esta ação não pode ser desfeita.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(account.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Não foi possível excluir a conta.");
      }
      await loadAccounts();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
    }
  }

  async function updateAccount(account: PlatformAccount, action: "suspend" | "reactivate") {
    const label = action === "suspend" ? "Desativar" : "Reativar";
    if (!window.confirm(`${label} temporariamente a conta "${account.name}"?`)) return;
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
          <Link href="/admin/requests" className="py-3 text-muted-foreground hover:text-foreground">Pedidos de criação</Link>
          <Link href="/admin/users" className="py-3 text-muted-foreground hover:text-foreground">{t("usersPage")}</Link>
        </nav>

        <section className="border-b border-border py-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Acesso aos módulos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle global. Módulos bloqueados ficam com cadeado para todos os usuários.
            </p>
          </div>
          {featuresFailed ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <span>Não foi possível carregar as liberações dos módulos.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadFeatures()}>
                <RefreshCw className="mr-2 size-4" />
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {PLATFORM_FEATURES.map((feature) => {
                const enabled = featureAccess[feature.key];
                const busy = featuresLoading || updatingFeature !== null;
                const StateIcon = enabled ? UnlockKeyhole : LockKeyhole;
                return (
                  <label
                    key={feature.key}
                    className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <StateIcon className={enabled ? "size-4 shrink-0 text-emerald-600" : "size-4 shrink-0 text-muted-foreground"} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{feature.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {featuresLoading ? "Carregando..." : enabled ? "Liberado" : "Bloqueado"}
                        </span>
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Liberar ${feature.label}`}
                      checked={enabled}
                      disabled={busy || featuresFailed}
                      onChange={(event) => void updateFeature(feature.key, event.target.checked)}
                      className="size-5 shrink-0 accent-primary"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>

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
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 font-medium">{t("created")}</th>
                    <th className="py-3 font-medium">Ações</th>
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
                      <td className="py-4 pr-4 capitalize">{account.access_status === "suspended" ? "Desativada" : "Ativa"}</td>
                      <td className="py-4 text-muted-foreground">
                        {new Date(account.created_at).toLocaleString()}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void updateAccount(account, account.access_status === "suspended" ? "reactivate" : "suspend")}
                          >
                            {account.access_status === "suspended" ? "Reativar" : "Desativar"}
                          </Button>
                          <Button type="button" size="sm" variant="destructive" onClick={() => void deleteAccount(account)}>
                            Excluir conta
                          </Button>
                        </div>
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
