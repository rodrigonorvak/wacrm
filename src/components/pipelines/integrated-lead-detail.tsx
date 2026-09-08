"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Deal, MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageCircle, History, StickyNote, Send } from "lucide-react";
import { toast } from "sonner";
import { TemplatePicker, type TemplateSendValues } from "@/components/inbox/template-picker";
import { renderTemplateBody } from "@/lib/whatsapp/template-body";

type LeadEvent = {
  payload: Record<string, unknown>;
  received_at: string;
  status: string;
};

type ContactNote = {
  id: string;
  note_text: string;
  created_at: string;
};

type Conversation = { id: string };

type Tab = "whatsapp" | "notes" | "history";

interface IntegratedLeadDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
}

function displayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return value ? JSON.stringify(value) : "-";
}

export function IntegratedLeadDetail({
  open,
  onOpenChange,
  deal,
}: IntegratedLeadDetailProps) {
  const supabase = createClient();
  const { accountId, user } = useAuth();
  const [tab, setTab] = useState<Tab>("whatsapp");
  const [event, setEvent] = useState<LeadEvent | null>(null);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  useEffect(() => {
    if (!open || !deal?.id || !deal.contact_id) return;
    let cancelled = false;
    // The loading flag mirrors the lifecycle of the async panel fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void Promise.all([
      supabase
        .from("lead_integration_events")
        .select("payload, received_at, status")
        .eq("deal_id", deal.id)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("contact_notes")
        .select("id, note_text, created_at")
        .eq("contact_id", deal.contact_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", deal.contact_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]).then(([eventResult, notesResult, conversationResult]) => {
      if (cancelled) return;
      setEvent((eventResult.data as unknown as LeadEvent | null) ?? null);
      setNotes((notesResult.data as unknown as ContactNote[]) ?? []);
      setConversation((conversationResult.data as unknown as Conversation | null) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, deal, supabase]);

  async function addNote() {
    if (!newNote.trim() || !deal?.contact_id || !accountId || !user) return;
    setSavingNote(true);
    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: deal.contact_id,
        account_id: accountId,
        user_id: user.id,
        note_text: newNote.trim(),
      })
      .select("id, note_text, created_at")
      .single();
    setSavingNote(false);
    if (error || !data) {
      toast.error("Não foi possível salvar a nota");
      return;
    }
    setNotes((current) => [data as unknown as ContactNote, ...current]);
    setNewNote("");
    toast.success("Nota adicionada");
  }

  async function sendTemplate(template: MessageTemplate, values: TemplateSendValues) {
    if (!deal?.contact_id) return;
    setSendingTemplate(true);
    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: deal.contact_id,
        message_type: "template",
        template_name: template.name,
        template_language: template.language,
        template_message_params: {
          body: values.body,
          headerText: values.headerText,
          buttonParams: values.buttonParams,
        },
        template_params: values.body,
        content_text: renderTemplateBody(template.body_text, values.body),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSendingTemplate(false);
    if (!response.ok) {
      toast.error(result?.error || "Não foi possível enviar o template");
      return;
    }
    setTemplatePickerOpen(false);
    setConversation({ id: result.conversation_id });
    toast.success("Template enviado");
  }

  const contact = deal?.contact;
  const payloadEntries = Object.entries(event?.payload ?? {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {contact?.name || deal?.title || "Detalhes do lead"}
          </DialogTitle>
        </DialogHeader>
        {deal && (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <aside className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold text-foreground">Informações do lead</p>
              <div className="mt-4 space-y-3 text-muted-foreground">
                <p><span className="block text-[10px] uppercase">Nome</span>{contact?.name || "-"}</p>
                <p><span className="block text-[10px] uppercase">Telefone</span>{contact?.phone || "-"}</p>
                <p><span className="block text-[10px] uppercase">E-mail</span>{contact?.email || "-"}</p>
                <p><span className="block text-[10px] uppercase">Empresa</span>{contact?.company || "-"}</p>
                <p><span className="block text-[10px] uppercase">Estágio</span>{deal.stage?.name || "Novo Lead"}</p>
              </div>
            </aside>

            <section className="min-h-[360px] rounded-lg border border-border bg-background">
              <div className="flex border-b border-border">
                {([
                  ["whatsapp", "WhatsApp", MessageCircle],
                  ["notes", "Notas internas", StickyNote],
                  ["history", "Histórico", History],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium ${tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
              ) : tab === "whatsapp" ? (
                <div className="space-y-4 p-6">
                  <MessageCircle className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Conversa do WhatsApp</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {conversation ? "A conversa deste contato está disponível no Inbox." : "Este lead ainda não possui uma conversa."}
                    </p>
                  </div>
                  {conversation && (
                    <Link href={`/inbox?c=${conversation.id}`} onClick={() => onOpenChange(false)}>
                      <Button className="gap-2"><MessageCircle className="h-4 w-4" />Abrir conversa</Button>
                    </Link>
                  )}
                  {!conversation && (
                    <Button
                      className="gap-2"
                      disabled={sendingTemplate}
                      onClick={() => setTemplatePickerOpen(true)}
                    >
                      <Send className="h-4 w-4" />
                      {sendingTemplate ? "Enviando..." : "Iniciar com template"}
                    </Button>
                  )}
                </div>
              ) : tab === "notes" ? (
                <div className="space-y-4 p-6">
                  <Textarea value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Escreva uma observação sobre este lead..." />
                  <Button onClick={addNote} disabled={savingNote || !newNote.trim()} className="gap-2"><Send className="h-4 w-4" />Adicionar nota</Button>
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="text-foreground">{note.note_text}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 p-6">
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium text-foreground">Lead recebido pelo formulário</p>
                    <p className="mt-1 text-xs text-muted-foreground">{event ? new Date(event.received_at).toLocaleString() : "Sem evento registrado"}</p>
                  </div>
                  {event && <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">Status do processamento: {event.status}</div>}
                </div>
              )}
            </section>
          </div>
        )}
        {event && payloadEntries.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground">Dados recebidos do formulário</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {payloadEntries.map(([key, value]) => (
                <p key={key} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{key}:</span> {displayValue(value)}</p>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={sendTemplate}
      />
    </Dialog>
  );
}
