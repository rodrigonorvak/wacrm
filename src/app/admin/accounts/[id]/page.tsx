"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle, LockKeyhole, RefreshCw, ShieldAlert, UnlockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/admin/user-avatar";
import { UserAccessBar } from "@/components/admin/user-access-bar";
import {
  DEFAULT_PLATFORM_FEATURE_ACCESS,
  PLATFORM_FEATURES,
  type PlatformFeatureAccess,
  type PlatformFeatureKey,
} from "@/lib/platform-features";

interface AccountDetail {
  account: {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    owner_user_id: string;
    access_status: "approved" | "suspended";
  };
  members: Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    photo_url: string | null;
    role: string;
    joined_at: string;
  }>;
  integrations: {
    whatsapp: null | {
      status: string;
      connected_at: string | null;
      registered: boolean;
      has_error: boolean;
    };
    meta: Array<{
      source_type: string;
      active: boolean;
      last_tested_at: string | null;
      last_event_at: string | null;
      has_error: boolean;
    }>;
  };
  usage_summary: { contacts: number; conversations: number };
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function StatusText({ active, error, t }: {
  active: boolean;
  error: boolean;
  t: ReturnType<typeof useTranslations<'PlatformAdmin'>>;
}) {
  return (
    <span className={error ? "text-amber-600" : active ? "text-emerald-600" : "text-muted-foreground"}>
      {active ? t("active") : t("inactive")} · {error ? t("attention") : t("healthy")}
    </span>
  );
}

export default function PlatformAccountPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const accountId = params.id;
  const openedUserId = searchParams.get("user");
  const t = useTranslations("PlatformAdmin");
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [features, setFeatures] = useState<PlatformFeatureAccess>(DEFAULT_PLATFORM_FEATURE_ACCESS);
  const [featuresFailed, setFeaturesFailed] = useState(false);
  const [updatingFeature, setUpdatingFeature] = useState<PlatformFeatureKey | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberRole, setMemberRole] = useState("agent");
  const [creatingMember, setCreatingMember] = useState(false);
  const [openedAccess, setOpenedAccess] = useState<"enabled" | "suspended" | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setFailed(false);
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(accountId)}`, {
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
      setDetail((await response.json()) as AccountDetail);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const loadOpenedUser = useCallback(async () => {
    if (!openedUserId) {
      setOpenedAccess(null);
      return;
    }
    const response = await fetch(`/api/platform-admin/users/${encodeURIComponent(openedUserId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { user: { access_status: "enabled" | "suspended" } };
    setOpenedAccess(body.user.access_status);
  }, [openedUserId]);

  useEffect(() => {
    void loadOpenedUser();
  }, [loadOpenedUser]);

  const loadFeatures = useCallback(async () => {
    setFeaturesFailed(false);
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(accountId)}/features`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("features");
      const body = (await response.json()) as { features: PlatformFeatureAccess };
      setFeatures({ ...DEFAULT_PLATFORM_FEATURE_ACCESS, ...body.features });
    } catch {
      setFeaturesFailed(true);
    }
  }, [accountId]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  async function updateFeature(feature: PlatformFeatureKey, enabled: boolean) {
    setUpdatingFeature(feature);
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(accountId)}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Não foi possível atualizar a permissão.");
      }
      setFeatures((current) => ({ ...current, [feature]: enabled }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar a permissão.");
    } finally {
      setUpdatingFeature(null);
    }
  }

  async function toggleAccount() {
    if (!detail) return;
    const action = detail.account.access_status === "suspended" ? "reactivate" : "suspend";
    const label = action === "suspend" ? "Desativar" : "Reativar";
    if (!window.confirm(`${label} a conta "${detail.account.name}"?`)) return;
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(accountId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Não foi possível atualizar a conta.");
      }
      await loadDetail();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar a conta.");
    }
  }

  async function createMember(event: React.FormEvent) {
    event.preventDefault();
    setCreatingMember(true);
    try {
      const response = await fetch(`/api/platform-admin/accounts/${encodeURIComponent(accountId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: memberName,
          email: memberEmail,
          password: memberPassword,
          role: memberRole,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível criar o subusuário.");
      setMemberName("");
      setMemberEmail("");
      setMemberPassword("");
      setMemberRole("agent");
      await loadDetail();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível criar o subusuário.");
    } finally {
      setCreatingMember(false);
    }
  }

  const roleLabel: Record<string, string> = {
    owner: "Dono",
    admin: "Administrador",
    agent: "Atendente",
    viewer: "Visualizador",
  };

  return (
    <div>
      {openedUserId && openedAccess && (
        <UserAccessBar userId={openedUserId} accessStatus={openedAccess} onChanged={() => void loadOpenedUser()} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div>
          <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Voltar para contas</Link>
          <h2 className="mt-2 text-xl font-semibold">{detail?.account.name ?? t("account")}</h2>
          {detail && (
            <span className={detail.account.access_status === "suspended" ? "mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive" : "mt-1 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"}>
              {detail.account.access_status === "suspended" ? "Desativada" : "Ativa"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {detail && (
            <Button type="button" variant="outline" onClick={() => void toggleAccount()}>
              {detail.account.access_status === "suspended" ? "Reativar conta" : "Desativar conta"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadDetail()}
            disabled={loading}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span>{t("refresh")}</span>
          </Button>
        </div>
      </div>

      <div>
        {denied ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="size-8 text-amber-500" />
            <p className="max-w-md text-sm text-muted-foreground">{t("accessDenied")}</p>
          </div>
        ) : failed ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-destructive">{t("loadFailed")}</div>
        ) : loading || !detail ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />{t("loading")}
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-6 border-b border-border py-5 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">{t("members")}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{detail.members.length}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("contacts")}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{detail.usage_summary.contacts}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("conversations")}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{detail.usage_summary.conversations}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("created")}</p><p className="mt-1 text-sm">{formatDate(detail.account.created_at)}</p></div>
            </section>

            <section className="border-b border-border py-6">
              <h2 className="text-sm font-semibold">Permissões do CRM</h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Módulos bloqueados aparecem com cadeado para esta conta.
              </p>
              {featuresFailed ? (
                <p className="text-sm text-destructive">
                  Não foi possível carregar as permissões. Confirme que a migration 060 foi executada no Supabase.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {PLATFORM_FEATURES.map((feature) => {
                    const enabled = features[feature.key];
                    const StateIcon = enabled ? UnlockKeyhole : LockKeyhole;
                    return (
                      <label key={feature.key} className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <StateIcon className={enabled ? "size-4 shrink-0 text-emerald-600" : "size-4 shrink-0 text-muted-foreground"} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{feature.label}</span>
                            <span className="block text-xs text-muted-foreground">{enabled ? "Liberado" : "Bloqueado"}</span>
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Liberar ${feature.label}`}
                          checked={enabled}
                          disabled={updatingFeature !== null}
                          onChange={(event) => void updateFeature(feature.key, event.target.checked)}
                          className="size-5 shrink-0 accent-primary"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="border-b border-border py-6">
              <h2 className="mb-3 text-sm font-semibold">{t("integrationsHeading")}</h2>
              <ul className="divide-y divide-border">
                <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div><p className="font-medium">{t("whatsapp")}</p><p className="text-xs text-muted-foreground">{detail.integrations.whatsapp ? `${t("registered")}: ${detail.integrations.whatsapp.registered ? t("yes") : t("no")}` : t("noIntegration")}</p></div>
                  {detail.integrations.whatsapp ? <StatusText active={detail.integrations.whatsapp.status === "connected"} error={detail.integrations.whatsapp.has_error} t={t} /> : <span className="text-muted-foreground">—</span>}
                </li>
                {detail.integrations.meta.map((integration) => (
                  <li key={`${integration.source_type}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div><p className="font-medium">{t("meta")} · {integration.source_type}</p><p className="text-xs text-muted-foreground">{t("lastEvent")}: {formatDate(integration.last_event_at)} · {t("lastTest")}: {formatDate(integration.last_tested_at)}</p></div>
                    <StatusText active={integration.active} error={integration.has_error} t={t} />
                  </li>
                ))}
                {!detail.integrations.whatsapp && detail.integrations.meta.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">{t("noIntegration")}</li>
                )}
              </ul>
            </section>

            <section className="py-6">
              <h2 className="mb-1 text-sm font-semibold">Subusuários</h2>
              <p className="mb-4 text-xs text-[#646970]">Pessoas desta conta. O dono não pode ser criado de novo por aqui.</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {detail.members.map((member) => (
                  <article key={member.user_id} className="flex items-center gap-3 rounded-2xl border border-[#e6ebf2] bg-white p-4">
                    <UserAvatar name={member.full_name || member.email || "Usuário"} src={member.photo_url} size={48} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{member.full_name || member.email || "—"}</p>
                      <p className="truncate text-xs text-[#646970]">{member.email}</p>
                      <span className="mt-1 inline-flex rounded-full bg-[#f4f7fb] px-2 py-0.5 text-xs">{roleLabel[member.role] ?? member.role}</span>
                    </div>
                  </article>
                ))}
              </div>

              <form onSubmit={(event) => void createMember(event)} className="mt-5 grid gap-3 rounded-2xl border border-[#e6ebf2] bg-[#f7f9fc] p-4 sm:grid-cols-2">
                <h3 className="sm:col-span-2 text-sm font-semibold">Criar subusuário</h3>
                <input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Nome" className="h-10 rounded-xl border border-[#dcdcde] bg-white px-3 text-sm" />
                <input value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} type="email" required placeholder="E-mail" className="h-10 rounded-xl border border-[#dcdcde] bg-white px-3 text-sm" />
                <input value={memberPassword} onChange={(event) => setMemberPassword(event.target.value)} type="text" required minLength={12} placeholder="Senha temporária (mínimo 12)" className="h-10 rounded-xl border border-[#dcdcde] bg-white px-3 text-sm" />
                <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)} className="h-10 rounded-xl border border-[#dcdcde] bg-white px-3 text-sm" aria-label="Papel">
                  <option value="admin">Administrador</option>
                  <option value="agent">Atendente</option>
                  <option value="viewer">Visualizador</option>
                </select>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={creatingMember}>{creatingMember ? "Criando..." : "Criar subusuário"}</Button>
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
