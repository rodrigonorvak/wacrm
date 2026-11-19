"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/admin/user-avatar";
import {
  DATE_FILTER_LABELS,
  DATE_FILTER_OPTIONS,
  presetBounds,
  type DateFilter,
} from "@/lib/pipelines/date-filter";

interface StageStat {
  name: string;
  count: number;
  value: number;
}

interface OverviewAccount {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  owner: { full_name: string | null; email: string | null; photo_url: string | null } | null;
  members: Array<{ full_name: string | null; email: string | null; photo_url: string | null }>;
  activity: {
    leads: number;
    leads_ad: number;
    leads_organic: number;
    appointments: number;
    broadcasts: number;
    emails: number;
    deal_value: number;
    stages: StageStat[];
  };
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PlatformOverviewPage() {
  const [accounts, setAccounts] = useState<OverviewAccount[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<DateFilter>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    setFailed(false);
    const params = new URLSearchParams();
    if (filter === "custom") {
      if (customStart) params.set("from", new Date(`${customStart}T00:00:00`).toISOString());
      const endKey = customEnd || customStart;
      if (endKey) params.set("to", new Date(`${endKey}T23:59:59.999`).toISOString());
    } else {
      const bounds = presetBounds(filter);
      if (bounds) {
        params.set("from", bounds.start.toISOString());
        params.set("to", bounds.end.toISOString());
      }
    }
    try {
      const response = await fetch(`/api/platform-admin/overview?${params.toString()}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const data = (await response.json()) as { accounts: OverviewAccount[]; warnings?: string[] };
      setAccounts(data.accounts);
      setWarnings(data.warnings ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filter, customStart, customEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d2327]">Resultados</h2>
          <p className="text-sm text-[#646970]">Cada conta, no período escolhido.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as DateFilter)}
          className="h-10 rounded-full border border-[#dcdcde] bg-white px-4 text-sm"
          aria-label="Período"
        >
          {DATE_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>{DATE_FILTER_LABELS[option]}</option>
          ))}
        </select>
        {filter === "custom" && (
          <>
            <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="h-10 rounded-full border border-[#dcdcde] bg-white px-3 text-sm" aria-label="Data inicial" />
            <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="h-10 rounded-full border border-[#dcdcde] bg-white px-3 text-sm" aria-label="Data final" />
          </>
        )}
      </div>

      {warnings.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Alguns números não carregaram: {warnings.join(", ")}.
        </p>
      )}

      {denied ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <ShieldAlert className="size-8 text-amber-500" />
          <p className="max-w-md text-sm text-[#646970]">Esta conta não administra a plataforma.</p>
        </div>
      ) : failed ? (
        <p className="py-16 text-center text-sm text-red-600">Não foi possível carregar os resultados.</p>
      ) : loading ? (
        <p className="flex items-center justify-center py-16 text-sm text-[#646970]">
          <LoaderCircle className="mr-2 size-4 animate-spin" /> Carregando resultados...
        </p>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-2xl border border-[#e6ebf2] bg-white p-5 shadow-[0_8px_24px_rgb(15_23_42_/_4%)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={account.owner?.full_name || account.name} src={account.owner?.photo_url ?? null} size={48} />
                  <div className="min-w-0">
                    <Link href={`/admin/accounts/${account.id}`} className="block truncate text-base font-semibold text-[#1d2327] hover:text-[#e10c8c]">
                      {account.name}
                    </Link>
                    <p className="truncate text-sm text-[#646970]">
                      {account.owner?.full_name || account.owner?.email || "Sem responsável"} · criada em {new Date(account.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {account.members.map((member, index) => (
                    <span key={`${member.email}-${index}`} className={index === 0 ? "" : "-ml-2"} title={member.full_name || member.email || ""}>
                      <UserAvatar name={member.full_name || member.email || "?"} src={member.photo_url} size={32} />
                    </span>
                  ))}
                  {account.member_count > account.members.length && (
                    <span className="-ml-2 inline-flex size-8 items-center justify-center rounded-full bg-[#f4f7fb] text-xs font-semibold text-[#646970]">
                      +{account.member_count - account.members.length}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metric label="Leads de anúncio" value={String(account.activity.leads_ad)} />
                <Metric label="Leads orgânicos" value={String(account.activity.leads_organic)} />
                <Metric label="Valor dos negócios" value={money.format(account.activity.deal_value)} />
                <Metric label="Agendamentos" value={String(account.activity.appointments)} />
                <Metric label="Disparos" value={String(account.activity.broadcasts)} />
                <Metric label="E-mails enviados" value={String(account.activity.emails)} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {account.activity.stages.length === 0 ? (
                  <span className="text-xs text-[#646970]">Nenhum negócio neste período.</span>
                ) : account.activity.stages.map((stage) => (
                  <span key={stage.name} className="rounded-full bg-[#f7f9fc] px-3 py-1 text-xs text-[#1d2327]">
                    {stage.name}: {stage.count} · {money.format(stage.value)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f7f9fc] px-4 py-3">
      <p className="text-xs text-[#646970]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[#1d2327]">{value}</p>
    </div>
  );
}
