'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type {
  Pipeline,
  PipelineStage,
  Deal,
  DealLabel,
  DealCustomFieldValue,
} from '@/types';
import { DealLabelsDialog } from '@/components/pipelines/deal-labels-dialog';
import { DealScheduleDialog } from '@/components/pipelines/deal-schedule-dialog';
import { PipelineBoard } from '@/components/pipelines/pipeline-board';
import { PipelineList } from '@/components/pipelines/pipeline-list';
import { PipelineSettings } from '@/components/pipelines/pipeline-settings';
import { DealForm } from '@/components/pipelines/deal-form';
import { AddContactsDialog } from '@/components/pipelines/add-contacts-dialog';
import {
  generateLeadIntegrationToken,
  hashLeadIntegrationToken,
} from '@/lib/integrations/lead-token';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GitBranch,
  Plus,
  ChevronDown,
  Settings,
  Copy,
  Filter,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_PIPELINE_CARD_FIELDS,
  normalizePipelineCardFields,
  type PipelineCardField,
} from '@/lib/pipelines/card-fields';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import { isPaidStageName } from '@/lib/pipelines/paid-stage';

// Pipeline creation is admin-class (settings-tier write under
// the new RLS); deal creation is operational and only requires
// agent+. The two CTAs gate on different `useCan` capabilities,
// not on different copy.

// Spec-defined seed — name and color per the product spec.
const SPEC_DEFAULT_STAGES = [
  { nameKey: 'defaultStages.newLead', color: '#3b82f6', position: 0 }, // blue
  { nameKey: 'defaultStages.qualified', color: '#eab308', position: 1 }, // yellow
  { nameKey: 'defaultStages.proposalSent', color: '#f97316', position: 2 }, // orange
  { nameKey: 'defaultStages.negotiation', color: '#8b5cf6', position: 3 }, // purple
  { nameKey: 'defaultStages.won', color: '#22c55e', position: 4 }, // green
] as const;

const INTEGRATED_DEFAULT_STAGES = [
  { name: 'Novo Lead', color: '#3b82f6', position: 0 },
  { name: 'Prospecção iniciada', color: '#eab308', position: 1 },
  { name: 'Reunião', color: '#f97316', position: 2 },
  { name: 'Contrato a ser assinado', color: '#8b5cf6', position: 3 },
  { name: 'Contrato pago', color: '#22c55e', position: 4 },
];

const DEFAULT_ELEMENTOR_MAPPINGS = [
  { sourceId: 'name', fieldName: 'Nome' },
  { sourceId: 'phone', fieldName: 'Telefone' },
  { sourceId: 'email', fieldName: 'E-mail' },
  { sourceId: 'company', fieldName: 'Empresa' },
  { sourceId: 'message', fieldName: 'Mensagem' },
];

type DateFilter = 'today' | '7' | '14' | '30' | 'max' | 'custom';

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: 'Hoje',
  '7': 'Últimos 7 dias',
  '14': 'Últimos 14 dias',
  '30': 'Últimos 30 dias',
  max: 'Máximo',
  custom: 'Personalizado',
};

function isDateFilter(value: string | null): value is DateFilter {
  return (
    value === 'today' ||
    value === '7' ||
    value === '14' ||
    value === '30' ||
    value === 'max' ||
    value === 'custom'
  );
}

function mappingTarget(fieldName: string): {
  targetType: 'contact' | 'deal' | 'contact_custom_field';
  targetKey: string;
  required: boolean;
} {
  const normalized = fieldName
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['nome', 'name', 'nome completo'].includes(normalized)) {
    return { targetType: 'contact', targetKey: 'name', required: true };
  }
  if (['telefone', 'phone', 'whatsapp', 'celular'].includes(normalized)) {
    return { targetType: 'contact', targetKey: 'phone', required: true };
  }
  if (['email', 'e-mail'].includes(normalized)) {
    return { targetType: 'contact', targetKey: 'email', required: false };
  }
  if (['empresa', 'company'].includes(normalized)) {
    return { targetType: 'contact', targetKey: 'company', required: false };
  }
  if (
    ['mensagem', 'message', 'observacao', 'observacoes'].includes(normalized)
  ) {
    return { targetType: 'deal', targetKey: 'notes', required: false };
  }
  return {
    targetType: 'contact_custom_field',
    targetKey: fieldName.trim(),
    required: false,
  };
}

function parseBrlAmount(raw: string): number | null {
  const normalized = raw
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
  const decimal = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  const amount = Number(decimal);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isPermissionDenied(
  error: { code?: string; message?: string } | null | undefined
) {
  return (
    error?.code === '42501' ||
    /row-level security policy/i.test(error?.message ?? '')
  );
}

export default function PipelinesPage() {
  const router = useRouter();
  const t = useTranslations('Pipelines.page');
  const tBoard = useTranslations('Pipelines.board');
  const supabase = createClient();
  const canEditSettings = useCan('edit-settings');
  const canCreateDeals = useCan('send-messages');
  const { accountId, user } = useAuth();
  const userId = user?.id;

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [labelsDealId, setLabelsDealId] = useState<string | null>(null);
  const [scheduleDealId, setScheduleDealId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('max');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineType, setNewPipelineType] = useState<
    'standard' | 'integrated'
  >('standard');
  const [creating, setCreating] = useState(false);
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState<string | null>(
    null
  );
  const [elementorMappings, setElementorMappings] = useState(
    DEFAULT_ELEMENTOR_MAPPINGS
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [pickContactsOpen, setPickContactsOpen] = useState(false);
  const [visibleCardFields, setVisibleCardFields] = useState<
    PipelineCardField[]
  >(DEFAULT_PIPELINE_CARD_FIELDS);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>('');
  const [paidMove, setPaidMove] = useState<{
    dealId: string;
    stageId: string;
    dealTitle: string;
  } | null>(null);
  const [paidAmountInput, setPaidAmountInput] = useState('');

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);
  const routeStateRestored = useRef(false);

  // This effect synchronizes a browser preference after auth identifies the user.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!userId) return;
    try {
      const stored = localStorage.getItem(
        `wacrm.pipeline.card-fields.${userId}`
      );
      if (stored !== null)
        setVisibleCardFields(normalizePipelineCardFields(JSON.parse(stored)));
    } catch {
      setVisibleCardFields(DEFAULT_PIPELINE_CARD_FIELDS);
    }
  }, [userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateVisibleCardFields = useCallback(
    (fields: PipelineCardField[]) => {
      setVisibleCardFields(fields);
      if (!userId) return;
      try {
        localStorage.setItem(
          `wacrm.pipeline.card-fields.${userId}`,
          JSON.stringify(fields)
        );
      } catch {
        // Keep the selection for the current page even when storage is unavailable.
      }
    },
    [userId]
  );

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from('pipelines')
      .select('*')
      .order('created_at');
    if (error) {
      console.error('Failed to load pipelines:', error.message);
      return [];
    }
    return data ?? [];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('position');
      return data ?? [];
    },
    [supabase]
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data, error } = await supabase
        .from('deals')
        .select(
          '*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)'
        )
        .eq('pipeline_id', pipelineId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load pipeline deals:', error.message);
        return [];
      }
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const dealIds = rows.map((row) => row.id);
      const [labelResult, customValueResult] = await Promise.all([
        supabase
          .from('deal_label_links')
          .select('deal_id, label:deal_labels(*)')
          .in('deal_id', dealIds),
        supabase
          .from('deal_custom_field_values')
          .select(
            'deal_id, field_id, value, field:pipeline_custom_fields(field_name, show_on_card)'
          )
          .in('deal_id', dealIds),
      ]);
      if (labelResult.error)
        console.error('Failed to load deal labels:', labelResult.error.message);
      if (customValueResult.error)
        console.error(
          'Failed to load pipeline custom values:',
          customValueResult.error.message
        );

      const labelsByDeal = new Map<string, DealLabel[]>();
      for (const row of labelResult.data ?? []) {
        const label = Array.isArray(row.label) ? row.label[0] : row.label;
        if (!label) continue;
        const current = labelsByDeal.get(row.deal_id) ?? [];
        current.push(label);
        labelsByDeal.set(row.deal_id, current);
      }
      const customValuesByDeal = new Map<string, DealCustomFieldValue[]>();
      for (const row of customValueResult.data ?? []) {
        const current = customValuesByDeal.get(row.deal_id) ?? [];
        const field = Array.isArray(row.field) ? row.field[0] : row.field;
        current.push({
          field_id: row.field_id,
          value: row.value,
          field: field
            ? { field_name: field.field_name, show_on_card: field.show_on_card }
            : undefined,
        });
        customValuesByDeal.set(row.deal_id, current);
      }
      const contactIds = [
        ...new Set(rows.map((row) => row.contact_id).filter(Boolean)),
      ];
      const lastNoteByContact = new Map<string, string>();
      if (contactIds.length > 0) {
        const { data: noteRows } = await supabase
          .from('contact_notes')
          .select('contact_id, note_text, created_at')
          .in('contact_id', contactIds)
          .order('created_at', { ascending: false });
        for (const note of noteRows ?? []) {
          if (!lastNoteByContact.has(note.contact_id))
            lastNoteByContact.set(note.contact_id, note.note_text);
        }
      }
      return rows.map((row) => ({
        ...row,
        last_note: lastNoteByContact.get(row.contact_id) ?? null,
        labels: labelsByDeal.get(row.id) ?? [],
        custom_values: customValuesByDeal.get(row.id) ?? [],
      })) as Deal[];
    },
    [supabase]
  );

  const seedDefaultPipeline =
    useCallback(async (): Promise<Pipeline | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;
      // pipelines.account_id is NOT NULL post-017 with no DB default.
      if (!accountId) return null;

      const { data: pipeline, error } = await supabase
        .from('pipelines')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: t('defaultPipelineName'),
        })
        .select()
        .single();

      if (error || !pipeline) {
        console.error('Failed to seed pipeline:', error?.message);
        return null;
      }

      const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
        pipeline_id: pipeline.id,
        name: t(s.nameKey),
        color: s.color,
        position: s.position,
      }));
      await supabase.from('pipeline_stages').insert(stagesPayload);

      return pipeline as Pipeline;
    }, [supabase, accountId, t]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      const params = new URLSearchParams(window.location.search);
      const requestedPipelineId = params.get('pipeline');
      if (!routeStateRestored.current) {
        routeStateRestored.current = true;
        const requestedDateFilter = params.get('date');
        const requestedView = params.get('view');
        if (isDateFilter(requestedDateFilter))
          setDateFilter(requestedDateFilter);
        if (requestedView === 'kanban' || requestedView === 'list')
          setViewMode(requestedView);
        if (params.has('stage')) setStageFilter(params.get('stage') || 'all');
        if (params.has('start')) setCustomStartDate(params.get('start') || '');
        if (params.has('end')) setCustomEndDate(params.get('end') || '');
      }
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev)
            ? prev
            : requestedPipelineId &&
                list.some((p) => p.id === requestedPipelineId)
              ? requestedPipelineId
              : list[0].id
        );
      } else {
        setSelectedPipelineId('');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId('');
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
    setStageFilter('all');
  }, [loadStages, selectedPipelineId]);

  const handleStageColorChange = useCallback(
    async (stageId: string, color: string) => {
      const { error } = await supabase
        .from('pipeline_stages')
        .update({ color })
        .eq('id', stageId)
        .eq('pipeline_id', selectedPipelineId);
      if (error) {
        toast.error(t('toastFailedStageColor'));
        return;
      }
      setStages((current) =>
        current.map((stage) =>
          stage.id === stageId ? { ...stage, color } : stage
        )
      );
    },
    [selectedPipelineId, supabase, t]
  );

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const saveDealStage = useCallback(
    async (dealId: string, newStageId: string, paidAmount?: number) => {
      const nextStage = stages.find((stage) => stage.id === newStageId);
      setDeals((prev) =>
        prev.map((deal) =>
          deal.id === dealId
            ? {
                ...deal,
                stage_id: newStageId,
                stage: nextStage ?? deal.stage,
                ...(paidAmount !== undefined
                  ? { value: paidAmount, currency: 'BRL' }
                  : {}),
              }
            : deal
        )
      );
      const response = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_id: newStageId,
          ...(paidAmount !== undefined
            ? { value: paidAmount, currency: 'BRL' }
            : {}),
        }),
      });
      if (!response.ok) {
        toast.error(t('toastFailedMoveDeal'));
        refreshDeals();
        return false;
      }
      return true;
    },
    [stages, refreshDeals, t]
  );

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      const deal = deals.find((item) => item.id === dealId);
      const nextStage = stages.find((stage) => stage.id === newStageId);
      if (!deal || !nextStage) return;
      if (isPaidStageName(nextStage.name)) {
        setPaidMove({ dealId, stageId: newStageId, dealTitle: deal.title });
        setPaidAmountInput('');
        return;
      }
      await saveDealStage(dealId, newStageId);
    },
    [deals, stages, saveDealStage]
  );

  async function confirmPaidMove() {
    if (!paidMove) return;
    const amount = parseBrlAmount(paidAmountInput);
    if (amount === null) {
      toast.error(t('paidStageAmountInvalid'));
      return;
    }
    const moved = await saveDealStage(
      paidMove.dealId,
      paidMove.stageId,
      amount
    );
    if (moved) setPaidMove(null);
  }

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? '');
      const isManual =
        pipelines.find((pipeline) => pipeline.id === selectedPipelineId)
          ?.pipeline_type !== 'integrated';
      if (isManual) setPickContactsOpen(true);
      else setDealFormOpen(true);
    },
    [stages, pipelines, selectedPipelineId]
  );

  const handleEditDeal = useCallback(
    (deal: Deal) => {
      const params = new URLSearchParams({
        pipeline: selectedPipelineId,
        stage: stageFilter,
        date: dateFilter,
        view: viewMode,
      });
      if (customStartDate) params.set('start', customStartDate);
      if (customEndDate) params.set('end', customEndDate);
      router.push(`/pipelines/${deal.id}?${params.toString()}`);
    },
    [
      router,
      selectedPipelineId,
      stageFilter,
      dateFilter,
      viewMode,
      customStartDate,
      customEndDate,
    ]
  );

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    if (
      newPipelineType === 'integrated' &&
      (!elementorMappings.some(
        (mapping) =>
          mappingTarget(mapping.fieldName).targetKey === 'name' &&
          mapping.sourceId.trim()
      ) ||
        !elementorMappings.some(
          (mapping) =>
            mappingTarget(mapping.fieldName).targetKey === 'phone' &&
            mapping.sourceId.trim()
        ))
    ) {
      toast.error('Informe os IDs dos campos de nome e telefone do Elementor.');
      return;
    }
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) {
      toast.error(t('toastNotLinkedToAccount'));
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name,
        pipeline_type: newPipelineType,
      })
      .select()
      .single();

    if (error || !pipeline) {
      console.error('Failed to create pipeline:', error);
      toast.error(
        isPermissionDenied(error)
          ? t('pipelineOwnerOnly')
          : t('toastFailedCreatePipeline')
      );
      setCreating(false);
      return;
    }

    const defaultStages =
      newPipelineType === 'integrated'
        ? INTEGRATED_DEFAULT_STAGES
        : SPEC_DEFAULT_STAGES;
    const stagesPayload = defaultStages.map((s) => ({
      pipeline_id: pipeline.id,
      name: 'nameKey' in s ? t(s.nameKey) : s.name,
      color: s.color,
      position: s.position,
    }));
    const { error: stagesError } = await supabase
      .from('pipeline_stages')
      .insert(stagesPayload);
    if (stagesError) {
      console.error(
        'Failed to create integrated pipeline stages:',
        stagesError
      );
      await supabase.from('pipelines').delete().eq('id', pipeline.id);
      toast.error(
        isPermissionDenied(stagesError)
          ? t('pipelineOwnerOnly')
          : stagesError.message || t('toastFailedCreatePipeline')
      );
      setCreating(false);
      return;
    }

    if (newPipelineType === 'integrated') {
      const token = generateLeadIntegrationToken();
      const tokenHash = await hashLeadIntegrationToken(token);
      const { data: integration, error: integrationError } = await supabase
        .from('lead_integrations')
        .insert({
          account_id: accountId,
          pipeline_id: pipeline.id,
          provider: 'elementor',
          name: `${name} - Elementor`,
          token_hash: tokenHash,
          token_prefix: token.slice(0, 11),
          created_by: user.id,
        })
        .select('id')
        .single();
      if (integrationError || !integration) {
        console.error('Failed to create lead integration:', integrationError);
        await supabase.from('pipelines').delete().eq('id', pipeline.id);
        toast.error(
          integrationError?.message || t('toastFailedCreatePipeline')
        );
        setCreating(false);
        return;
      }
      const integrationId = (integration as unknown as { id: string }).id;

      const mappingRows = elementorMappings
        .filter(
          (mapping) => mapping.sourceId.trim() && mapping.fieldName.trim()
        )
        .map((mapping) => {
          const target = mappingTarget(mapping.fieldName);
          return {
            integration_id: integrationId,
            source_field_id: mapping.sourceId.trim(),
            source_label: mapping.fieldName.trim(),
            target_type: target.targetType,
            target_key: target.targetKey,
            is_required: target.required,
          };
        });
      const { error: mappingsError } = await supabase
        .from('lead_integration_mappings')
        .insert(mappingRows);
      if (mappingsError) {
        console.error('Failed to create lead mappings:', mappingsError);
        await supabase.from('pipelines').delete().eq('id', pipeline.id);
        toast.error(mappingsError.message || t('toastFailedCreatePipeline'));
        setCreating(false);
        return;
      }
      setCreatedWebhookUrl(
        `${window.location.origin}/api/integrations/elementor/${pipeline.id}/${token}`
      );
    }

    setNewPipelineName('');
    setNewPipelineType('standard');
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t('toastPipelineCreated'));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  const filteredDeals = deals.filter((deal) => {
    if (stageFilter !== 'all' && deal.stage_id !== stageFilter) return false;
    if (dateFilter === 'max') return true;

    const createdAt = new Date(deal.created_at);
    if (Number.isNaN(createdAt.getTime())) return false;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') return createdAt >= dayStart;
    if (dateFilter === '7' || dateFilter === '14' || dateFilter === '30') {
      const start = new Date(dayStart);
      start.setDate(start.getDate() - Number(dateFilter) + 1);
      return createdAt >= start;
    }

    const start = customStartDate
      ? new Date(`${customStartDate}T00:00:00`)
      : null;
    const end = customEndDate
      ? new Date(`${customEndDate}T23:59:59.999`)
      : null;
    return (!start || createdAt >= start) && (!end || createdAt <= end);
  });

  const filteredStages =
    stageFilter === 'all'
      ? stages
      : stages.filter((stage) => stage.id === stageFilter);

  function clearFilters() {
    setDateFilter('max');
    setCustomStartDate('');
    setCustomEndDate('');
    setStageFilter('all');
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-in fade-in-0 slide-in-from-top-1 border-border bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-[0_4px_14px_rgb(15_23_42_/_8%)] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-card text-foreground hover:bg-muted data-[popup-open]:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors">
              <GitBranch className="text-primary h-4 w-4" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t('selectPipeline')}
              </span>
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover text-popover-foreground w-64"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t('noPipelinesYet')}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => {
                    if (!canEditSettings) {
                      toast.error(t('pipelineOwnerOnly'));
                      return;
                    }
                    setSettingsOpen(true);
                  }}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t('managePipelines')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedPipeline && (
            <>
              <PipelineDateFilter
                value={dateFilter}
                startDate={customStartDate}
                endDate={customEndDate}
                onApply={(nextFilter, nextStart, nextEnd) => {
                  setDateFilter(nextFilter);
                  setCustomStartDate(nextStart);
                  setCustomEndDate(nextEnd);
                }}
              />
              <label className="border-border bg-background text-foreground relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm sm:w-auto sm:justify-start sm:gap-2 sm:px-2.5">
                <Filter
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="sr-only">Estágio</span>
                <select
                  aria-label="Filtrar por estágio"
                  title={
                    stageFilter === 'all'
                      ? 'Todos os estágios'
                      : stages.find((stage) => stage.id === stageFilter)?.name
                  }
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 sm:static sm:h-auto sm:w-auto sm:max-w-40 sm:appearance-auto sm:bg-transparent sm:opacity-100 sm:outline-none"
                >
                  <option value="all">Todos os estágios</option>
                  {stages
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                </select>
              </label>
              {(dateFilter !== 'max' || stageFilter !== 'all') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="size-4" />
                  Limpar filtros
                </Button>
              )}
            </>
          )}
          <div
            role="group"
            aria-label={tBoard('viewOptions')}
            className="border-border bg-background inline-flex h-9 shrink-0 items-center rounded-lg border p-0.5"
          >
            <Button
              type="button"
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={tBoard('viewKanban')}
              aria-pressed={viewMode === 'kanban'}
              title={tBoard('viewKanban')}
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={tBoard('viewList')}
              aria-pressed={viewMode === 'list'}
              title={tBoard('viewList')}
              onClick={() => setViewMode('list')}
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            gateMessage={t('pipelineOwnerOnly')}
            onClick={() => {
              setNewPipelineType('standard');
              setNewPipelineOpen(true);
            }}
            className="border-border bg-card text-foreground hover:bg-muted hidden sm:inline-flex"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('addPipeline')}
          </GatedButton>
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create integrated pipelines"
            gateMessage={t('pipelineOwnerOnly')}
            onClick={() => {
              setNewPipelineType('integrated');
              setNewPipelineOpen(true);
            }}
            className="border-primary/40 bg-card text-primary hover:bg-primary/10 hidden sm:inline-flex"
          >
            <Plus className="mr-1 h-4 w-4" />
            Pipeline integrada
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 hidden sm:inline-flex"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('addDeal')}
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="border-border flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
          <GitBranch className="text-muted-foreground h-12 w-12" />
          <h3 className="text-foreground mt-4 text-lg font-medium">
            {t('noPipelinesYet')}
          </h3>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('createToStartTracking')}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            gateMessage={t('pipelineOwnerOnly')}
            onClick={() => {
              setNewPipelineType('standard');
              setNewPipelineOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('createPipeline')}
          </GatedButton>
        </div>
      ) : (
        <>
          {viewMode === 'kanban' ? (
            <PipelineBoard
              key={filteredStages
                .map((stage) => `${stage.id}:${stage.position}`)
                .join('|')}
              stages={filteredStages}
              deals={filteredDeals}
              visibleCardFields={visibleCardFields}
              canEditStageColors={canEditSettings}
              onStageColorChange={handleStageColorChange}
              onDealMoved={handleDealMoved}
              onAddDeal={handleAddDeal}
              onEditDeal={handleEditDeal}
              onEditLabels={
                canCreateDeals ? (deal) => setLabelsDealId(deal.id) : undefined
              }
              onEditSchedule={
                canCreateDeals
                  ? (deal) => setScheduleDealId(deal.id)
                  : undefined
              }
            />
          ) : (
            <PipelineList
              stages={filteredStages}
              deals={filteredDeals}
              visibleCardFields={visibleCardFields}
              onEditDeal={handleEditDeal}
            />
          )}
        </>
      )}

      <DealLabelsDialog
        open={labelsDealId !== null}
        onOpenChange={(open) => {
          if (!open) setLabelsDealId(null);
        }}
        dealId={labelsDealId ?? ''}
        accountId={accountId}
        selected={deals.find((deal) => deal.id === labelsDealId)?.labels ?? []}
        canEdit={canCreateDeals}
        onChange={(dealId, labels) =>
          setDeals((prev) =>
            prev.map((deal) =>
              deal.id === dealId ? { ...deal, labels } : deal
            )
          )
        }
      />

      <DealScheduleDialog
        open={scheduleDealId !== null}
        onOpenChange={(open) => {
          if (!open) setScheduleDealId(null);
        }}
        dealId={scheduleDealId ?? ''}
        value={deals.find((deal) => deal.id === scheduleDealId)?.scheduled_date}
        timeValue={
          deals.find((deal) => deal.id === scheduleDealId)?.scheduled_time
        }
        canEdit={canCreateDeals}
        onChange={(dealId, scheduledDate, scheduledTime) =>
          setDeals((prev) =>
            prev.map((deal) =>
              deal.id === dealId
                ? {
                    ...deal,
                    scheduled_date: scheduledDate,
                    scheduled_time: scheduledTime,
                  }
                : deal
            )
          )
        }
      />

      <Dialog
        open={paidMove !== null}
        onOpenChange={(open) => {
          if (!open) setPaidMove(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('paidStageAmountTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {t('paidStageAmountDescription', {
              dealTitle: paidMove?.dealTitle ?? '',
            })}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="paid-deal-amount">
              {t('paidStageAmountLabel')}
            </Label>
            <Input
              id="paid-deal-amount"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder={t('paidStageAmountPlaceholder')}
              value={paidAmountInput}
              onChange={(event) => setPaidAmountInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirmPaidMove();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaidMove(null)}
            >
              {t('cancel')}
            </Button>
            <Button type="button" onClick={() => void confirmPaidMove()}>
              {t('confirmPaidMove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('newPipeline')}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={newPipelineType === 'standard' ? 'default' : 'outline'}
                onClick={() => setNewPipelineType('standard')}
              >
                Pipeline padrão
              </Button>
              <Button
                type="button"
                variant={
                  newPipelineType === 'integrated' ? 'default' : 'outline'
                }
                onClick={() => setNewPipelineType('integrated')}
              >
                Pipeline integrada
              </Button>
            </div>
            <Label className="text-muted-foreground">{t('pipelineName')}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t('pipelineNamePlaceholder')}
              className="bg-muted border-border text-foreground mt-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreatePipeline();
              }}
            />
            <p className="text-muted-foreground mt-2 text-xs">
              {newPipelineType === 'integrated'
                ? 'Cria Novo Lead, Prospecção iniciada, Reunião, Contrato a ser assinado e Contrato pago.'
                : t('defaultStagesDesc')}
            </p>
            {newPipelineType === 'integrated' && (
              <div className="border-border bg-muted/40 mt-4 space-y-3 rounded-lg border p-3">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    IDs dos campos do Elementor
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Use o Field ID configurado em cada campo do formulário.
                    Esses valores podem ser alterados depois.
                  </p>
                </div>
                {elementorMappings.map((mapping, index) => (
                  <div
                    key={`${mapping.sourceId}-${index}`}
                    className="border-border bg-background grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded border p-2"
                  >
                    <Input
                      value={mapping.sourceId}
                      onChange={(event) =>
                        setElementorMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, sourceId: event.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="ID do Elementor (ex.: whatsapp)"
                      className="border-border bg-muted text-foreground h-8"
                    />
                    <Input
                      value={mapping.fieldName}
                      onChange={(event) =>
                        setElementorMappings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, fieldName: event.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="Nome do campo no CRM (ex.: Cargo)"
                      className="border-border bg-muted text-foreground h-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setElementorMappings((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setElementorMappings((current) => [
                      ...current,
                      { sourceId: '', fieldName: '' },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3 w-3" /> Adicionar campo
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t('creating') : t('createPipelineBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdWebhookUrl !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedWebhookUrl(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Pipeline integrada criada
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Copie esta URL e use-a na ação Webhook do formulário do Elementor.
            Ela não será exibida novamente.
          </p>
          <div className="border-border bg-muted flex items-center gap-2 rounded-lg border p-3">
            <code className="text-foreground min-w-0 flex-1 text-xs break-all">
              {createdWebhookUrl}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Copiar webhook"
              onClick={() => {
                if (createdWebhookUrl)
                  navigator.clipboard.writeText(createdWebhookUrl);
                toast.success('Webhook copiado');
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <AddContactsDialog
        open={pickContactsOpen}
        onOpenChange={setPickContactsOpen}
        accountId={accountId}
        userId={user?.id ?? null}
        pipelineId={selectedPipelineId}
        stageId={defaultStageId}
        stageName={stages.find((stage) => stage.id === defaultStageId)?.name}
        onCreateNew={() => {
          setPickContactsOpen(false);
          setDealFormOpen(true);
        }}
        onAdded={refreshDeals}
      />
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        allowCreateContact={
          pipelines.find((pipeline) => pipeline.id === selectedPipelineId)
            ?.pipeline_type !== 'integrated'
        }
        visibleCardFields={visibleCardFields}
        onVisibleCardFieldsChange={updateVisibleCardFields}
        onSaved={refreshDeals}
      />
    </div>
  );
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value: string): string {
  const date = fromDateKey(value);
  return date
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : 'Selecionar data';
}

function monthDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function PipelineDateFilter({
  value,
  startDate,
  endDate,
  onApply,
}: {
  value: DateFilter;
  startDate: string;
  endDate: string;
  onApply: (filter: DateFilter, start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DateFilter>(value);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());

  function openPicker(nextOpen: boolean) {
    if (nextOpen) {
      setDraftFilter(value);
      setDraftStart(startDate);
      setDraftEnd(endDate);
      const selected = fromDateKey(startDate) ?? new Date();
      setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    setOpen(nextOpen);
  }

  function chooseShortcut(next: DateFilter) {
    setDraftFilter(next);
    if (next !== 'custom') {
      setDraftStart('');
      setDraftEnd('');
    }
  }

  function chooseDay(day: Date) {
    const key = toDateKey(day);
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(key);
      setDraftEnd('');
      setDraftFilter('custom');
      return;
    }
    if (key < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(key);
    } else {
      setDraftEnd(key);
    }
    setDraftFilter('custom');
  }

  const nextMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    1
  );
  const apply = () => {
    onApply(draftFilter, draftStart, draftEnd);
    setOpen(false);
  };

  return (
    <div>
      <Popover open={open} onOpenChange={openPicker}>
        <PopoverTrigger
          aria-label={`Período: ${
            draftFilter === 'custom' && draftStart
              ? `${dateLabel(draftStart)}${draftEnd ? ` - ${dateLabel(draftEnd)}` : ''}`
              : DATE_FILTER_LABELS[draftFilter]
          }`}
          className="border-border bg-background text-foreground hover:bg-muted inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm shadow-sm sm:w-auto sm:min-w-44 sm:justify-between sm:gap-2 sm:px-3"
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="text-muted-foreground size-4" />
            <span className="hidden sm:inline">
              <span className="text-muted-foreground">Período:</span>{' '}
              {draftFilter === 'custom' && draftStart
                ? `${dateLabel(draftStart)}${draftEnd ? ` - ${dateLabel(draftEnd)}` : ''}`
                : DATE_FILTER_LABELS[draftFilter]}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground hidden size-4 sm:block" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="border-border bg-popover text-popover-foreground w-[min(94vw,680px)] overflow-hidden p-0"
        >
          <div className="flex max-h-[min(80vh,560px)] flex-col sm:flex-row">
            <div className="border-border w-full shrink-0 border-b p-3 sm:w-44 sm:border-r sm:border-b-0">
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                Usados recentemente
              </p>
              {(['today', '7', 'max'] as DateFilter[]).map((shortcut) => (
                <button
                  key={shortcut}
                  type="button"
                  onClick={() => chooseShortcut(shortcut)}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                >
                  <span
                    className={`size-5 rounded-full border ${draftFilter === shortcut ? 'border-primary bg-primary/15' : 'border-border'}`}
                  />
                  {DATE_FILTER_LABELS[shortcut]}
                </button>
              ))}
              <div className="border-border my-2 border-t" />
              {(['today', '7', '14', '30'] as DateFilter[]).map((shortcut) => (
                <button
                  key={`recent-${shortcut}`}
                  type="button"
                  onClick={() => chooseShortcut(shortcut)}
                  className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                >
                  <span
                    className={`size-5 rounded-full border ${draftFilter === shortcut ? 'border-primary bg-primary/15' : 'border-border'}`}
                  />
                  {DATE_FILTER_LABELS[shortcut]}
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMonth(
                      new Date(
                        visibleMonth.getFullYear(),
                        visibleMonth.getMonth() - 1,
                        1
                      )
                    )
                  }
                  className="hover:bg-muted rounded-md p-1.5"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="flex gap-8 text-sm font-medium">
                  <span>
                    {visibleMonth.toLocaleDateString('pt-BR', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span>
                    {nextMonth.toLocaleDateString('pt-BR', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setVisibleMonth(nextMonth)}
                  className="hover:bg-muted rounded-md p-1.5"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                {[visibleMonth, nextMonth].map((month) => (
                  <div key={month.toISOString()}>
                    <div className="text-muted-foreground mb-1 grid grid-cols-7 text-center text-[11px]">
                      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(
                        (day) => (
                          <span key={day}>{day}</span>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                      {monthDays(month).map((day) => {
                        const key = toDateKey(day);
                        const inMonth = day.getMonth() === month.getMonth();
                        const selected = key === draftStart || key === draftEnd;
                        const inRange = Boolean(
                          draftStart &&
                          draftEnd &&
                          key > draftStart &&
                          key < draftEnd
                        );
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={!inMonth}
                            onClick={() => chooseDay(day)}
                            className={`h-8 rounded-md text-xs ${!inMonth ? 'text-muted-foreground/30' : 'hover:bg-primary/15'} ${inRange ? 'bg-primary/10' : ''} ${selected ? 'bg-primary text-primary-foreground' : ''}`}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-border mt-4 flex items-center gap-2 border-t pt-3 text-sm">
                <input type="checkbox" disabled className="size-4" />
                Comparar
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border-border hover:bg-muted rounded-md border px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-sm"
                >
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
