"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Contact } from "@/types";

const MAX_CONTACTS = 1000;

interface AddContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  userId: string | null;
  pipelineId: string;
  stageId: string;
  stageName?: string;
  onCreateNew: () => void;
  onAdded: () => void;
}

export function AddContactsDialog({
  open,
  onOpenChange,
  accountId,
  userId,
  pipelineId,
  stageId,
  stageName,
  onCreateNew,
  onAdded,
}: AddContactsDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [inPipeline, setInPipeline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !accountId || !pipelineId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setQuery("");
    setSelected(new Set());
    void (async () => {
      const [contactResult, dealResult] = await Promise.all([
        supabase
          .from("contacts")
          .select("*")
          .eq("account_id", accountId)
          .order("name")
          .limit(MAX_CONTACTS),
        supabase
          .from("deals")
          .select("contact_id")
          .eq("account_id", accountId)
          .eq("pipeline_id", pipelineId),
      ]);
      if (cancelled) return;
      if (contactResult.error) toast.error("Não foi possível carregar os contatos");
      setContacts((contactResult.data ?? []) as Contact[]);
      setInPipeline(new Set((dealResult.data ?? []).map((row) => row.contact_id as string)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, pipelineId, supabase]);

  const normalized = query.trim().toLowerCase();
  const available = contacts.filter((contact) => !inPipeline.has(contact.id));
  const visible = available.filter((contact) =>
    !normalized ||
    (contact.name ?? "").toLowerCase().includes(normalized) ||
    (contact.phone ?? "").toLowerCase().includes(normalized) ||
    (contact.email ?? "").toLowerCase().includes(normalized),
  );
  const allVisibleSelected = visible.length > 0 && visible.every((contact) => selected.has(contact.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const contact of visible) {
        if (allVisibleSelected) next.delete(contact.id);
        else next.add(contact.id);
      }
      return next;
    });
  }

  async function handleAdd() {
    if (!accountId || !userId || selected.size === 0 || saving) return;
    setSaving(true);
    const rows = available
      .filter((contact) => selected.has(contact.id))
      .map((contact) => ({
        user_id: userId,
        account_id: accountId,
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contact.id,
        title: contact.name?.trim() || contact.phone || "Novo lead",
        value: 0,
        currency: "BRL",
        status: "open",
      }));
    const { error } = await supabase.from("deals").insert(rows);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível adicionar os contatos");
      return;
    }
    toast.success(`${rows.length} contato(s) adicionado(s)`);
    onAdded();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar contatos{stageName ? ` em ${stageName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="pl-8"
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={visible.length === 0}
              className="size-4"
            />
            Selecionar todos{normalized ? " os filtrados" : ""} ({visible.length})
          </label>
          <span className="text-muted-foreground">{selected.size} selecionado(s)</span>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {available.length === 0
                ? "Todos os contatos já estão neste funil."
                : "Nenhum contato encontrado."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((contact) => (
                <li key={contact.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggle(contact.id)}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {contact.name || contact.phone || contact.email || "Sem nome"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[contact.phone, contact.email].filter(Boolean).join(" · ") || "Sem telefone"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {contacts.length >= MAX_CONTACTS && (
          <p className="text-xs text-muted-foreground">
            Mostrando os primeiros {MAX_CONTACTS} contatos. Use a busca para encontrar outros.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={onCreateNew}>
            <UserPlus className="size-4" />
            Novo contato
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={selected.size === 0 || saving} onClick={() => void handleAdd()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Adicionar{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
