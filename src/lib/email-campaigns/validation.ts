import type {
  EmailBlock,
  EmailBlockAlignment,
  EmailBlockType,
  EmailCampaignAudienceType,
  EmailCampaignDraftInput,
} from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCK_TYPES = new Set<EmailBlockType>([
  'heading',
  'text',
  'image',
  'button',
  'divider',
  'spacer',
  'footer',
]);
const ALIGNMENTS = new Set<EmailBlockAlignment>(['left', 'center', 'right']);

type ValidationResult = { input: EmailCampaignDraftInput } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeUrl(value: unknown, image: boolean): string | null {
  if (typeof value !== 'string' || value.trim() === '') return '';
  try {
    const url = new URL(value);
    const allowed = image
      ? url.protocol === 'https:' || url.protocol === 'http:'
      : url.protocol === 'https:' ||
        url.protocol === 'http:' ||
        url.protocol === 'mailto:';
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseBlocks(value: unknown): EmailBlock[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    return null;
  }
  const blocks: EmailBlock[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, type } = item;
    if (
      typeof id !== 'string' ||
      !UUID_PATTERN.test(id) ||
      ids.has(id) ||
      typeof type !== 'string' ||
      !BLOCK_TYPES.has(type as EmailBlockType)
    ) {
      return null;
    }
    ids.add(id);

    const text = typeof item.text === 'string' ? item.text : '';
    const alt = typeof item.alt === 'string' ? item.alt : '';
    const alignment =
      typeof item.alignment === 'string' &&
      ALIGNMENTS.has(item.alignment as EmailBlockAlignment)
        ? (item.alignment as EmailBlockAlignment)
        : 'left';
    const url = safeUrl(item.url, type === 'image');

    if (text.length > 10_000 || alt.length > 500 || url === null) return null;
    blocks.push({
      id,
      type: type as EmailBlockType,
      text,
      url,
      alt,
      alignment,
    });
  }
  return blocks;
}

export function validateEmailCampaignDraft(value: unknown): ValidationResult {
  if (!isRecord(value)) return { error: 'Dados da campanha inválidos.' };
  const senderConnectionId = value.senderConnectionId;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  const preheader =
    typeof value.preheader === 'string' ? value.preheader.trim() : '';
  const audienceType = value.audienceType;
  const audienceContactIds = value.audienceContactIds;
  const audiencePipelineId = value.audiencePipelineId;
  const audienceStageId = value.audienceStageId;
  const content = parseBlocks(value.content);

  if (
    typeof senderConnectionId !== 'string' ||
    !UUID_PATTERN.test(senderConnectionId)
  ) {
    return { error: 'Selecione um remetente de e-mail.' };
  }
  if (!name || name.length > 120) {
    return { error: 'Informe um nome de campanha de até 120 caracteres.' };
  }
  if (subject.length > 255 || preheader.length > 250) {
    return { error: 'O assunto ou pré-cabeçalho excede o limite permitido.' };
  }
  if (/[\r\n]/.test(subject) || /[\r\n]/.test(preheader)) {
    return {
      error: 'O assunto e o pré-cabeçalho devem ficar em uma única linha.',
    };
  }

  if (
    audienceType !== 'all_contacts' &&
    audienceType !== 'selected_contacts' &&
    audienceType !== 'pipeline_stage'
  ) {
    return { error: 'Escolha um público válido.' };
  }
  if (!content) {
    return { error: 'Adicione ao menos um bloco válido ao e-mail.' };
  }

  let contactIds: string[] = [];
  let pipelineId: string | null = null;
  let stageId: string | null = null;
  if (audienceType === 'selected_contacts') {
    if (
      !Array.isArray(audienceContactIds) ||
      audienceContactIds.length === 0 ||
      audienceContactIds.length > 1000 ||
      audienceContactIds.some(
        (id) => typeof id !== 'string' || !UUID_PATTERN.test(id)
      )
    ) {
      return { error: 'Selecione entre 1 e 1.000 contatos com e-mail.' };
    }
    contactIds = [...new Set(audienceContactIds as string[])];
    if (contactIds.length !== audienceContactIds.length) {
      return { error: 'A lista de contatos contém duplicatas.' };
    }
  }

  if (audienceType === 'pipeline_stage') {
    if (
      typeof audiencePipelineId !== 'string' ||
      !UUID_PATTERN.test(audiencePipelineId) ||
      typeof audienceStageId !== 'string' ||
      !UUID_PATTERN.test(audienceStageId)
    ) {
      return { error: 'Selecione um funil e uma etapa válidos.' };
    }
    pipelineId = audiencePipelineId;
    stageId = audienceStageId;
  }

  return {
    input: {
      senderConnectionId,
      name,
      subject,
      preheader,
      audienceType: audienceType as EmailCampaignAudienceType,
      audienceContactIds: contactIds,
      audiencePipelineId: pipelineId,
      audienceStageId: stageId,
      content,
    },
  };
}

export function validateEmailCampaignReadyToSend(
  input: EmailCampaignDraftInput
): string | null {
  if (!input.subject) {
    return 'Informe o assunto antes de enviar a campanha.';
  }
  if (
    !input.content.some(
      (block) =>
        block.text.trim() || (block.type === 'image' && block.url.trim())
    )
  ) {
    return 'Adicione conteúdo ao e-mail antes de enviar a campanha.';
  }
  return null;
}
