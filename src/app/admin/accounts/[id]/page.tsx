"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccountDetail {
  account: {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    owner_user_id: string;
  };
  members: Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
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
  const accountId = params.id;
  const t = useTranslations("PlatformAdmin");
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">CRM Malybo</p>
            <h1 className="mt-2 text-2xl font-semibold">{detail?.account.name ?? t("account")}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{accountId}</p>
          </div>
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
        </header>

        <nav className="flex gap-5 border-b border-border text-sm" aria-label="Platform administration">
          <Link href="/admin" className="py-3 text-muted-foreground hover:text-foreground">{t("accountsPage")}</Link>
          <Link href="/admin/users" className="py-3 text-muted-foreground hover:text-foreground">{t("usersPage")}</Link>
          <Link href={`/admin/accounts/${encodeURIComponent(accountId)}`} aria-current="page" className="border-b-2 border-primary py-3 font-medium text-foreground">{t("account")}</Link>
        </nav>

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
              <h2 className="mb-3 text-sm font-semibold">{t("membersHeading")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3 pr-4 font-medium">{t("owner")}</th><th className="py-3 pr-4 font-medium">{t("role")}</th><th className="py-3 font-medium">{t("joined")}</th></tr></thead>
                  <tbody>{detail.members.map((member) => (
                    <tr key={member.user_id} className="border-b border-border/70">
                      <td className="py-3 pr-4"><p className="font-medium">{member.full_name || member.email || "—"}</p>{member.full_name && <p className="text-xs text-muted-foreground">{member.email}</p>}</td>
                      <td className="py-3 pr-4">{member.role}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(member.joined_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
