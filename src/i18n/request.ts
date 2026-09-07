import { getRequestConfig } from 'next-intl/server';

type Messages = typeof import('../../messages/en.json');

export default getRequestConfig(async () => {
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || 'pt-BR';

  let messages: Messages;
  try {
    const sourceMessages = (await import('../../messages/en.json')).default;
    const translatedMessages = (await import(`../../messages/${locale}.json`)).default;
    const mergedMessages = mergeMessages(sourceMessages, translatedMessages);
    messages = (locale === 'pt-BR'
      ? translateMissingPortuguese(mergedMessages, translatedMessages)
      : mergedMessages) as Messages;
  } catch {
    messages = (await import('../../messages/en.json')).default;
  }

  return {
    locale,
    messages
  };
});

function mergeMessages(source: unknown, translation: unknown): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return translation ?? source;
  }

  if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
    return source;
  }

  const merged: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  for (const [key, value] of Object.entries(translation)) {
    merged[key] = key in merged ? mergeMessages(merged[key], value) : value;
  }
  return merged;
}

const PORTUGUESE_WORDS: Record<string, string> = {
  account: 'conta', accounts: 'contas', active: 'ativo', add: 'adicionar',
  address: 'endereco', admin: 'administrador', agent: 'atendente', all: 'todos',
  amount: 'valor', analytics: 'analises', attachment: 'anexo', attachments: 'anexos',
  audience: 'publico', back: 'voltar', billing: 'cobranca', body: 'corpo',
  broadcast: 'disparo', broadcasts: 'disparos', button: 'botao', buttons: 'botoes',
  cancel: 'cancelar', contact: 'contato', contacts: 'contatos', conversation: 'conversa',
  conversations: 'conversas', copy: 'copiar', create: 'criar', created: 'criado',
  custom: 'personalizado', dashboard: 'painel', date: 'data', day: 'dia', days: 'dias',
  deal: 'negocio', deals: 'negocios', delete: 'excluir', delivered: 'entregue',
  document: 'documento', draft: 'rascunho', edit: 'editar', email: 'e-mail',
  error: 'erro', failed: 'falhou', field: 'campo', fields: 'campos', filter: 'filtro',
  flow: 'fluxo', flows: 'fluxos', found: 'encontrado', incoming: 'recebidas',
  integrations: 'integracoes', invite: 'convite', language: 'idioma', last: 'ultimo',
  loading: 'carregando', login: 'entrar', logout: 'sair', message: 'mensagem',
  messages: 'mensagens', name: 'nome', new: 'novo', next: 'proximo', no: 'nenhum',
  note: 'nota', notes: 'notas', notification: 'notificacao', notifications: 'notificacoes',
  offline: 'offline', online: 'online', open: 'aberto', outgoing: 'enviadas',
  owner: 'proprietario', password: 'senha', pending: 'pendente', phone: 'telefone',
  pipeline: 'funil', pipelines: 'funis', previous: 'anterior', profile: 'perfil',
  read: 'lida', recipients: 'destinatarios', remove: 'remover', reply: 'responder',
  reports: 'relatorios', save: 'salvar', saved: 'salvo', search: 'buscar', security: 'seguranca',
  select: 'selecionar', send: 'enviar', sent: 'enviada', settings: 'configuracoes',
  show: 'exibir', stage: 'etapa', status: 'status', success: 'sucesso', tag: 'etiqueta',
  tags: 'etiquetas', team: 'equipe', template: 'modelo', templates: 'modelos',
  today: 'hoje', total: 'total', unknown: 'desconhecido', update: 'atualizar',
  upload: 'enviar', user: 'usuario', users: 'usuarios', value: 'valor', viewer: 'visualizador',
  warning: 'aviso', webhook: 'webhook', yesterday: 'ontem', your: 'seu'
};

const PORTUGUESE_PHRASES: Record<string, string> = {
  'No activity yet': 'Nenhuma atividade ainda',
  'No contacts yet.': 'Nenhum contato ainda.',
  'No conversations found': 'Nenhuma conversa encontrada',
  'No messages yet': 'Nenhuma mensagem ainda',
  'No results': 'Nenhum resultado',
  'Not found': 'Não encontrado',
  'Save Changes': 'Salvar alterações',
  'Create account': 'Criar conta',
  'Sign in': 'Entrar',
  'Sign out': 'Sair',
  'Close': 'Fechar',
  'Cancel': 'Cancelar',
  'Delete': 'Excluir',
  'Edit': 'Editar',
  'Loading...': 'Carregando...',
  'Loading…': 'Carregando…',
  'Search conversations...': 'Buscar conversas...',
  'Search by name, phone, or email...': 'Buscar por nome, telefone ou e-mail...',
  'All statuses': 'Todos os status',
  'All Contacts': 'Todos os contatos',
  'Custom fields': 'Campos personalizados',
  'Message templates': 'Modelos de mensagem',
  'Team members': 'Membros da equipe',
  'API keys': 'Chaves de API',
  'WhatsApp connection': 'Conexão do WhatsApp',
  'Test API Connection': 'Testar conexão da API',
  'Save Configuration': 'Salvar configuração',
  'Create Pipeline': 'Criar funil',
  'New Pipeline': 'Novo funil',
  'New Broadcast': 'Novo disparo',
  'New Contact': 'Novo contato',
  'New Deal': 'Novo negócio',
  'New Automation': 'Nova automação',
  'Failed to load': 'Falha ao carregar',
  'Failed to save': 'Falha ao salvar',
  'Failed to delete': 'Falha ao excluir',
  'Could not reach the server': 'Não foi possível acessar o servidor',
  'Not authenticated': 'Não autenticado',
  'Not signed in': 'Não conectado'
};

function translatePortugueseString(value: string): string {
  if (PORTUGUESE_PHRASES[value]) return PORTUGUESE_PHRASES[value];

  const protectedParts: string[] = [];
  const protectedValue = value.replace(/\{\{[^}]+\}\}|\{[^}]+\}|<[^>]+>|https?:\/\/\S+/g, (part) => {
    protectedParts.push(part);
    return `\u0000${protectedParts.length - 1}\u0000`;
  });
  const translated = protectedValue.replace(/\b[A-Za-z]+\b/g, (word) => PORTUGUESE_WORDS[word.toLowerCase()] ?? word);
  return translated.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedParts[Number(index)]);
}

function translateMissingPortuguese(value: unknown, translation: unknown): unknown {
  if (typeof value === 'string') return translatePortugueseString(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  const translatedObject = translation && typeof translation === 'object' && !Array.isArray(translation)
    ? translation as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    key in translatedObject ? child : translateMissingPortuguese(child, undefined)
  ]));
}
