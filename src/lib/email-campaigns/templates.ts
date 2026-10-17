import type { EmailBlock, EmailBlockType } from './types';

export type EmailTemplateCategory = 'ready' | 'library';

export interface EmailTemplate {
  id: string;
  category: EmailTemplateCategory;
  name: string;
  description: string;
  accent: string;
  subject: string;
  preheader: string;
  blocks: Array<{
    type: EmailBlockType;
    text?: string;
    url?: string;
    alignment?: EmailBlock['alignment'];
  }>;
}

const PLACEHOLDER_URL = 'https://www.seusite.com.br';

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'newsletter',
    category: 'ready',
    name: 'Newsletter',
    description: 'Novidades e conteúdo do mês em um layout limpo.',
    accent: '#e10c8c',
    subject: 'As novidades do mês chegaram',
    preheader: 'Veja o que preparamos para você',
    blocks: [
      { type: 'heading', text: 'Novidades do mês' },
      {
        type: 'text',
        text: 'Olá! Reunimos aqui os principais destaques para você ficar por dentro de tudo.',
      },
      { type: 'divider' },
      { type: 'heading', text: 'Destaque principal', alignment: 'left' },
      {
        type: 'text',
        text: 'Escreva aqui um resumo do conteúdo mais importante da edição.',
      },
      { type: 'button', text: 'Ler mais', url: PLACEHOLDER_URL },
      { type: 'footer' },
    ],
  },
  {
    id: 'promotion',
    category: 'ready',
    name: 'Promoção',
    description: 'Oferta por tempo limitado com chamada para ação.',
    accent: '#f97316',
    subject: 'Oferta especial só para você',
    preheader: 'Aproveite antes que acabe',
    blocks: [
      { type: 'heading', text: 'Oferta por tempo limitado' },
      {
        type: 'text',
        text: 'Preparamos uma condição especial para você. Aproveite enquanto está disponível.',
        alignment: 'center',
      },
      { type: 'button', text: 'Aproveitar oferta', url: PLACEHOLDER_URL },
      { type: 'spacer' },
      {
        type: 'text',
        text: 'Promoção válida por tempo limitado ou enquanto durarem os estoques.',
        alignment: 'center',
      },
      { type: 'footer' },
    ],
  },
  {
    id: 'welcome',
    category: 'ready',
    name: 'Boas-vindas',
    description: 'Receba novos contatos e apresente sua empresa.',
    accent: '#10b981',
    subject: 'Seja bem-vindo(a)!',
    preheader: 'Estamos felizes em ter você por aqui',
    blocks: [
      { type: 'heading', text: 'Seja bem-vindo(a)!' },
      {
        type: 'text',
        text: 'Que bom ter você com a gente. Aqui você vai encontrar novidades, dicas e ofertas exclusivas.',
      },
      { type: 'button', text: 'Conhecer a empresa', url: PLACEHOLDER_URL },
      { type: 'footer' },
    ],
  },
  {
    id: 'event',
    category: 'library',
    name: 'Convite para evento',
    description: 'Convide seus contatos para um evento ou webinar.',
    accent: '#6366f1',
    subject: 'Você está convidado(a)',
    preheader: 'Garanta a sua vaga',
    blocks: [
      { type: 'heading', text: 'Você está convidado(a)!' },
      {
        type: 'text',
        text: 'Data: __/__/____ às __:__\nLocal: informe aqui o local ou o link do evento.',
        alignment: 'center',
      },
      { type: 'button', text: 'Confirmar presença', url: PLACEHOLDER_URL },
      { type: 'footer' },
    ],
  },
  {
    id: 'announcement',
    category: 'library',
    name: 'Comunicado',
    description: 'Avisos importantes de forma simples e direta.',
    accent: '#0ea5e9',
    subject: 'Um aviso importante',
    preheader: 'Leia com atenção',
    blocks: [
      { type: 'heading', text: 'Comunicado importante', alignment: 'left' },
      {
        type: 'text',
        text: 'Escreva aqui o comunicado que você deseja compartilhar com seus contatos.',
      },
      { type: 'divider' },
      { type: 'text', text: 'Em caso de dúvidas, responda este e-mail.' },
      { type: 'footer' },
    ],
  },
  {
    id: 'feedback',
    category: 'library',
    name: 'Pesquisa de satisfação',
    description: 'Peça a opinião dos clientes após o atendimento.',
    accent: '#eab308',
    subject: 'Como foi sua experiência?',
    preheader: 'Leva menos de 1 minuto',
    blocks: [
      { type: 'heading', text: 'Queremos ouvir você' },
      {
        type: 'text',
        text: 'Sua opinião nos ajuda a melhorar. Responda a pesquisa rápida abaixo.',
        alignment: 'center',
      },
      { type: 'button', text: 'Responder pesquisa', url: PLACEHOLDER_URL },
      { type: 'footer' },
    ],
  },
];

export function getEmailTemplate(id: string | null | undefined) {
  return EMAIL_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function buildTemplateBlocks(template: EmailTemplate): EmailBlock[] {
  return template.blocks.map((block) => ({
    id: crypto.randomUUID(),
    type: block.type,
    text: block.text ?? '',
    url: block.url ?? '',
    alt: '',
    alignment:
      block.alignment ??
      (block.type === 'button' || block.type === 'heading' ? 'center' : 'left'),
  }));
}
