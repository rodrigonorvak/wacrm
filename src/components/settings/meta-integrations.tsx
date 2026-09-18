"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPanelHead } from "./settings-panel-head";

type SourceType = "elementor" | "meta_instant_form";
type Pipeline = { id: string; name: string };
type Stage = { id: string; name: string; pipeline_id: string };
type Integration = {
  source_type: SourceType;
  pipeline_id: string;
  dataset_id: string;
  meta_page_id?: string | null;
  api_version: string;
  schedule_stage_id: string | null;
  purchase_stage_id: string | null;
  is_active: boolean;
};
type MetaEvent = {
  id: string;
  event_name: string;
  status: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
};

export function MetaIntegrations({ onBack }: { onBack?: () => void }) {
  const [supabase] = useState(() => createClient());
  const { canEditSettings } = useAuth();
  const [sourceType, setSourceType] = useState<SourceType>("elementor");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [scheduleStageId, setScheduleStageId] = useState("");
  const [purchaseStageId, setPurchaseStageId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<MetaEvent[]>([]);

  const selectedIntegration = integrations.find((item) => item.source_type === sourceType);
  const pipelineStages = stages.filter((stage) => stage.pipeline_id === pipelineId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [pipelineResult, integrationResult] = await Promise.all([
        supabase.from("pipelines").select("id, name").order("created_at"),
        fetch("/api/integrations/meta/config", { cache: "no-store" }).then((response) => response.json()),
      ]);
      if (cancelled) return;
      const nextPipelines = (pipelineResult.data ?? []) as Pipeline[];
      const nextIntegrations = (integrationResult.integrations ?? []) as Integration[];
      setPipelines(nextPipelines);
      setIntegrations(nextIntegrations);
      const eventsResult = await fetch(`/api/integrations/meta/events?source_type=${sourceType}`, { cache: "no-store" }).then((response) => response.json());
      setEvents((eventsResult.events ?? []) as MetaEvent[]);
      const current = nextIntegrations.find((item) => item.source_type === sourceType);
      setPipelineId(current?.pipeline_id ?? nextPipelines[0]?.id ?? "");
      setDatasetId(current?.dataset_id ?? "");
      setPageId(current?.meta_page_id ?? "");
      setScheduleStageId(current?.schedule_stage_id ?? "");
      setPurchaseStageId(current?.purchase_stage_id ?? "");
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        toast.error("Não foi possível carregar a integração Meta.");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sourceType, supabase]);

  useEffect(() => {
    if (!pipelineId) return;
    supabase
      .from("pipeline_stages")
      .select("id, name, pipeline_id")
      .eq("pipeline_id", pipelineId)
      .order("position")
      .then(({ data }) => setStages((data ?? []) as Stage[]));
  }, [pipelineId, supabase]);

  function handleSourceTypeChange(nextSourceType: SourceType) {
    const current = integrations.find((item) => item.source_type === nextSourceType);
    setSourceType(nextSourceType);
    setPipelineId(current?.pipeline_id ?? pipelines[0]?.id ?? "");
    setDatasetId(current?.dataset_id ?? "");
    setPageId(current?.meta_page_id ?? "");
    setScheduleStageId(current?.schedule_stage_id ?? "");
    setPurchaseStageId(current?.purchase_stage_id ?? "");
    setAccessToken("");
  }

  async function handleSave() {
    if (!pipelineId || !scheduleStageId || !purchaseStageId || !datasetId || (!selectedIntegration && !accessToken) || (sourceType === "meta_instant_form" && (!pageId || (!selectedIntegration && !pageAccessToken)))) {
      toast.error("Selecione a pipeline, as duas colunas e informe as credenciais.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/integrations/meta/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_type: sourceType,
        pipeline_id: pipelineId,
        schedule_stage_id: scheduleStageId,
        purchase_stage_id: purchaseStageId,
        dataset_id: datasetId,
        access_token: accessToken || undefined,
        meta_page_id: sourceType === "meta_instant_form" ? pageId : undefined,
        page_access_token: sourceType === "meta_instant_form" ? pageAccessToken || undefined : undefined,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast.error(result.error ?? "Não foi possível salvar a integração.");
      return;
    }
    setIntegrations((current) => [
      ...current.filter((item) => item.source_type !== sourceType),
      result.integration as Integration,
    ]);
    setAccessToken("");
    toast.success("Integração Meta salva.");
  }

  async function handleTest() {
    setTesting(true);
    const response = await fetch("/api/integrations/meta/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_type: sourceType }),
    });
    const result = await response.json();
    setTesting(false);
    if (!response.ok) {
      toast.error(result.error ?? "A conexão Meta falhou.");
      return;
    }
    toast.success("Conexão Meta validada.");
    setIntegrations((current) => current.map((item) => item.source_type === sourceType ? { ...item, is_active: true } : item));
  }

  async function handleRetry(eventId: string) {
    setRetryingEventId(eventId);
    const response = await fetch(`/api/integrations/meta/events/${eventId}/retry`, { method: "POST" });
    const result = await response.json();
    setRetryingEventId(null);
    if (!response.ok || result.status !== "sent") {
      toast.error(result.error ?? "Não foi possível reenviar o evento.");
      return;
    }
    setEvents((current) => current.map((event) => event.id === eventId ? { ...event, status: "sent", error_message: null, attempts: event.attempts + 1 } : event));
    toast.success("Evento reenviado para a Meta.");
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Integrações Meta"
        description="Conecte o CRM à Meta para enviar eventos de lead, reunião e pagamento confirmado."
      />
      {onBack ? (
        <Button variant="ghost" onClick={onBack} className="mb-3 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
          <ArrowLeft className="size-4" />
          Voltar para integrações
        </Button>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Radio className="size-4 text-primary" />
            Origem dos leads
          </CardTitle>
          <CardDescription>Escolha uma origem e relacione as colunas da pipeline aos eventos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 sm:max-w-sm">
            <Label>Origem</Label>
            <select
              value={sourceType}
              onChange={(event) => handleSourceTypeChange(event.target.value as SourceType)}
              disabled={loading || !canEditSettings}
              className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground"
            >
              <option value="elementor">Elementor</option>
              <option value="meta_instant_form">Meta Instant Forms</option>
            </select>
          </div>

          {pipelines.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
              Crie uma pipeline antes de configurar a integração Meta.
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:max-w-lg">
                <Label>Pipeline</Label>
                <select value={pipelineId} onChange={(event) => setPipelineId(event.target.value)} disabled={!canEditSettings} className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground">
                  {pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Coluna de reunião (Schedule)</Label>
                  <select value={scheduleStageId} onChange={(event) => setScheduleStageId(event.target.value)} disabled={!canEditSettings} className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground">
                    <option value="">Selecione uma coluna</option>
                    {pipelineStages.filter((stage) => stage.name !== "Novo Lead").map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Coluna de pagamento (Purchase)</Label>
                  <select value={purchaseStageId} onChange={(event) => setPurchaseStageId(event.target.value)} disabled={!canEditSettings} className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground">
                    <option value="">Selecione uma coluna</option>
                    {pipelineStages.filter((stage) => stage.name !== "Novo Lead").map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                  </select>
                </div>
              </div>
              {sourceType === "meta_instant_form" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label>Meta Page ID</Label><Input value={pageId} onChange={(event) => setPageId(event.target.value)} disabled={!canEditSettings} placeholder="ID da página Meta" /></div>
                  <div className="grid gap-2"><Label>Page Access Token</Label><Input type="password" value={pageAccessToken} onChange={(event) => setPageAccessToken(event.target.value)} disabled={!canEditSettings} placeholder={selectedIntegration ? "Token salvo; informe apenas para substituir" : "Token da página Meta"} /></div>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Novo Lead envia o evento Lead automaticamente e não pode ser escolhido nesta configuração.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2"><Label>Dataset ID</Label><Input value={datasetId} onChange={(event) => setDatasetId(event.target.value)} disabled={!canEditSettings} autoComplete="off" placeholder="ID do conjunto de dados" /></div>
                <div className="grid gap-2"><Label>Access Token</Label><Input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} disabled={!canEditSettings} placeholder={selectedIntegration ? "Token salvo; informe apenas para substituir" : "Cole o token da Meta"} /></div>
              </div>
              {canEditSettings ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSave} disabled={saving || loading}>{saving ? <><Loader2 className="size-4 animate-spin" /> Salvando...</> : "Salvar integração"}</Button>
                  {selectedIntegration ? <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? <><Loader2 className="size-4 animate-spin" /> Testando...</> : "Testar conexão"}</Button> : null}
                </div>
              ) : <p className="text-xs text-muted-foreground">Somente administradores podem alterar integrações.</p>}
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">Últimos eventos</p>
                {events.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Nenhum evento enviado ainda.</p> : (
                  <div className="mt-2 space-y-2">
                    {events.slice(0, 8).map((event) => <div key={event.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-foreground">{event.event_name}</span><span className="flex items-center gap-2 text-muted-foreground">{event.status}{event.error_message ? ` — ${event.error_message}` : ""}{event.status === "failed" ? <Button variant="outline" size="sm" onClick={() => handleRetry(event.id)} disabled={retryingEventId === event.id}>{retryingEventId === event.id ? <Loader2 className="size-3 animate-spin" /> : "Retry"}</Button> : null}</span></div>)}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
