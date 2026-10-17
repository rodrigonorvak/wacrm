'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Laptop,
  Loader2,
  Mail,
  Minus,
  MousePointer2,
  PanelBottom,
  Save,
  Send,
  Smartphone,
  Space,
  Trash2,
  Type,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  EmailBlock,
  EmailBlockAlignment,
  EmailBlockType,
  EmailCampaignAudienceType,
} from '@/lib/email-campaigns/types';

interface SenderOption {
  id: string;
  name: string;
  from_email: string;
}

interface ContactOption {
  id: string;
  name: string | null;
  email: string;
}

interface PipelineOption {
  id: string;
  name: string;
}

interface StageOption {
  id: string;
  pipeline_id: string;
  name: string;
}

interface EditorProps {
  campaignId?: string;
}

const INITIAL_BLOCKS: EmailBlock[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'heading',
    text: '',
    url: '',
    alt: '',
    alignment: 'center',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'text',
    text: '',
    url: '',
    alt: '',
    alignment: 'left',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    type: 'footer',
    text: '',
    url: '',
    alt: '',
    alignment: 'center',
  },
];

const BLOCK_TYPE_ORDER: EmailBlockType[] = [
  'heading',
  'text',
  'image',
  'button',
  'divider',
  'spacer',
  'footer',
];

function newBlock(type: EmailBlockType): EmailBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: '',
    url: '',
    alt: '',
    alignment: type === 'button' || type === 'heading' ? 'center' : 'left',
  };
}

function isEmailBlockArray(value: unknown): value is EmailBlock[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.type === 'string' &&
        typeof item.text === 'string' &&
        typeof item.url === 'string' &&
        typeof item.alt === 'string' &&
        typeof item.alignment === 'string'
    )
  );
}

function displayName(name: string | null, email: string): string {
  return name?.trim() || email;
}

function toLocalDateTimeInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function EmailBlockPreview({ block }: { block: EmailBlock }) {
  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[block.alignment];

  if (block.type === 'heading') {
    return (
      <h1
        className={`text-2xl font-bold break-words whitespace-pre-wrap ${alignmentClass}`}
      >
        {block.text || 'Título do e-mail'}
      </h1>
    );
  }
  if (block.type === 'text') {
    return (
      <p
        className={`text-sm leading-6 break-words whitespace-pre-wrap ${alignmentClass}`}
      >
        {block.text || 'Adicione o texto da sua mensagem aqui.'}
      </p>
    );
  }
  if (block.type === 'image') {
    if (!/^https?:\/\//i.test(block.url)) {
      return (
        <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          Insira uma URL de imagem
        </div>
      );
    }
    return (
      <Image
        src={block.url}
        alt={block.alt}
        width={640}
        height={320}
        unoptimized
        className="max-h-72 w-full rounded-md object-cover"
      />
    );
  }
  if (block.type === 'button') {
    return (
      <div className={alignmentClass}>
        <span className="inline-flex rounded-md bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white">
          {block.text || 'Saiba mais'}
        </span>
        {block.url && (
          <span className="mt-1 block truncate text-[10px] text-slate-400">
            {block.url}
          </span>
        )}
      </div>
    );
  }
  if (block.type === 'divider') {
    return <hr className="border-0 border-t border-slate-200" />;
  }
  if (block.type === 'spacer') {
    return <div className="h-8" aria-hidden="true" />;
  }
  return (
    <div
      className={`border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 ${alignmentClass}`}
    >
      <p className="whitespace-pre-wrap">
        {block.text || 'Informações da instituição'}
      </p>
      <p className="mt-2">
        Cancelar inscrição
        <span className="block text-[10px] text-slate-400">
          O link de descadastro será incluído automaticamente no envio.
        </span>
      </p>
    </div>
  );
}

function SortableEmailBlock({
  block,
  selected,
  label,
  onSelect,
  onRemove,
  removeLabel,
}: {
  block: EmailBlock;
  selected: boolean;
  label: string;
  onSelect: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-lg border bg-white p-4 text-slate-900 shadow-sm ${
        selected
          ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/20'
          : 'border-slate-200'
      } ${isDragging ? 'z-20 opacity-70' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Mover ${label}`}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="block w-full rounded p-1 text-left focus-visible:ring-2 focus-visible:ring-fuchsia-500 focus-visible:outline-none"
      >
        <EmailBlockPreview block={block} />
      </button>
    </article>
  );
}

export function EmailCampaignEditor({ campaignId }: EditorProps) {
  const t = useTranslations('EmailCampaigns');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [dispatchingCampaign, setDispatchingCampaign] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(campaignId);
  const [testRecipient, setTestRecipient] = useState('');
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [senderId, setSenderId] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [audienceType, setAudienceType] =
    useState<EmailCampaignAudienceType>('all_contacts');
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [blocks, setBlocks] = useState<EmailBlock[]>(INITIAL_BLOCKS);
  const [selectedBlockId, setSelectedBlockId] = useState(INITIAL_BLOCKS[0].id);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop'
  );
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(0);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const selectedBlock =
    blocks.find((block) => block.id === selectedBlockId) ?? null;
  const filteredStages = stages.filter(
    (stage) => stage.pipeline_id === pipelineId
  );

  const loadSenderAndPipelineOptions = useCallback(async () => {
    try {
      const [sendersResponse, pipelineResult, stagesResult] = await Promise.all(
        [
          fetch('/api/email/senders', { cache: 'no-store' }),
          supabase.from('pipelines').select('id, name').order('name'),
          supabase
            .from('pipeline_stages')
            .select('id, pipeline_id, name, position')
            .order('position'),
        ]
      );
      const senderPayload = await sendersResponse.json();
      if (!sendersResponse.ok) {
        throw new Error(senderPayload.error || t('loadSendersFailed'));
      }
      if (pipelineResult.error) throw pipelineResult.error;
      if (stagesResult.error) throw stagesResult.error;
      const loadedSenders = senderPayload.senders ?? [];
      setSenders(loadedSenders);
      if (!campaignId && loadedSenders.length > 0) {
        setSenderId(loadedSenders[0].id);
      }
      setPipelines(pipelineResult.data ?? []);
      setStages(stagesResult.data ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('loadOptionsFailed')
      );
    }
  }, [campaignId, supabase, t]);

  useEffect(() => {
    void loadSenderAndPipelineOptions();
  }, [loadSenderAndPipelineOptions]);

  useEffect(() => {
    if (!campaignId) {
      setName(t('newCampaignDefault'));
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadCampaign() {
      setLoading(true);
      try {
        const response = await fetch(`/api/email/campaigns/${campaignId}`, {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || t('loadCampaignFailed'));
        const campaign = payload.campaign;
        if (campaign.status !== 'draft') {
          toast.error(t('onlyDraftEditable'));
          router.replace('/broadcasts/email');
          return;
        }
        if (cancelled) return;
        setName(campaign.name);
        setSubject(campaign.subject ?? '');
        setPreheader(campaign.preheader ?? '');
        setSenderId(campaign.sender_connection_id);
        setAudienceType(campaign.audience_type);
        setContactIds(campaign.audience_contact_ids ?? []);
        setPipelineId(campaign.audience_pipeline_id ?? '');
        setStageId(campaign.audience_stage_id ?? '');
        const savedBlocks = isEmailBlockArray(campaign.content_json)
          ? campaign.content_json
          : INITIAL_BLOCKS;
        setBlocks(savedBlocks);
        setSelectedBlockId(savedBlocks[0]?.id ?? INITIAL_BLOCKS[0].id);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : t('loadCampaignFailed')
          );
          router.replace('/broadcasts/email');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCampaign();
    return () => {
      cancelled = true;
    };
  }, [campaignId, router, t]);

  useEffect(() => {
    if (audienceType !== 'selected_contacts') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingContacts(true);
      try {
        const query = new URLSearchParams({
          page: String(contactPage),
          q: contactSearch,
        });
        const response = await fetch(`/api/email/campaigns/contacts?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || t('loadContactsFailed'));
        setContacts(payload.contacts ?? []);
        setContactTotal(payload.total ?? 0);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          toast.error(error.message || t('loadContactsFailed'));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingContacts(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [audienceType, contactPage, contactSearch, t]);

  function updateSelectedBlock(patch: Partial<EmailBlock>) {
    if (!selectedBlock) return;
    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedBlock.id ? { ...block, ...patch } : block
      )
    );
  }

  function addBlock(type: EmailBlockType) {
    const block = newBlock(type);
    setBlocks((current) => [...current, block]);
    setSelectedBlockId(block.id);
  }

  function removeBlock(id: string) {
    if (blocks.length <= 1) {
      toast.error(t('atLeastOneBlock'));
      return;
    }
    const nextBlocks = blocks.filter((block) => block.id !== id);
    setBlocks(nextBlocks);
    if (selectedBlockId === id) setSelectedBlockId(nextBlocks[0].id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = blocks.findIndex((block) => block.id === active.id);
    const toIndex = blocks.findIndex((block) => block.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    setBlocks((current) => arrayMove(current, fromIndex, toIndex));
  }

  function toggleContact(id: string) {
    setContactIds((current) => {
      if (current.includes(id))
        return current.filter((contactId) => contactId !== id);
      if (current.length >= 1000) {
        toast.error(t('contactSelectionLimit'));
        return current;
      }
      return [...current, id];
    });
  }

  function getDraftPayload() {
    if (!senderId) {
      throw new Error(t('senderRequired'));
    }
    if (audienceType === 'selected_contacts' && contactIds.length === 0) {
      throw new Error(t('contactsRequired'));
    }
    if (audienceType === 'pipeline_stage' && (!pipelineId || !stageId)) {
      throw new Error(t('stageRequired'));
    }

    return {
      senderConnectionId: senderId,
      name,
      subject,
      preheader,
      audienceType,
      audienceContactIds:
        audienceType === 'selected_contacts' ? contactIds : [],
      audiencePipelineId: audienceType === 'pipeline_stage' ? pipelineId : null,
      audienceStageId: audienceType === 'pipeline_stage' ? stageId : null,
      content: blocks,
    };
  }

  async function persistDraft(): Promise<string> {
    const payload = getDraftPayload();

    const response = await fetch(
      activeCampaignId
        ? `/api/email/campaigns/${activeCampaignId}`
        : '/api/email/campaigns',
      {
        method: activeCampaignId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t('saveFailed'));
    const savedId = result.campaign?.id ?? activeCampaignId;
    if (typeof savedId !== 'string') throw new Error(t('saveFailed'));
    setActiveCampaignId(savedId);
    return savedId;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const savedId = await persistDraft();
      toast.success(t('draftSaved'));
      if (!campaignId) router.replace(`/broadcasts/email/${savedId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    const recipient = testRecipient.trim();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
      recipient.length > 254
    ) {
      toast.error(t('testRecipientRequired'));
      return;
    }
    if (!subject.trim()) {
      toast.error(t('testSubjectRequired'));
      return;
    }
    if (
      !blocks.some(
        (block) => block.text.trim() || (block.type === 'image' && block.url)
      )
    ) {
      toast.error(t('testContentRequired'));
      return;
    }

    setSendingTest(true);
    try {
      const savedId = await persistDraft();
      toast.success(t('draftSaved'));
      const response = await fetch(`/api/email/campaigns/${savedId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('testSendFailed'));
      toast.success(t('testSent'));
      if (!campaignId) router.replace(`/broadcasts/email/${savedId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('testSendFailed'));
    } finally {
      setSendingTest(false);
    }
  }

  async function queueCampaign(scheduledAt: string | null) {
    const confirmation = scheduledAt
      ? t('scheduleCampaignConfirm')
      : t('sendCampaignConfirm');
    if (!window.confirm(confirmation)) return;

    setDispatchingCampaign(true);
    try {
      const savedId = await persistDraft();
      const response = await fetch(`/api/email/campaigns/${savedId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t('campaignSendFailed'));

      if (scheduledAt) {
        toast.success(
          t('campaignScheduled', {
            count: result.queuedCount,
            date: new Date(result.scheduledAt).toLocaleString(),
          })
        );
      } else {
        toast.success(t('campaignQueued', { count: result.queuedCount }));
      }
      router.replace('/broadcasts/email');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('campaignSendFailed')
      );
    } finally {
      setDispatchingCampaign(false);
    }
  }

  function scheduleCampaign() {
    if (!scheduledAtLocal) {
      toast.error(t('scheduleTimeRequired'));
      return;
    }
    const scheduledAt = new Date(scheduledAtLocal);
    if (
      !Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() < Date.now() + 60_000 ||
      scheduledAt.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000
    ) {
      toast.error(t('scheduleTimeInvalid'));
      return;
    }
    void queueCampaign(scheduledAt.toISOString());
  }

  const blockIcons = {
    heading: Heading1,
    text: Type,
    image: ImageIcon,
    button: MousePointer2,
    divider: Minus,
    spacer: Space,
    footer: PanelBottom,
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={saveDraft} className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('backToCampaigns')}
            onClick={() => router.push('/broadcasts/email')}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <p className="text-primary text-sm font-medium">{t('section')}</p>
            <h1 className="text-foreground truncate text-xl font-bold">
              {campaignId ? t('editCampaign') : t('newCampaign')}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              saving ||
              sendingTest ||
              dispatchingCampaign ||
              senders.length === 0
            }
            onClick={() => void sendTestEmail()}
          >
            {sendingTest ? <Loader2 className="animate-spin" /> : <Send />}
            {sendingTest ? t('sendingTest') : t('sendTest')}
          </Button>
          <Button
            type="submit"
            disabled={
              saving ||
              sendingTest ||
              dispatchingCampaign ||
              senders.length === 0
            }
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? t('saving') : t('saveDraft')}
          </Button>
        </div>
      </header>

      {senders.length === 0 ? (
        <div className="border-border bg-card flex flex-col items-center rounded-xl border border-dashed p-10 text-center">
          <Mail className="text-muted-foreground size-9" />
          <p className="text-foreground mt-3 font-semibold">
            {t('noSendersTitle')}
          </p>
          <p className="text-muted-foreground mt-1 max-w-lg text-sm">
            {t('noSendersDescription')}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/broadcasts/email/senders')}
          >
            {t('manageSenders')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="border-border bg-card space-y-4 rounded-xl border p-4">
              <h2 className="text-foreground font-semibold">
                {t('campaignDetails')}
              </h2>
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">{t('campaignName')}</Label>
                <Input
                  id="campaign-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-sender">{t('sender')}</Label>
                <select
                  id="campaign-sender"
                  value={senderId}
                  onChange={(event) => setSenderId(event.target.value)}
                  required
                  className="border-border bg-background text-foreground h-9 rounded-lg border px-3 text-sm"
                >
                  <option value="">{t('selectSender')}</option>
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {sender.name} · {sender.from_email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-subject">{t('subject')}</Label>
                <Input
                  id="campaign-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={255}
                  placeholder={t('subjectPlaceholder')}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-preheader">{t('preheader')}</Label>
                <Input
                  id="campaign-preheader"
                  value={preheader}
                  onChange={(event) => setPreheader(event.target.value)}
                  maxLength={250}
                  placeholder={t('preheaderPlaceholder')}
                />
              </div>
            </section>

            <section className="border-border bg-card space-y-3 rounded-xl border p-4">
              <div className="grid gap-2">
                <Label htmlFor="test-recipient">{t('testRecipient')}</Label>
                <Input
                  id="test-recipient"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder={t('testRecipientPlaceholder')}
                  maxLength={254}
                />
                <p className="text-muted-foreground text-xs">
                  {t('testSendHint')}
                </p>
              </div>
            </section>

            <section className="border-border bg-card space-y-3 rounded-xl border p-4">
              <h2 className="text-foreground font-semibold">
                {t('deliverySchedule')}
              </h2>
              <p className="text-muted-foreground text-xs">
                {t('deliveryScheduleHint')}
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={
                  saving ||
                  sendingTest ||
                  dispatchingCampaign ||
                  senders.length === 0
                }
                onClick={() => void queueCampaign(null)}
              >
                {dispatchingCampaign ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send />
                )}
                {dispatchingCampaign ? t('preparingDelivery') : t('sendNow')}
              </Button>
              <div className="grid gap-2">
                <Label htmlFor="campaign-schedule">{t('scheduleAt')}</Label>
                <Input
                  id="campaign-schedule"
                  type="datetime-local"
                  min={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
                  value={scheduledAtLocal}
                  onChange={(event) => setScheduledAtLocal(event.target.value)}
                  disabled={dispatchingCampaign}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={
                  saving ||
                  sendingTest ||
                  dispatchingCampaign ||
                  senders.length === 0 ||
                  !scheduledAtLocal
                }
                onClick={scheduleCampaign}
              >
                {dispatchingCampaign ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <CalendarClock />
                )}
                {t('scheduleCampaign')}
              </Button>
            </section>

            <section className="border-border bg-card space-y-4 rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <Users className="text-primary size-4" />
                <h2 className="text-foreground font-semibold">
                  {t('audience')}
                </h2>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    ['all_contacts', 'allContacts'],
                    ['selected_contacts', 'selectContacts'],
                    ['pipeline_stage', 'pipelineStage'],
                  ] as const
                ).map(([type, labelKey]) => (
                  <label
                    key={type}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                      audienceType === type
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="email-audience"
                      value={type}
                      checked={audienceType === type}
                      onChange={() => setAudienceType(type)}
                      className="accent-primary mt-0.5"
                    />
                    <span>
                      <span className="block font-medium">{t(labelKey)}</span>
                      {type === 'all_contacts' && (
                        <span className="mt-0.5 block text-xs">
                          {t('allContactsHint')}
                        </span>
                      )}
                      {type === 'selected_contacts' && (
                        <span className="mt-0.5 block text-xs">
                          {t('selectedContactCount', {
                            count: contactIds.length,
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {audienceType === 'selected_contacts' && (
                <div className="border-border space-y-3 border-t pt-3">
                  <div className="flex gap-2">
                    <Input
                      value={contactSearch}
                      onChange={(event) => {
                        setContactSearch(event.target.value);
                        setContactPage(0);
                      }}
                      placeholder={t('searchContacts')}
                      aria-label={t('searchContacts')}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('contactsWithEmail', { count: contactTotal })}
                  </p>
                  {loadingContacts ? (
                    <div className="flex h-24 items-center justify-center">
                      <Loader2 className="text-primary size-5 animate-spin" />
                    </div>
                  ) : contacts.length === 0 ? (
                    <p className="bg-muted text-muted-foreground rounded-md p-3 text-xs">
                      {t('noContactsWithEmail')}
                    </p>
                  ) : (
                    <>
                      <div className="max-h-60 space-y-1 overflow-y-auto">
                        {contacts.map((contact) => (
                          <label
                            key={contact.id}
                            className="hover:bg-muted flex cursor-pointer items-start gap-2 rounded-md p-2"
                          >
                            <input
                              type="checkbox"
                              checked={contactIds.includes(contact.id)}
                              onChange={() => toggleContact(contact.id)}
                              className="accent-primary mt-1"
                            />
                            <span className="min-w-0">
                              <span className="text-foreground block truncate text-sm">
                                {displayName(contact.name, contact.email)}
                              </span>
                              {contact.name && (
                                <span className="text-muted-foreground block truncate text-xs">
                                  {contact.email}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={contactPage === 0}
                          onClick={() =>
                            setContactPage((page) => Math.max(0, page - 1))
                          }
                        >
                          <ChevronLeft />
                          {t('previous')}
                        </Button>
                        <span className="text-muted-foreground text-xs">
                          {contactPage + 1} /{' '}
                          {Math.max(1, Math.ceil(contactTotal / 40))}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={(contactPage + 1) * 40 >= contactTotal}
                          onClick={() => setContactPage((page) => page + 1)}
                        >
                          {t('next')}
                          <ChevronRight />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {audienceType === 'pipeline_stage' && (
                <div className="border-border grid gap-3 border-t pt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="audience-pipeline">{t('pipeline')}</Label>
                    <select
                      id="audience-pipeline"
                      value={pipelineId}
                      onChange={(event) => {
                        const nextPipelineId = event.target.value;
                        setPipelineId(nextPipelineId);
                        setStageId(
                          stages.find(
                            (stage) => stage.pipeline_id === nextPipelineId
                          )?.id ?? ''
                        );
                      }}
                      className="border-border bg-background text-foreground h-9 rounded-lg border px-3 text-sm"
                    >
                      <option value="">{t('selectPipeline')}</option>
                      {pipelines.map((pipeline) => (
                        <option key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="audience-stage">{t('stage')}</Label>
                    <select
                      id="audience-stage"
                      value={stageId}
                      onChange={(event) => setStageId(event.target.value)}
                      disabled={!pipelineId}
                      className="border-border bg-background text-foreground h-9 rounded-lg border px-3 text-sm disabled:opacity-50"
                    >
                      <option value="">{t('selectStage')}</option>
                      {filteredStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('pipelineAudienceHint')}
                  </p>
                </div>
              )}
            </section>

            <section className="border-border bg-card space-y-3 rounded-xl border p-4">
              <h2 className="text-foreground font-semibold">{t('addBlock')}</h2>
              <div className="grid grid-cols-2 gap-2">
                {BLOCK_TYPE_ORDER.map((type) => {
                  const Icon = blockIcons[type];
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => addBlock(type)}
                    >
                      <Icon />
                      {t(`blockTypes.${type}`)}
                    </Button>
                  );
                })}
              </div>
            </section>

            <section className="border-border bg-card space-y-3 rounded-xl border p-4">
              <h2 className="text-foreground font-semibold">
                {t('blockSettings')}
              </h2>
              {!selectedBlock ? (
                <p className="text-muted-foreground text-sm">
                  {t('selectBlockHint')}
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {t(`blockTypes.${selectedBlock.type}`)}
                  </p>
                  {['heading', 'text', 'button', 'footer'].includes(
                    selectedBlock.type
                  ) && (
                    <div className="grid gap-2">
                      <Label htmlFor="block-text">{t('blockText')}</Label>
                      <textarea
                        id="block-text"
                        rows={selectedBlock.type === 'heading' ? 2 : 5}
                        value={selectedBlock.text}
                        onChange={(event) =>
                          updateSelectedBlock({ text: event.target.value })
                        }
                        maxLength={10_000}
                        className="border-border bg-background text-foreground min-h-20 rounded-lg border px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  {selectedBlock.type === 'image' && (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="block-image-url">{t('imageUrl')}</Label>
                        <Input
                          id="block-image-url"
                          type="url"
                          value={selectedBlock.url}
                          onChange={(event) =>
                            updateSelectedBlock({ url: event.target.value })
                          }
                          placeholder="https://..."
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="block-image-alt">{t('imageAlt')}</Label>
                        <Input
                          id="block-image-alt"
                          value={selectedBlock.alt}
                          onChange={(event) =>
                            updateSelectedBlock({ alt: event.target.value })
                          }
                        />
                      </div>
                    </>
                  )}
                  {selectedBlock.type === 'button' && (
                    <div className="grid gap-2">
                      <Label htmlFor="block-button-url">{t('buttonUrl')}</Label>
                      <Input
                        id="block-button-url"
                        type="url"
                        value={selectedBlock.url}
                        onChange={(event) =>
                          updateSelectedBlock({ url: event.target.value })
                        }
                        placeholder="https://..."
                      />
                    </div>
                  )}
                  {['heading', 'text', 'button', 'footer'].includes(
                    selectedBlock.type
                  ) && (
                    <div className="grid gap-2">
                      <Label>{t('alignment')}</Label>
                      <div className="flex gap-1">
                        {(
                          [
                            ['left', AlignLeft],
                            ['center', AlignCenter],
                            ['right', AlignRight],
                          ] as const
                        ).map(([alignment, Icon]) => (
                          <Button
                            key={alignment}
                            type="button"
                            variant={
                              selectedBlock.alignment === alignment
                                ? 'secondary'
                                : 'outline'
                            }
                            size="icon-sm"
                            aria-label={t(`alignments.${alignment}`)}
                            onClick={() =>
                              updateSelectedBlock({
                                alignment: alignment as EmailBlockAlignment,
                              })
                            }
                          >
                            <Icon />
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {['divider', 'spacer'].includes(selectedBlock.type) && (
                    <p className="text-muted-foreground text-xs">
                      {t('noBlockSettings')}
                    </p>
                  )}
                </>
              )}
            </section>
          </aside>

          <section className="min-w-0 space-y-3">
            <div className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <div>
                <h2 className="text-foreground font-semibold">
                  {t('preview')}
                </h2>
                <p className="text-muted-foreground text-xs">
                  {t('previewHint')}
                </p>
              </div>
              <div className="border-border flex rounded-lg border p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                  onClick={() => setPreviewMode('desktop')}
                >
                  <Laptop />
                  {t('desktop')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                  onClick={() => setPreviewMode('mobile')}
                >
                  <Smartphone />
                  {t('mobile')}
                </Button>
              </div>
            </div>
            <div className="border-border min-h-[680px] overflow-x-auto rounded-xl border bg-slate-100 p-4 sm:p-8">
              <div
                className={`mx-auto overflow-hidden rounded-lg bg-white shadow-lg transition-[max-width] ${
                  previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-[680px]'
                }`}
              >
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {subject || t('subjectPlaceholder')}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {preheader || t('preheaderPlaceholder')}
                  </p>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={blocks.map((block) => block.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3 p-5 sm:p-8">
                      {blocks.map((block) => (
                        <SortableEmailBlock
                          key={block.id}
                          block={block}
                          selected={block.id === selectedBlockId}
                          label={t(`blockTypes.${block.type}`)}
                          removeLabel={t('removeBlock')}
                          onSelect={() => setSelectedBlockId(block.id)}
                          onRemove={() => removeBlock(block.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Mail className="size-4" />
              {t('deliveryNotice')}
            </div>
          </section>
        </div>
      )}
    </form>
  );
}
