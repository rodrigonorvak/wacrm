"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DealLabel } from "@/types";

export const DEAL_LABEL_COLORS = [
  "#61bd4f",
  "#f2d600",
  "#ff9f1a",
  "#eb5a46",
  "#c377e0",
  "#0079bf",
  "#00c2e0",
  "#51e898",
  "#ff78cb",
  "#344563",
];

const INITIAL_VISIBLE = 5;

const WEBHOOK_EVENT_SUGGESTIONS = [
  "myeduzz.contract_pix_attempted",
  "myeduzz.contract_card_attempted",
  "myeduzz.contract_bankslip_attempted",
  "myeduzz.invoice_paid",
  "sun.cart_abandonment",
  "nutror.enrollment_created",
];

interface DealLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  accountId: string | null;
  selected: DealLabel[];
  canEdit?: boolean;
  onChange: (dealId: string, labels: DealLabel[]) => void;
}

type EditorState = {
  id: string | null;
  name: string;
  color: string;
  webhookEvent: string;
  conditionPath: string;
  conditionValue: string;
} | null;

export function DealLabelsDialog({
  open,
  onOpenChange,
  dealId,
  accountId,
  selected,
  canEdit = true,
  onChange,
}: DealLabelsDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [labels, setLabels] = useState<DealLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [busy, setBusy] = useState(false);

  const loadLabels = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("deal_labels")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at");
    if (error) toast.error("Não foi possível carregar as etiquetas");
    setLabels((data ?? []) as DealLabel[]);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setShowAll(false);
    setEditor(null);
    void loadLabels();
  }, [open, loadLabels]);

  const selectedIds = new Set(selected.map((label) => label.id));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = labels.filter((label) => label.name.toLowerCase().includes(normalizedQuery));
  const visible = showAll || normalizedQuery ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  async function toggle(label: DealLabel) {
    if (!accountId || !canEdit || busy) return;
    setBusy(true);
    const isSelected = selectedIds.has(label.id);
    const { error } = isSelected
      ? await supabase.from("deal_label_links").delete().eq("deal_id", dealId).eq("label_id", label.id)
      : await supabase
          .from("deal_label_links")
          .insert({ deal_id: dealId, label_id: label.id, account_id: accountId });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível atualizar a etiqueta");
      return;
    }
    onChange(dealId, isSelected ? selected.filter((item) => item.id !== label.id) : [...selected, label]);
  }

  async function saveEditor() {
    if (!editor || !accountId || busy) return;
    setBusy(true);
    const name = editor.name.trim();
    const webhookEvent = editor.webhookEvent.trim() || null;
    const conditionPath = webhookEvent ? editor.conditionPath.trim() || null : null;
    const conditionValue = conditionPath ? editor.conditionValue.trim() || null : null;
    if (!name) {
      setBusy(false);
      toast.error("Informe o título da etiqueta");
      return;
    }
    if (conditionPath && !conditionValue) {
      setBusy(false);
      toast.error("Informe o valor da condição");
      return;
    }
    const sameRule = (item: DealLabel) =>
      item.webhook_event === webhookEvent &&
      (item.webhook_condition_path ?? null) === conditionPath &&
      (item.webhook_condition_value ?? null) === conditionValue;
    const duplicateEvent = webhookEvent
      ? labels.find((item) => sameRule(item) && item.id !== editor.id)
      : null;
    if (duplicateEvent) {
      setBusy(false);
      toast.error(`Essa regra já está vinculada à etiqueta "${duplicateEvent.name}"`);
      return;
    }
    const rule = {
      webhook_event: webhookEvent,
      webhook_condition_path: conditionPath,
      webhook_condition_value: conditionValue,
    };
    if (editor.id) {
      const { data, error } = await supabase
        .from("deal_labels")
        .update({ name, color: editor.color, ...rule })
        .eq("id", editor.id)
        .select()
        .single();
      setBusy(false);
      if (error || !data) {
        toast.error("Não foi possível salvar a etiqueta");
        return;
      }
      const updated = data as DealLabel;
      setLabels((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedIds.has(updated.id)) {
        onChange(dealId, selected.map((item) => (item.id === updated.id ? updated : item)));
      }
    } else {
      const { data, error } = await supabase
        .from("deal_labels")
        .insert({ account_id: accountId, name, color: editor.color, ...rule })
        .select()
        .single();
      setBusy(false);
      if (error || !data) {
        toast.error("Não foi possível criar a etiqueta");
        return;
      }
      setLabels((current) => [...current, data as DealLabel]);
    }
    setEditor(null);
  }

  async function deleteEditorLabel() {
    if (!editor?.id || busy) return;
    setBusy(true);
    const { error } = await supabase.from("deal_labels").delete().eq("id", editor.id);
    setBusy(false);
    if (error) {
      toast.error("Não foi possível excluir a etiqueta");
      return;
    }
    const removedId = editor.id;
    setLabels((current) => current.filter((item) => item.id !== removedId));
    if (selectedIds.has(removedId)) onChange(dealId, selected.filter((item) => item.id !== removedId));
    setEditor(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-3 overflow-y-auto sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-center text-sm">
            {editor && (
              <button
                type="button"
                aria-label="Voltar"
                onClick={() => setEditor(null)}
                className="absolute left-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            {editor ? (editor.id ? "Editar etiqueta" : "Criar etiqueta") : "Etiquetas"}
          </DialogTitle>
          <DialogDescription className="sr-only">Escolha ou edite as etiquetas do card</DialogDescription>
        </DialogHeader>

        {editor ? (
          <div className="space-y-3">
            <div
              className="flex h-8 items-center rounded-md px-3 text-sm font-semibold text-white"
              style={{ backgroundColor: editor.color }}
            >
              <span className="truncate">{editor.name || "\u00A0"}</span>
            </div>
            <div className="space-y-1">
              <label htmlFor="deal-label-name" className="text-xs font-semibold text-muted-foreground">
                Título
              </label>
              <Input
                id="deal-label-name"
                autoFocus
                value={editor.name}
                maxLength={40}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="deal-label-webhook-event" className="text-xs font-semibold text-muted-foreground">
                Evento do webhook (opcional)
              </label>
              <Input
                id="deal-label-webhook-event"
                list="deal-label-webhook-events"
                value={editor.webhookEvent}
                maxLength={120}
                placeholder="myeduzz.invoice_paid"
                onChange={(event) => setEditor({ ...editor, webhookEvent: event.target.value })}
              />
              <datalist id="deal-label-webhook-events">
                {WEBHOOK_EVENT_SUGGESTIONS.map((event) => (
                  <option key={event} value={event} />
                ))}
              </datalist>
              {editor.webhookEvent.trim() && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Input
                    value={editor.conditionPath}
                    maxLength={120}
                    placeholder="Campo (ex.: data.payment.method)"
                    onChange={(event) => setEditor({ ...editor, conditionPath: event.target.value })}
                  />
                  <Input
                    value={editor.conditionValue}
                    maxLength={120}
                    placeholder="Valor (ex.: pix)"
                    disabled={!editor.conditionPath.trim()}
                    onChange={(event) => setEditor({ ...editor, conditionValue: event.target.value })}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Quando esse evento chegar pela integração, o card recebe esta etiqueta e perde as outras etiquetas de evento.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Selecione uma cor</p>
              <div className="grid grid-cols-5 gap-1.5">
                {DEAL_LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Cor ${color}`}
                    onClick={() => setEditor({ ...editor, color })}
                    className="flex h-8 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: color }}
                  >
                    {editor.color === color && <Check className="size-4" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" size="sm" disabled={busy} onClick={() => void saveEditor()}>
                {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
                {editor.id ? "Salvar" : "Criar"}
              </Button>
              {editor.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void deleteEditorLabel()}
                >
                  <Trash2 className="mr-1 size-3.5" /> Excluir
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder="Buscar etiquetas…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Etiquetas</p>
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : visible.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {labels.length === 0 ? "Nenhuma etiqueta criada ainda" : "Nenhuma etiqueta encontrada"}
                </p>
              ) : (
                visible.map((label) => {
                  const checked = selectedIds.has(label.id);
                  return (
                    <div key={label.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={!canEdit}
                        onClick={() => void toggle(label)}
                        className="flex min-w-0 flex-1 items-center gap-2 disabled:opacity-60"
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span
                          className="flex h-8 min-w-0 flex-1 items-center rounded-md px-3 text-left text-sm font-semibold text-white"
                          style={{ backgroundColor: label.color }}
                        >
                          <span className="truncate">{label.name}</span>
                        </span>
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar etiqueta ${label.name}`}
                          onClick={() => setEditor({ id: label.id, name: label.name, color: label.color, webhookEvent: label.webhook_event ?? "", conditionPath: label.webhook_condition_path ?? "", conditionValue: label.webhook_condition_value ?? "" })}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setEditor({ id: null, name: "", color: DEAL_LABEL_COLORS[0], webhookEvent: "", conditionPath: "", conditionValue: "" })}
              >
                Criar uma nova etiqueta
              </Button>
            )}
            {!showAll && !normalizedQuery && filtered.length > INITIAL_VISIBLE && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
                Mostrar mais etiquetas
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
