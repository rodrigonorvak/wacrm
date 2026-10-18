'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  Laptop,
  Link2,
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
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  EmailBlock,
  EmailBlockType,
  EmailCampaignAudienceType,
} from '@/lib/email-campaigns/types';
import {
  DEFAULT_EMAIL_DESIGN,
  defaultEmailBlockFontSize,
  type EmailDesignSettings,
} from '@/lib/email-campaigns/types';
import {
  getSafeEmailLinkUrl,
  renderEmailBlock,
} from '@/lib/email-campaigns/render';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
import { parseEmailCampaignContent } from '@/lib/email-campaigns/content';
import {
  buildTemplateBlocks,
  getEmailTemplate,
} from '@/lib/email-campaigns/templates';
import {
  EmailCanvas,
  type EmailCanvasLabels,
} from '@/components/email-campaigns/email-canvas';

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
  templateId?: string;
  cloneFromId?: string;
}

interface EditorSnapshot {
  blocks: EmailBlock[];
  design: EmailDesignSettings;
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
  'hero',
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
    text: type === 'hero' ? 'Seu destaque principal' : '',
    url: '',
    alt: '',
    alignment: type === 'button' || type === 'heading' ? 'center' : 'left',
  };
}

function EmailBlockTextField({
  id,
  label,
  value,
  onChange,
  rows,
  insertLinkLabel,
  linkUrlLabel,
  applyLinkLabel,
  linkHint,
  allowInlineLinks,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  insertLinkLabel: string;
  linkUrlLabel: string;
  applyLinkLabel: string;
  linkHint: string;
  allowInlineLinks: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const selectedText = value.slice(selection.start, selection.end);
  const hasValidSelection =
    selection.end > selection.start && !/[\r\n]/.test(selectedText);
  const safeLinkUrl = getSafeEmailLinkUrl(linkUrl.trim());

  function rememberSelection(element: HTMLTextAreaElement) {
    const next = { start: element.selectionStart, end: element.selectionEnd };
    selectionRef.current = next;
    setSelection(next);
  }

  function insertLink() {
    const { start, end } = selectionRef.current;
    const selected = value.slice(start, end);
    const safeUrl = getSafeEmailLinkUrl(linkUrl.trim());
    if (!safeUrl || start === end || /[\r\n]/.test(selected)) return;
    const escapedLabel = selected.replace(/\]/g, '\\]');
    const markdownUrl = safeUrl.replace(/\)/g, '%29');
    const link = `[${escapedLabel}](${markdownUrl})`;
    onChange(`${value.slice(0, start)}${link}${value.slice(end)}`);
    setShowLinkForm(false);
    setLinkUrl('');
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      const caret = start + link.length;
      element.focus();
      element.setSelectionRange(caret, caret);
      rememberSelection(element);
    });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => {
          rememberSelection(event.currentTarget);
          onChange(event.target.value);
        }}
        onSelect={(event) => rememberSelection(event.currentTarget)}
        onKeyUp={(event) => rememberSelection(event.currentTarget)}
        maxLength={10_000}
        className="border-border bg-background text-foreground min-h-20 rounded-lg border px-3 py-2 text-sm"
      />
      {allowInlineLinks ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasValidSelection}
              onClick={() => {
                if (textareaRef.current) rememberSelection(textareaRef.current);
                setShowLinkForm(true);
              }}
            >
              <Link2 />
              {insertLinkLabel}
            </Button>
            {showLinkForm ? (
              <div className="flex min-w-0 flex-1 gap-2">
                <Input
                  type="text"
                  inputMode="url"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://..."
                  aria-label={linkUrlLabel}
                  className="min-w-0"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!hasValidSelection || !safeLinkUrl}
                  onClick={insertLink}
                >
                  {applyLinkLabel}
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">{linkHint}</p>
        </>
      ) : null}
    </div>
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

  if (block.type === 'hero') {
    return (
      <div
        className={`rounded-lg bg-fuchsia-600 px-6 py-10 font-bold text-white ${alignmentClass}`}
        style={{
          fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
        }}
      >
        {block.text || 'Seu destaque principal'}
      </div>
    );
  }
  if (block.type === 'heading') {
    return (
      <h1
        className={`font-bold break-words whitespace-pre-wrap ${alignmentClass}`}
        style={{
          fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
        }}
      >
        {block.text || 'Título do e-mail'}
      </h1>
    );
  }
  if (block.type === 'text') {
    return (
      <p
        className={`leading-6 break-words whitespace-pre-wrap ${alignmentClass}`}
        style={{
          fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
        }}
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
        <span
          className="inline-flex rounded-md bg-fuchsia-600 px-5 py-2.5 font-semibold text-white"
          style={{
            fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
          }}
        >
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
      className={`border-t border-slate-200 pt-4 leading-5 text-slate-500 ${alignmentClass}`}
      style={{
        fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
      }}
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

function EmailImageUpload({
  labels,
  onUploaded,
}: {
  labels: {
    upload: string;
    uploading: string;
    invalidType: string;
    tooLarge: string;
    failed: string;
    orUrl: string;
  };
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
      toast.error(labels.invalidType);
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error(labels.tooLarge);
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      onUploaded(publicUrl);
    } catch {
      toast.error(labels.failed);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="grid gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
        {uploading ? labels.uploading : labels.upload}
      </Button>
      <p className="text-muted-foreground text-xs">{labels.orUrl}</p>
    </div>
  );
}

function SortableEmailBlock({
  block,
  selected,
  label,
  onSelect,
  onRemove,
  onDuplicate,
  removeLabel,
  duplicateLabel,
}: {
  block: EmailBlock;
  selected: boolean;
  label: string;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  removeLabel: string;
  duplicateLabel: string;
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
            onClick={onDuplicate}
            aria-label={duplicateLabel}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Copy className="size-4" />
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

export function EmailCampaignEditor({
  campaignId,
  templateId,
  cloneFromId,
}: EditorProps) {
  const t = useTranslations('EmailCampaigns');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [dispatchingCampaign, setDispatchingCampaign] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState(campaignId);
  const [testRecipient, setTestRecipient] = useState('');
  const [testDialogOpen, setTestDialogOpen] = useState(false);
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
  const [design, setDesign] =
    useState<EmailDesignSettings>(DEFAULT_EMAIL_DESIGN);
  const [designMode, setDesignMode] = useState(false);
  const [designTab, setDesignTab] = useState<'blocks' | 'settings'>('blocks');
  const [blockHistory, setBlockHistory] = useState<{
    past: EditorSnapshot[];
    future: EditorSnapshot[];
  }>({ past: [], future: [] });
  const blocksRef = useRef(blocks);
  const designRef = useRef(design);
  const editRevisionRef = useRef(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    INITIAL_BLOCKS[0].id
  );
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

  function markDraftChanged() {
    editRevisionRef.current += 1;
    setHasUnsavedChanges(true);
  }

  function confirmLeaveIfDirty(): boolean {
    return !hasUnsavedChanges || window.confirm(t('unsavedChangesConfirm'));
  }

  function currentSnapshot(): EditorSnapshot {
    return { blocks: blocksRef.current, design: designRef.current };
  }

  const replaceLoadedDesign = useCallback((nextDesign: EmailDesignSettings) => {
    designRef.current = nextDesign;
    setDesign(nextDesign);
  }, []);

  function updateDesign(patch: Partial<EmailDesignSettings>) {
    const nextDesign = { ...designRef.current, ...patch };
    setBlockHistory((history) => ({
      past: [...history.past.slice(-49), currentSnapshot()],
      future: [],
    }));
    designRef.current = nextDesign;
    setDesign(nextDesign);
    markDraftChanged();
  }

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
    const sourceId = campaignId ?? cloneFromId;
    if (!sourceId) {
      setHasUnsavedChanges(false);
      editRevisionRef.current = 0;
      setBlockHistory({ past: [], future: [] });
      const template = getEmailTemplate(templateId);
      if (template) {
        const templateBlocks = buildTemplateBlocks(template);
        setName(template.name);
        setSubject(template.subject);
        setPreheader(template.preheader);
        setBlocks(templateBlocks);
        blocksRef.current = templateBlocks;
        replaceLoadedDesign(DEFAULT_EMAIL_DESIGN);
        setSelectedBlockId(templateBlocks[0].id);
      } else {
        setName(t('newCampaignDefault'));
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadCampaign() {
      setLoading(true);
      try {
        const response = await fetch(`/api/email/campaigns/${sourceId}`, {
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || t('loadCampaignFailed'));
        const campaign = payload.campaign;
        if (campaignId && campaign.status !== 'draft') {
          toast.error(t('onlyDraftEditable'));
          router.replace('/broadcasts/email');
          return;
        }
        if (cancelled) return;
        const parsedContent = parseEmailCampaignContent(campaign.content_json);
        const savedBlocks = parsedContent.blocks.length
          ? parsedContent.blocks
          : INITIAL_BLOCKS;
        if (!campaignId) {
          // Cloning a previous campaign copies only its content.
          const clonedBlocks = savedBlocks.map((block: EmailBlock) => ({
            ...block,
            id: crypto.randomUUID(),
          }));
          setName(t('cloneName', { name: campaign.name }));
          setSubject(campaign.subject ?? '');
          setPreheader(campaign.preheader ?? '');
          setBlocks(clonedBlocks);
          blocksRef.current = clonedBlocks;
          replaceLoadedDesign(parsedContent.design);
          setHasUnsavedChanges(false);
          editRevisionRef.current = 0;
          setBlockHistory({ past: [], future: [] });
          setSelectedBlockId(clonedBlocks[0]?.id ?? INITIAL_BLOCKS[0].id);
          return;
        }
        setName(campaign.name);
        setSubject(campaign.subject ?? '');
        setPreheader(campaign.preheader ?? '');
        setSenderId(campaign.sender_connection_id);
        setAudienceType(campaign.audience_type);
        setContactIds(campaign.audience_contact_ids ?? []);
        setPipelineId(campaign.audience_pipeline_id ?? '');
        setStageId(campaign.audience_stage_id ?? '');
        setBlocks(savedBlocks);
        blocksRef.current = savedBlocks;
        replaceLoadedDesign(parsedContent.design);
        setHasUnsavedChanges(false);
        editRevisionRef.current = 0;
        setBlockHistory({ past: [], future: [] });
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
  }, [campaignId, templateId, cloneFromId, replaceLoadedDesign, router, t]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);

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
    updateBlock(selectedBlock.id, patch);
  }

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    commitBlocks(
      blocksRef.current.map((block) =>
        block.id === id ? { ...block, ...patch } : block
      )
    );
  }

  function commitBlockText(id: string, text: string) {
    updateBlock(id, { text });
  }

  function commitBlocks(nextBlocks: EmailBlock[]) {
    const current = blocksRef.current;
    if (current === nextBlocks) return;
    setBlockHistory((history) => ({
      past: [
        ...history.past.slice(-49),
        { blocks: current, design: designRef.current },
      ],
      future: [],
    }));
    blocksRef.current = nextBlocks;
    setBlocks(nextBlocks);
    markDraftChanged();
  }

  function undoBlocks() {
    const previous = blockHistory.past.at(-1);
    if (!previous) return;
    const current = currentSnapshot();
    blocksRef.current = previous.blocks;
    designRef.current = previous.design;
    setBlocks(previous.blocks);
    setDesign(previous.design);
    markDraftChanged();
    setBlockHistory({
      past: blockHistory.past.slice(0, -1),
      future: [current, ...blockHistory.future],
    });
  }

  function redoBlocks() {
    const next = blockHistory.future[0];
    if (!next) return;
    const current = currentSnapshot();
    blocksRef.current = next.blocks;
    designRef.current = next.design;
    setBlocks(next.blocks);
    setDesign(next.design);
    markDraftChanged();
    setBlockHistory({
      past: [...blockHistory.past, current],
      future: blockHistory.future.slice(1),
    });
  }

  function addBlock(type: EmailBlockType) {
    if (blocks.length >= 40) {
      toast.error(t('blockLimit'));
      return;
    }
    const block = newBlock(type);
    commitBlocks([...blocks, block]);
    setSelectedBlockId(block.id);
  }

  function removeBlock(id: string) {
    if (blocks.length <= 1) {
      toast.error(t('atLeastOneBlock'));
      return;
    }
    const nextBlocks = blocks.filter((block) => block.id !== id);
    commitBlocks(nextBlocks);
    if (selectedBlockId === id) setSelectedBlockId(nextBlocks[0].id);
  }

  function duplicateBlock(id: string) {
    const index = blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    if (blocks.length >= 40) {
      toast.error(t('blockLimit'));
      return;
    }
    const duplicated = { ...blocks[index], id: crypto.randomUUID() };
    const nextBlocks = [
      ...blocks.slice(0, index + 1),
      duplicated,
      ...blocks.slice(index + 1),
    ];
    commitBlocks(nextBlocks);
    setSelectedBlockId(duplicated.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = blocks.findIndex((block) => block.id === active.id);
    const toIndex = blocks.findIndex((block) => block.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    commitBlocks(arrayMove(blocks, fromIndex, toIndex));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    const fromIndex = blocks.findIndex((block) => block.id === id);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= blocks.length) return;
    commitBlocks(arrayMove(blocks, fromIndex, toIndex));
  }

  function toggleContact(id: string) {
    if (contactIds.includes(id)) {
      markDraftChanged();
      setContactIds((current) =>
        current.filter((contactId) => contactId !== id)
      );
      return;
    }
    if (contactIds.length >= 1000) {
      toast.error(t('contactSelectionLimit'));
      return;
    }
    markDraftChanged();
    setContactIds((current) => [...current, id]);
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
      content: blocksRef.current,
      design: designRef.current,
    };
  }

  async function persistDraft(): Promise<string> {
    const payload = getDraftPayload();
    const saveRevision = editRevisionRef.current;

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
    if (editRevisionRef.current === saveRevision) {
      setHasUnsavedChanges(false);
    }
    if (!activeCampaignId) {
      setActiveCampaignId(savedId);
      window.history.replaceState(
        window.history.state,
        '',
        `/broadcasts/email/${savedId}`
      );
    }
    return savedId;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditorError(null);
    setSaving(true);
    try {
      await persistDraft();
      toast.success(t('draftSaved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('saveFailed');
      setEditorError(message);
      toast.error(message);
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
      !blocksRef.current.some(
        (block) => block.text.trim() || (block.type === 'image' && block.url)
      )
    ) {
      toast.error(t('testContentRequired'));
      return;
    }

    setSendingTest(true);
    setEditorError(null);
    try {
      const savedId = await persistDraft();
      const response = await fetch(`/api/email/campaigns/${savedId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('testSendFailed'));
      toast.success(t('testSent'));
      setTestDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('testSendFailed');
      setEditorError(message);
      toast.error(message);
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
        // Flush the queue now; batches are small, so loop until drained.
        const maxRuns = Math.min(Math.ceil(result.queuedCount / 2) + 1, 50);
        for (let run = 0; run < maxRuns; run += 1) {
          const dispatch = await fetch('/api/email/campaigns/dispatch', {
            method: 'POST',
          }).catch(() => null);
          if (!dispatch?.ok) break;
          const progress = await dispatch.json().catch(() => null);
          if (!progress || !progress.processed) break;
        }
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
    hero: Heading1,
    heading: Heading1,
    text: Type,
    image: ImageIcon,
    button: MousePointer2,
    divider: Minus,
    spacer: Space,
    footer: PanelBottom,
  };
  const imageUploadLabels = {
    upload: t('uploadImage'),
    uploading: t('uploadingImage'),
    invalidType: t('imageInvalidType'),
    tooLarge: t('imageTooLarge'),
    failed: t('imageUploadFailed'),
    orUrl: t('imageOrUrl'),
  };
  const canvasLabels: EmailCanvasLabels = {
    blockTypes: {
      hero: t('blockTypes.hero'),
      heading: t('blockTypes.heading'),
      text: t('blockTypes.text'),
      image: t('blockTypes.image'),
      button: t('blockTypes.button'),
      divider: t('blockTypes.divider'),
      spacer: t('blockTypes.spacer'),
      footer: t('blockTypes.footer'),
    },
    placeholders: {
      hero: t('canvasPlaceholderHero'),
      heading: t('canvasPlaceholderHeading'),
      text: t('canvasPlaceholderText'),
      button: t('canvasPlaceholderButton'),
      footer: t('canvasPlaceholderFooter'),
      image: t('canvasPlaceholderImage'),
    },
    moveUp: t('moveBlockUp'),
    moveDown: t('moveBlockDown'),
    duplicate: t('duplicateBlock'),
    remove: t('removeBlock'),
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (designMode) {
    return (
      <form
        onSubmit={saveDraft}
        className="relative -mx-4 -mt-4 -mb-20 flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-slate-100 sm:-mx-6 sm:-mt-6 sm:-mb-24 lg:-mb-6"
      >
        <header className="border-border bg-background flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('backToCampaign')}
              onClick={() => setDesignMode(false)}
            >
              <ArrowLeft />
            </Button>
            <div>
              <p className="text-muted-foreground text-xs">
                {t('designEditor')}
              </p>
              <p className="text-foreground max-w-[40vw] truncate text-sm font-semibold">
                {name || t('newCampaign')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('undo')}
              title={t('undo')}
              disabled={!blockHistory.past.length}
              onClick={undoBlocks}
            >
              <Undo2 />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('redo')}
              title={t('redo')}
              disabled={!blockHistory.future.length}
              onClick={redoBlocks}
            >
              <Redo2 />
            </Button>
            <details className="relative">
              <summary
                className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-xs"
                aria-disabled={
                  saving ||
                  sendingTest ||
                  dispatchingCampaign ||
                  senders.length === 0
                }
                onClick={(event) => {
                  if (
                    saving ||
                    sendingTest ||
                    dispatchingCampaign ||
                    senders.length === 0
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                {sendingTest ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t('sendTest')}
              </summary>
              <div className="bg-popover text-popover-foreground absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-lg border p-4 shadow-lg">
                <div className="grid gap-2">
                  <Label htmlFor="design-test-recipient">
                    {t('testRecipient')}
                  </Label>
                  <Input
                    id="design-test-recipient"
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={testRecipient}
                    onChange={(event) => setTestRecipient(event.target.value)}
                    placeholder={t('testRecipientPlaceholder')}
                    maxLength={254}
                    disabled={saving || sendingTest}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t('testSendHint')}
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    saving ||
                    sendingTest ||
                    dispatchingCampaign ||
                    senders.length === 0
                  }
                  onClick={() => void sendTestEmail()}
                >
                  {sendingTest ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  {sendingTest ? t('sendingTest') : t('sendTest')}
                </Button>
              </div>
            </details>
            <Button
              type="submit"
              disabled={saving || sendingTest || senders.length === 0}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving ? t('saving') : t('saveDraft')}
            </Button>
          </div>
        </header>

        {editorError ? (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
          >
            {editorError}
          </div>
        ) : null}

        {senders.length === 0 ? (
          <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          >
            <span className="font-medium">{t('noSendersTitle')}. </span>
            {t('noSendersDescription')}{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => router.push('/broadcasts/email/senders')}
            >
              {t('manageSenders')}
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground min-w-0 text-xs">
                <p className="truncate font-medium text-slate-700">
                  {subject || t('subjectPlaceholder')}
                </p>
                <p className="truncate">
                  {preheader || t('preheaderPlaceholder')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === 'desktop' ? 'secondary' : 'outline'}
                  onClick={() => setPreviewMode('desktop')}
                >
                  <Laptop />
                  {t('desktop')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === 'mobile' ? 'secondary' : 'outline'}
                  onClick={() => setPreviewMode('mobile')}
                >
                  <Smartphone />
                  {t('mobile')}
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-xl bg-slate-200 p-3 sm:p-6">
              <div
                className="min-h-full w-full shrink-0"
                style={{ background: design.emailBackground }}
              >
                <EmailCanvas
                  blocks={blocks}
                  design={design}
                  selectedId={selectedBlockId}
                  mobile={previewMode === 'mobile'}
                  labels={canvasLabels}
                  onSelect={setSelectedBlockId}
                  onTextCommit={commitBlockText}
                  onMove={moveBlock}
                  onDuplicate={duplicateBlock}
                  onRemove={removeBlock}
                />
              </div>
            </div>
          </main>

          <aside className="border-border bg-background max-h-[45%] shrink-0 overflow-y-auto border-t lg:max-h-none lg:w-[min(360px,34vw)] lg:border-t-0 lg:border-l">
            <div className="border-border bg-background sticky top-0 z-10 grid grid-cols-2 border-b p-2">
              <Button
                type="button"
                variant={designTab === 'blocks' ? 'secondary' : 'ghost'}
                onClick={() => setDesignTab('blocks')}
              >
                {t('blocks')}
              </Button>
              <Button
                type="button"
                variant={designTab === 'settings' ? 'secondary' : 'ghost'}
                onClick={() => setDesignTab('settings')}
              >
                {t('designSettings')}
              </Button>
            </div>
            {designTab === 'blocks' ? (
              <div className="space-y-3 p-3">
                <div className="space-y-1">
                  {BLOCK_TYPE_ORDER.map((type) => {
                    const Icon = blockIcons[type];
                    return (
                      <details
                        key={type}
                        className="border-border rounded-lg border"
                      >
                        <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium">
                          <span className="flex items-center gap-2">
                            <Icon className="text-primary size-4" />
                            {t(`blockTypes.${type}`)}
                          </span>
                          <ChevronDown className="size-4" />
                        </summary>
                        <div className="px-3 pb-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => addBlock(type)}
                            disabled={blocks.length >= 40}
                          >
                            {t('addBlock')}
                          </Button>
                        </div>
                      </details>
                    );
                  })}
                </div>

                <section className="border-border space-y-2 border-t pt-3">
                  <h2 className="text-foreground text-sm font-semibold">
                    {t('emailContent')}
                  </h2>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={blocks.map((block) => block.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {blocks.map((block) => (
                          <SortableEmailBlock
                            key={block.id}
                            block={block}
                            selected={block.id === selectedBlockId}
                            label={t(`blockTypes.${block.type}`)}
                            removeLabel={t('removeBlock')}
                            duplicateLabel={t('duplicateBlock')}
                            onSelect={() => setSelectedBlockId(block.id)}
                            onRemove={() => removeBlock(block.id)}
                            onDuplicate={() => duplicateBlock(block.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>

                {selectedBlock && (
                  <section className="border-border space-y-3 border-t pt-3">
                    <h2 className="text-foreground text-sm font-semibold">
                      {t('blockSettings')}
                    </h2>
                    {['hero', 'heading', 'text', 'button', 'footer'].includes(
                      selectedBlock.type
                    ) && (
                      <>
                        <EmailBlockTextField
                          key={selectedBlock.id}
                          id={`design-block-text-${selectedBlock.id}`}
                          label={t('blockText')}
                          rows={selectedBlock.type === 'hero' ? 2 : 4}
                          value={selectedBlock.text}
                          onChange={(text) => updateSelectedBlock({ text })}
                          insertLinkLabel={t('insertLink')}
                          linkUrlLabel={t('linkUrl')}
                          applyLinkLabel={t('applyLink')}
                          linkHint={t('inlineLinkHint')}
                          allowInlineLinks={selectedBlock.type !== 'button'}
                        />
                        {[
                          'hero',
                          'heading',
                          'text',
                          'button',
                          'footer',
                        ].includes(selectedBlock.type) && (
                          <div className="grid gap-2">
                            <Label htmlFor="design-block-font-size">
                              {t('fontSize')} (
                              {selectedBlock.fontSize ??
                                defaultEmailBlockFontSize(selectedBlock.type)}
                              px)
                            </Label>
                            <Input
                              id="design-block-font-size"
                              type="range"
                              min={10}
                              max={72}
                              step={1}
                              value={
                                selectedBlock.fontSize ??
                                defaultEmailBlockFontSize(selectedBlock.type)
                              }
                              onChange={(event) =>
                                updateSelectedBlock({
                                  fontSize: Number(event.target.value),
                                })
                              }
                            />
                          </div>
                        )}
                      </>
                    )}
                    {selectedBlock.type === 'image' && (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="design-image-url">
                            {t('imageUrl')}
                          </Label>
                          <EmailImageUpload
                            labels={imageUploadLabels}
                            onUploaded={(url) => updateSelectedBlock({ url })}
                          />
                          <Input
                            id="design-image-url"
                            type="url"
                            value={selectedBlock.url}
                            onChange={(event) =>
                              updateSelectedBlock({ url: event.target.value })
                            }
                            placeholder="https://..."
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="design-image-alt">
                            {t('imageAlt')}
                          </Label>
                          <Input
                            id="design-image-alt"
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
                        <Label htmlFor="design-button-url">
                          {t('buttonUrl')}
                        </Label>
                        <Input
                          id="design-button-url"
                          type="url"
                          value={selectedBlock.url}
                          onChange={(event) =>
                            updateSelectedBlock({ url: event.target.value })
                          }
                          placeholder="https://..."
                        />
                      </div>
                    )}
                    {['hero', 'heading', 'text', 'button', 'footer'].includes(
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
                              onClick={() => updateSelectedBlock({ alignment })}
                            >
                              <Icon />
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            ) : (
              <div className="space-y-4 p-4">
                <h2 className="text-foreground font-semibold">
                  {t('designSettings')}
                </h2>
                <div className="grid gap-2">
                  <Label htmlFor="design-font">{t('fontFamily')}</Label>
                  <select
                    id="design-font"
                    value={design.fontFamily}
                    onChange={(event) =>
                      updateDesign({
                        fontFamily: event.target
                          .value as EmailDesignSettings['fontFamily'],
                      })
                    }
                    className="border-border bg-background h-9 rounded-lg border px-3 text-sm"
                  >
                    {(['Arial', 'Georgia', 'Verdana'] as const).map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                </div>
                {(
                  [
                    ['emailBackground', 'emailBackground'],
                    ['sectionBackground', 'sectionBackground'],
                    ['primaryText', 'primaryTextColor'],
                    ['secondaryText', 'secondaryTextColor'],
                    ['buttonColor', 'buttonColor'],
                    ['accentColor', 'accentColor'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`design-${key}`}>{t(label)}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`design-${key}`}
                        type="color"
                        value={design[key]}
                        onChange={(event) =>
                          updateDesign({ [key]: event.target.value })
                        }
                        className="h-10 w-14 p-1"
                      />
                      <span className="text-muted-foreground text-xs">
                        {design[key]}
                      </span>
                    </div>
                  </div>
                ))}
                {(
                  [
                    ['sectionSpacing', 'sectionSpacing', 8, 96],
                    ['cornerRadius', 'cornerRadius', 0, 32],
                    ['buttonRadius', 'buttonRadius', 0, 32],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`design-${key}`}>
                      {t(label)} ({design[key]}px)
                    </Label>
                    <Input
                      id={`design-${key}`}
                      type="range"
                      min={min}
                      max={max}
                      value={design[key]}
                      onChange={(event) =>
                        updateDesign({ [key]: Number(event.target.value) })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={saveDraft}
      className="-mx-4 -mt-4 -mb-6 flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-slate-50 sm:-mx-6"
    >
      <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('backToCampaigns')}
            onClick={() => {
              if (confirmLeaveIfDirty()) router.push('/broadcasts/email');
            }}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h1 className="text-foreground truncate text-base font-bold">
              {t('section')}
            </h1>
            <select
              id="campaign-sender"
              value={senderId}
              onChange={(event) => {
                markDraftChanged();
                setSenderId(event.target.value);
              }}
              required
              aria-label={t('sender')}
              className="mt-0.5 max-w-[min(50vw,360px)] truncate border-0 bg-transparent p-0 text-xs text-slate-500 outline-none"
            >
              <option value="">{t('selectSender')}</option>
              {senders.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.name} · {sender.from_email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            aria-label={saving ? t('saving') : t('saveDraft')}
            title={saving ? t('saving') : t('saveDraft')}
            disabled={saving || sendingTest || dispatchingCampaign}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              saving ||
              sendingTest ||
              dispatchingCampaign ||
              senders.length === 0
            }
            onClick={() => setTestDialogOpen(true)}
          >
            {sendingTest ? <Loader2 className="animate-spin" /> : <Send />}
            {sendingTest ? t('sendingTest') : t('sendTest')}
          </Button>
          <Dialog
            open={testDialogOpen}
            onOpenChange={(open) => {
              if (!sendingTest) setTestDialogOpen(open);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('sendTest')}</DialogTitle>
                <DialogDescription>{t('testSendHint')}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="test-dialog-recipient">
                  {t('testRecipient')}
                </Label>
                <Input
                  id="test-dialog-recipient"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (!sendingTest) void sendTestEmail();
                    }
                  }}
                  placeholder={t('testRecipientPlaceholder')}
                  maxLength={254}
                  disabled={sendingTest}
                />
                {editorError && (
                  <p className="text-destructive text-xs">{editorError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={sendingTest || saving || senders.length === 0}
                  onClick={() => void sendTestEmail()}
                >
                  {sendingTest ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Send />
                  )}
                  {sendingTest ? t('sendingTest') : t('sendTest')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            className="bg-blue-600 text-white hover:bg-blue-700"
            disabled={
              saving ||
              sendingTest ||
              dispatchingCampaign ||
              senders.length === 0
            }
            onClick={() =>
              scheduledAtLocal ? scheduleCampaign() : void queueCampaign(null)
            }
          >
            {dispatchingCampaign ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            {dispatchingCampaign ? t('preparingDelivery') : t('sendNow')}
          </Button>
        </div>
      </header>

      {editorError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {editorError}
        </div>
      ) : null}

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
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
          <aside className="order-2 flex flex-col gap-3 overflow-y-auto xl:order-2">
            <details open className="group" style={{ order: 1 }}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                {t('campaignName')}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <section className="space-y-3 rounded-b-lg border border-t-0 border-slate-200 bg-white p-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="campaign-name"
                    className="text-xs text-slate-600"
                  >
                    {t('campaignName')}
                  </Label>
                  <Input
                    id="campaign-name"
                    value={name}
                    onChange={(event) => {
                      markDraftChanged();
                      setName(event.target.value);
                    }}
                    maxLength={120}
                    required
                  />
                </div>
              </section>
            </details>

            <details className="group" style={{ order: 3 }}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                {t('sendDate')}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <section className="space-y-3 rounded-b-lg border border-t-0 border-slate-200 bg-white p-4">
                <p className="text-muted-foreground text-xs">
                  {t('deliveryScheduleHint')}
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="campaign-schedule">{t('scheduleAt')}</Label>
                  <Input
                    id="campaign-schedule"
                    type="datetime-local"
                    min={toLocalDateTimeInputValue(
                      new Date(Date.now() + 60_000)
                    )}
                    value={scheduledAtLocal}
                    onChange={(event) =>
                      setScheduledAtLocal(event.target.value)
                    }
                    disabled={dispatchingCampaign}
                  />
                  {scheduledAtLocal ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledAtLocal('')}
                      disabled={dispatchingCampaign}
                    >
                      {t('clearSchedule')}
                    </Button>
                  ) : null}
                </div>
              </section>
            </details>

            <section
              className="space-y-1 rounded-lg border border-slate-200 bg-white px-4 shadow-sm"
              style={{ order: 5 }}
            >
              {(
                [
                  'abTesting',
                  'recurringCampaign',
                  'automaticResend',
                  'gradualDelivery',
                ] as const
              ).map((key) => (
                <div
                  key={key}
                  className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0"
                >
                  <span className="text-sm text-slate-700">{t(key)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {t('comingSoon')}
                    </span>
                    <button
                      type="button"
                      disabled
                      aria-label={`${t(key)} — ${t('comingSoon')}`}
                      className="relative h-5 w-9 cursor-not-allowed rounded-full bg-slate-200 opacity-70"
                    >
                      <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <details className="group" style={{ order: 2 }}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                {t('audience')}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <section className="space-y-4 rounded-b-lg border border-t-0 border-slate-200 bg-white p-4">
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
                        onChange={() => {
                          if (audienceType !== type) markDraftChanged();
                          setAudienceType(type);
                        }}
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
                          markDraftChanged();
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
                        onChange={(event) => {
                          markDraftChanged();
                          setStageId(event.target.value);
                        }}
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
            </details>

            <details className="group" style={{ order: 4 }}>
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                {t('subjectAndPreheader')}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <section className="space-y-3 rounded-b-lg border border-t-0 border-slate-200 bg-white p-4">
                <div className="grid gap-2">
                  <Label
                    htmlFor="campaign-subject"
                    className="text-xs text-slate-600"
                  >
                    {t('subject')}
                  </Label>
                  <Input
                    id="campaign-subject"
                    value={subject}
                    onChange={(event) => {
                      markDraftChanged();
                      setSubject(event.target.value);
                    }}
                    maxLength={255}
                    placeholder={t('subjectPlaceholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label
                    htmlFor="campaign-preheader"
                    className="text-xs text-slate-600"
                  >
                    {t('preheader')}
                  </Label>
                  <Input
                    id="campaign-preheader"
                    value={preheader}
                    onChange={(event) => {
                      markDraftChanged();
                      setPreheader(event.target.value);
                    }}
                    maxLength={250}
                    placeholder={t('preheaderPlaceholder')}
                  />
                </div>
              </section>
            </details>
          </aside>

          <section className="flex min-h-[480px] min-w-0 flex-col gap-3 xl:min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={previewMode === 'desktop' ? 'default' : 'ghost'}
                  onClick={() => setPreviewMode('desktop')}
                  className={
                    previewMode === 'desktop'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'text-slate-600'
                  }
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setDesignMode(true)}
              >
                <Type />
                {t('editDesign')}
              </Button>
            </div>
            <div
              className="relative min-h-[560px] flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-4 sm:p-8"
              style={{
                backgroundImage:
                  'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              <div
                className={`mx-auto overflow-hidden rounded-lg bg-white shadow-lg transition-[max-width] ${
                  previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-[680px]'
                }`}
              >
                <div className="border-b border-slate-200 bg-white px-5 py-3">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {subject || t('subjectPlaceholder')}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {preheader || t('preheaderPlaceholder')}
                  </p>
                </div>
                <div
                  className="space-y-0"
                  style={{
                    background: design.emailBackground,
                    fontFamily: `${design.fontFamily}, sans-serif`,
                  }}
                >
                  <div
                    className="mx-auto"
                    style={{
                      maxWidth: 640,
                      background: design.sectionBackground,
                      borderRadius: design.cornerRadius,
                      padding: design.sectionSpacing,
                    }}
                  >
                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        dangerouslySetInnerHTML={{
                          __html: renderEmailBlock(block, design),
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </form>
  );
}
