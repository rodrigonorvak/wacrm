"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isPaidStageName } from "@/lib/pipelines/paid-stage";
import { PIPELINE_CARD_FIELDS, type PipelineCardField } from "@/lib/pipelines/card-fields";
import type {
  Contact,
  Conversation,
  Deal,
  DealCustomFieldValue,
  DealStatus,
  PipelineCustomField,
  PipelineStage,
  Profile,
} from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check,
  X,
  Trash2,
  Plus,
  MessageSquare,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { findExistingContact } from "@/lib/contacts/dedupe";

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  allowCreateContact?: boolean;
  visibleCardFields: PipelineCardField[];
  onVisibleCardFieldsChange: (fields: PipelineCardField[]) => void;
  onSaved: () => void;
}

function contactLabel(contact: Contact): string {
  return contact.name || contact.phone;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  allowCreateContact = false,
  visibleCardFields,
  onVisibleCardFieldsChange,
  onSaved,
}: DealFormProps) {
  const t = useTranslations("Pipelines.form");
  const supabase = createClient();
  const { accountId } = useAuth();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [customFields, setCustomFields] = useState<
    Array<{ field: PipelineCustomField; value: string }>
  >([]);
  const [newCustomFieldName, setNewCustomFieldName] = useState("");
  const [creatingCustomField, setCreatingCustomField] = useState(false);

  const [contactSearch, setContactSearch] = useState("");
  const [contactOptions, setContactOptions] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ""));
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? "");
      setContactMode("existing");
      setNewContactName("");
      setNewContactPhone("");
      setNewContactEmail("");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
      setContactSearch(deal.contact ? contactLabel(deal.contact) : "");
      setContactOptions(deal.contact ? [deal.contact] : []);
    } else {
      setTitle("");
      setValue("");
      setContactId("");
      setContactMode(allowCreateContact ? "new" : "existing");
      setNewContactName("");
      setNewContactPhone("");
      setNewContactEmail("");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
      setContactSearch("");
      setContactOptions([]);
    }
  }, [open, deal, defaultStageId, stages, allowCreateContact]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Account members are few compared with contacts, so load only the
  // fields this form renders. Contacts are searched separately below.
  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, account_id, account_role, created_at")
        .eq("account_id", accountId)
        .order("full_name");
      if (cancelled) return;
      setProfiles((data ?? []) as Profile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, supabase]);

  useEffect(() => {
    if (!open || !accountId || !pipelineId) return;
    let cancelled = false;
    void (async () => {
      const { data: fields, error: fieldsError } = await supabase
        .from("pipeline_custom_fields")
        .select("id, account_id, pipeline_id, field_name, show_on_card, position")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (fieldsError) {
        console.error("Failed to load pipeline custom fields:", fieldsError.message);
        toast.error("Não foi possível carregar as informações extras. Confira se a migration 061 foi aplicada.");
        return;
      }
      let values: DealCustomFieldValue[] = [];
      if (deal) {
        const { data, error } = await supabase
          .from("deal_custom_field_values")
          .select("field_id, value")
          .eq("deal_id", deal.id);
        if (error) {
          console.error("Failed to load deal custom values:", error.message);
          toast.error("Não foi possível carregar os dados extras deste lead.");
          return;
        }
        values = (data ?? []) as DealCustomFieldValue[];
      }
      if (cancelled) return;
      const valuesByField = new Map(values.map((item) => [item.field_id, item.value ?? ""]));
      setCustomFields((fields ?? []).map((field) => ({
        field: field as PipelineCustomField,
        value: valuesByField.get(field.id) ?? "",
      })));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, pipelineId, deal, supabase]);

  // Searching avoids downloading and rendering the entire contacts table
  // whenever a deal card is opened. A small delay prevents a request for
  // every keystroke while still keeping selection responsive.
  useEffect(() => {
    if (!open || !accountId || contactId !== "" || contactSearch.trim().length < 2) {
      setContactOptions((current) =>
        deal?.contact ? current.filter((contact) => contact.id === deal.contact?.id) : [],
      );
      setSearchingContacts(false);
      return;
    }

    let cancelled = false;
    const query = contactSearch.trim().replace(/[(),.%]/g, "");
    const timeout = window.setTimeout(async () => {
      if (!query) return;
      setSearchingContacts(true);
      const { data } = await supabase
        .from("contacts")
        .select("id, user_id, account_id, name, phone, email, company, avatar_url, created_at, updated_at")
        .eq("account_id", accountId)
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .order("name")
        .limit(20);
      if (cancelled) return;
      setContactOptions((data ?? []) as Contact[]);
      setSearchingContacts(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, accountId, contactId, contactSearch, deal?.contact, supabase]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_id, status, last_message_at, unread_count, created_at, updated_at")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  async function handleSave() {
    const effectiveTitle = title.trim() ||
      (contactMode === "new" && !deal ? newContactName.trim() : contactSearch.trim());
    if (!effectiveTitle || !stageId || (contactMode === "existing" && !contactId) ||
      (contactMode === "new" && !newContactName.trim())) {
      toast.error(t("toastRequired"));
      return;
    }
    const selectedStage = stages.find((stage) => stage.id === stageId);
    if (isPaidStageName(selectedStage?.name) && !(Number(value) > 0)) {
      toast.error(t("paidAmountRequired"));
      return;
    }
    setSaving(true);
    let savedDealId = deal?.id ?? null;
    let customSaveFailed = false;

    const payload = {
      title: effectiveTitle,
      value: parseFloat(value) || 0,
      currency: "BRL",
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
    };

    if (deal) {
      const response = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error(t("toastFailedSave"));
        setSaving(false);
        return;
      }
      savedDealId = deal.id;
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error(t("toastNotSignedIn"));
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error(t("toastNotLinked"));
        setSaving(false);
        return;
      }
      let selectedContactId = contactId;
      if (contactMode === "new") {
        const phone = newContactPhone.trim();
        if (phone) {
          const duplicate = await findExistingContact(supabase, accountId, phone);
          if (duplicate) {
            const { data: existingContact, error: lookupError } = await supabase
              .from("contacts")
              .select("id, user_id, account_id, name, phone, email, company, avatar_url, created_at, updated_at")
              .eq("id", duplicate.id)
              .single();
            if (lookupError || !existingContact) {
              toast.error("Não foi possível carregar o contato existente.");
              setSaving(false);
              return;
            }
            setContactMode("existing");
            setContactId(existingContact.id);
            setContactSearch(contactLabel(existingContact as Contact));
            setContactOptions([existingContact as Contact]);
            toast.error("Já existe um contato com esse telefone. Confirme o contato selecionado e salve novamente.");
            setSaving(false);
            return;
          }
        }
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            user_id: user.id,
            account_id: accountId,
            name: newContactName.trim(),
            phone,
            email: newContactEmail.trim() || null,
          })
          .select("id")
          .single();
        if (contactError || !contact) {
          toast.error(contactError?.code === "23505"
            ? "Já existe um contato com esse telefone."
            : "Não foi possível criar o contato.");
          setSaving(false);
          return;
        }
        selectedContactId = contact.id;
      }
      const { data: createdDeal, error } = await supabase
        .from("deals")
        .insert({ ...payload, contact_id: selectedContactId, user_id: user.id, account_id: accountId, status: "open" })
        .select("id")
        .single();
      if (error) {
        toast.error(t("toastFailedCreate"));
        setSaving(false);
        return;
      }
      savedDealId = createdDeal.id;
    }

    if (savedDealId && customFields.length > 0) {
      const { error } = await supabase.from("deal_custom_field_values").upsert(
        customFields.map(({ field, value }) => ({
          account_id: accountId,
          pipeline_id: pipelineId,
          deal_id: savedDealId,
          field_id: field.id,
          value: value.trim() || null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "deal_id,field_id" },
      );
      if (error) {
        console.error("Failed to save deal custom fields:", error.message);
        customSaveFailed = true;
      }
    }

    setSaving(false);
    if (customSaveFailed) {
      toast.warning("O lead foi salvo, mas não foi possível salvar as informações extras.");
    } else {
      toast.success(deal ? t("toastUpdated") : t("toastCreated"));
    }
    onOpenChange(false);
    onSaved();
  }

  async function addCustomField() {
    const fieldName = newCustomFieldName.trim();
    if (!fieldName || !accountId) return;
    setCreatingCustomField(true);
    const { data, error } = await supabase
      .from("pipeline_custom_fields")
      .insert({
        account_id: accountId,
        pipeline_id: pipelineId,
        field_name: fieldName,
        position: customFields.length,
      })
      .select("id, account_id, pipeline_id, field_name, show_on_card, position")
      .single();
    setCreatingCustomField(false);
    if (error || !data) {
      toast.error(error?.code === "23505" ? "Esse campo já existe neste funil." : "Não foi possível adicionar o campo.");
      return;
    }
    setCustomFields((current) => [...current, { field: data as PipelineCustomField, value: "" }]);
    setNewCustomFieldName("");
  }

  async function toggleCustomFieldVisibility(field: PipelineCustomField, visible: boolean) {
    const { error } = await supabase
      .from("pipeline_custom_fields")
      .update({ show_on_card: visible })
      .eq("id", field.id)
      .eq("pipeline_id", pipelineId);
    if (error) {
      toast.error("Não foi possível alterar a exibição deste campo.");
      return;
    }
    setCustomFields((current) => current.map((item) => item.field.id === field.id
      ? { ...item, field: { ...item.field, show_on_card: visible } }
      : item));
  }

  async function deleteCustomField(field: PipelineCustomField) {
    if (!window.confirm(`Excluir o campo "${field.field_name}" deste funil e os valores associados?`)) return;
    const { error } = await supabase
      .from("pipeline_custom_fields")
      .delete()
      .eq("id", field.id)
      .eq("pipeline_id", pipelineId);
    if (error) {
      toast.error("Não foi possível excluir este campo.");
      return;
    }
    setCustomFields((current) => current.filter((item) => item.field.id !== field.id));
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update({ status })
      .eq("id", deal.id);
    setStatusAction(null);
    if (error) {
      toast.error(t("toastFailedStatus"));
      return;
    }
    toast.success(
      status === "won" ? t("toastMarkedWon") : status === "lost" ? t("toastMarkedLost") : t("toastReopened"),
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  const showAdvanced =
    advancedOpen || !!deal || isPaidStageName(stages.find((stage) => stage.id === stageId)?.name);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? t("editDeal") : t("newDeal")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-muted-foreground">{t("contact")}</Label>
                {allowCreateContact && !deal && (
                  <div className="flex rounded-md border border-border p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setContactMode("new")}
                      className={`rounded px-2 py-1 ${contactMode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Novo contato
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactMode("existing")}
                      className={`rounded px-2 py-1 ${contactMode === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      Existente
                    </button>
                  </div>
                )}
              </div>
              {contactMode === "new" && !deal ? (
                <div className="grid gap-3 rounded-md border border-border p-3">
                  <div className="grid gap-2">
                    <Label htmlFor="deal-contact-name">Nome <span className="text-destructive">*</span></Label>
                    <Input
                      id="deal-contact-name"
                      value={newContactName}
                      onChange={(event) => setNewContactName(event.target.value)}
                      placeholder="Nome da pessoa"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deal-contact-phone">Telefone <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                    <Input
                      id="deal-contact-phone"
                      value={newContactPhone}
                      onChange={(event) => setNewContactPhone(event.target.value)}
                      placeholder="Telefone informado manualmente"
                    />
                    <p className="text-xs text-muted-foreground">
                      Este número será salvo no contato; não significa que exista uma conversa do WhatsApp.
                    </p>
                  </div>
                </div>
              ) : (
                <>
              <div className="relative">
                <Input
                  value={contactSearch}
                  onChange={(event) => {
                    setContactSearch(event.target.value);
                    setContactId("");
                  }}
                  placeholder={t("selectContact")}
                  className="border-border bg-muted text-foreground"
                />
                {searchingContacts && (
                  <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {contactSearch.trim().length >= 2 && contactId === "" && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1">
                  {contactOptions.length > 0 ? (
                    contactOptions.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setContactId(contact.id);
                          setContactSearch(contactLabel(contact));
                          setContactOptions([contact]);
                        }}
                        className="flex w-full flex-col rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium text-foreground">{contactLabel(contact)}</span>
                        {contact.email && (
                          <span className="text-xs text-muted-foreground">{contact.email}</span>
                        )}
                      </button>
                    ))
                  ) : !searchingContacts ? (
                    <p className="px-2.5 py-2 text-sm text-muted-foreground">
                      {t("selectContact")}
                    </p>
                  ) : null}
                </div>
              )}

              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                >
                  <MessageSquare className="h-3 w-3" />
                  {t("linkToConversation")}
                </Link>
              )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/50"
              aria-expanded={showAdvanced}
            >
              <span>
                {t("advanced")}
                <span className="block text-xs font-normal text-muted-foreground">{t("advancedHint")}</span>
              </span>
              <ChevronDown className={`size-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            {showAdvanced && (
            <div className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            {contactMode === "new" && !deal && (
              <div className="grid gap-2">
                <Label htmlFor="deal-contact-email">E-mail <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label>
                <Input
                  id="deal-contact-email"
                  type="email"
                  value={newContactEmail}
                  onChange={(event) => setNewContactEmail(event.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
            )}

            <div className="grid gap-2">
                <Label className="text-muted-foreground">
                  {t(isPaidStageName(stages.find((stage) => stage.id === stageId)?.name) ? "paidAmount" : "value")}
                </Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={isPaidStageName(stages.find((stage) => stage.id === stageId)?.name) ? t("paidAmountPlaceholder") : "0,00"}
                    className="border-border bg-muted pl-9 text-foreground"
                  />
                </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("expectedCloseDate")}</Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("stage")}</Label>
              <select
                value={stageId}
                onChange={(e) => {
                  const nextStageId = e.target.value;
                  const nextStage = stages.find((stage) => stage.id === nextStageId);
                  if (isPaidStageName(nextStage?.name) && !isPaidStageName(stages.find((stage) => stage.id === stageId)?.name)) {
                    setValue("");
                  }
                  setStageId(nextStageId);
                }}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("assignedTo")}</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("unassigned")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                className="min-h-[100px] border-border bg-muted text-foreground"
              />
            </div>

            <fieldset className="grid gap-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">
                Informações adicionais deste funil
              </legend>
              <p className="-mt-2 text-xs text-muted-foreground">
                Os campos são exclusivos deste funil. Marque quais devem aparecer no card fechado.
              </p>
              {customFields.map(({ field, value: fieldValue }, index) => (
                <div key={field.id} className="grid gap-2 rounded-md bg-muted/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`deal-custom-${field.id}`} className="min-w-0 truncate text-sm">
                      {field.field_name}
                    </Label>
                    <button
                      type="button"
                      onClick={() => void deleteCustomField(field)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Excluir campo ${field.field_name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    id={`deal-custom-${field.id}`}
                    value={fieldValue}
                    onChange={(event) => setCustomFields((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item))}
                    placeholder={`Informar ${field.field_name.toLowerCase()}`}
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={field.show_on_card}
                      onCheckedChange={(checked) => void toggleCustomFieldVisibility(field, checked === true)}
                    />
                    Mostrar no card fechado
                  </label>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newCustomFieldName}
                  onChange={(event) => setNewCustomFieldName(event.target.value)}
                  placeholder="Nome da nova informação"
                  aria-label="Nome da nova informação"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addCustomField();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void addCustomField()}
                  disabled={creatingCustomField || !newCustomFieldName.trim()}
                  aria-label="Adicionar informação"
                  title="Adicionar informação"
                >
                  {creatingCustomField ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </Button>
              </div>
            </fieldset>
            </div>
            )}

            {deal && (
              <fieldset className="grid gap-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-medium text-foreground">
                  {t("cardFieldsTitle")}
                </legend>
                <p className="-mt-2 text-xs text-muted-foreground">
                  {t("cardFieldsDescription")}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PIPELINE_CARD_FIELDS.map((field) => (
                    <label key={field} className="flex min-h-10 items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={visibleCardFields.includes(field)}
                        onCheckedChange={(checked) => {
                          const nextFields = checked === true
                            ? [...visibleCardFields, field]
                            : visibleCardFields.filter((item) => item !== field);
                          onVisibleCardFieldsChange(nextFields);
                        }}
                      />
                      {t(`cardFieldOptions.${field}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("status")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        {t("markAsWon")}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("lost")}
                    disabled={!!statusAction || deal.status === "lost"}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        {t("markAsLost")}
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    {t("reopenDeal")}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t("saving") : deal ? t("saveChanges") : t("createDeal")}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">{t("deletePrompt")}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? t("deleting") : t("confirm")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("deleteDeal")}
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
