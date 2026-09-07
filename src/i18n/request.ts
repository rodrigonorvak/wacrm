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
  'Everything in one place — your account and your workspace. Pick a section to manage it.': 'Tudo em um só lugar: sua conta e seu espaço de trabalho. Escolha uma seção para gerenciá-los.',
  'Needs reconnecting': 'Precisa ser reconectado',
  'member': 'membro',
  'Appearance': 'Aparência',
  'currency': 'moeda',
  'How you show up across the app. Your avatar and name appear in the header, sidebar, and anywhere your teammates see you.': 'Como você aparece no aplicativo. Seu avatar e seu nome aparecem no cabeçalho, na barra lateral e em todos os lugares onde seus colegas de equipe veem você.',
  'Account details': 'Detalhes da conta',
  'Role': 'Função',
  'User ID': 'ID do usuário',
  'Joined': 'Entrou em',
  'Use at least {min} characters. You will stay signed in on this device after changing it.': 'Use pelo menos {min} caracteres. Você permanecerá conectado neste dispositivo depois de alterá-la.',
  'Active sessions': 'Sessões ativas',
  "Sign out of every device where you're logged in — including this one. Useful if you lost a laptop or shared your password.": 'Sair de todos os dispositivos em que você está conectado, incluindo este. Útil caso você tenha perdido um notebook ou compartilhado sua senha.',
  'Set the mode and accent colour used across the app. Saved to this device — try it, it changes live.': 'Defina o modo e a cor de destaque usados no aplicativo. Salvo neste dispositivo: experimente, a alteração é aplicada na hora.',
  'Accent color': 'Cor de destaque',
  'Connect your Meta WhatsApp Business API. Credentials, webhook, and setup steps all live here.': 'Conecte sua API do WhatsApp Business da Meta. As credenciais, o webhook e todas as etapas de configuração ficam aqui.',
  "Stored token can't be decrypted": 'O token armazenado não pode ser descriptografado',
  'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. This usually means the key changed, or it differs between environments (local vs Hostinger vs Vercel). Click "Reset Configuration" below, then re-save.': 'O token de acesso armazenado não pode ser descriptografado com a ENCRYPTION_KEY atual. Isso geralmente significa que a chave mudou ou é diferente entre os ambientes (local, Hostinger e Vercel). Clique abaixo em "Redefinir configuração" e salve novamente.',
  'Not Connected': 'Não conectado',
  'Not registered — Meta will not deliver events': 'Não registrado: a Meta não entregará eventos',
  'This number was saved before registration tracking existed, or registration was skipped. Enter the 2-step PIN below and click Save Configuration to subscribe it.': 'Este número foi salvo antes da existência do rastreamento de registro ou o registro foi ignorado. Digite abaixo o PIN de verificação em duas etapas e clique em Salvar configuração para inscrevê-lo.',
  'Needed only to wire inbound messages for a production number. Set it in Meta Business Manager → WhatsApp Accounts → Phone Numbers → Two-step verification, then paste it here so wacrm can subscribe the number — otherwise Meta routes inbound events to whichever app last claimed it (the symptom that hits second numbers under a shared WABA). Meta test numbers have no PIN and are pre-registered — leave this blank for them. Leaving it blank also keeps an existing registration untouched.': 'Necessário apenas para conectar mensagens recebidas de um número de produção. Configure-o em Meta Business Manager → Contas do WhatsApp → Números de telefone → Verificação em duas etapas e cole-o aqui para que o wacrm possa inscrever o número. Caso contrário, a Meta direcionará os eventos recebidos para o último aplicativo que reivindicou o número, comportamento comum em números secundários de uma WABA compartilhada. Números de teste da Meta não têm PIN e já são pré-registrados: deixe este campo em branco para eles. Deixá-lo em branco também mantém um registro existente intacto.',
  'Use this URL as your webhook callback in the Meta App Dashboard.': 'Use esta URL como callback do seu webhook no Painel do Aplicativo da Meta.',
  'Attachment Storage': 'Armazenamento de anexos',
  'Meta deletes received media about 30 days after it arrives. Attachments can be copied to your own storage so they stay viewable.': 'A Meta exclui as mídias recebidas cerca de 30 dias após a chegada. Os anexos podem ser copiados para seu próprio armazenamento para continuarem disponíveis.',
  'Keep inbound attachments': 'Manter anexos recebidos',
  'Save a copy of every photo, video, voice note and document customers send. Uses your Supabase storage; files over 16 MB are skipped.': 'Salve uma cópia de cada foto, vídeo, mensagem de voz e documento enviados pelos clientes. Usa seu armazenamento do Supabase; arquivos com mais de 16 MB são ignorados.',
  'Create templates and submit them to Meta for approval. Use "Sync from Meta" to pull templates approved elsewhere.': 'Crie modelos e envie-os à Meta para aprovação. Use "Sincronizar com a Meta" para importar modelos aprovados em outro lugar.',
  'No templates yet.': 'Nenhum modelo ainda.',
  'Create your first message template to get started.': 'Crie seu primeiro modelo de mensagem para começar.',
  'Reusable snippets — plain text or a saved interactive message — that agents can insert from the inbox composer.': 'Trechos reutilizáveis, em texto simples ou como mensagem interativa salva, que os atendentes podem inserir no compositor da caixa de entrada.',
  'The currency used for new deals and for pipeline and dashboard totals.': 'A moeda usada para novos negócios e para os totais do funil e do painel.',
  'Default currency': 'Moeda padrão',
  'New deals default to this currency, and pipeline and dashboard totals are shown in it. Existing deals keep the currency they were saved with.': 'Novos negócios usarão esta moeda por padrão, e os totais do funil e do painel serão exibidos nela. Os negócios existentes mantêm a moeda com que foram salvos.',
  'People with access to this account. Roles control what each teammate can do.': 'Pessoas com acesso a esta conta. As funções controlam o que cada membro da equipe pode fazer.',
  'Pending invitations': 'Convites pendentes',
  'No pending invitations.': 'Nenhum convite pendente.',
  'Click Invite member above to generate a shareable link.': 'Clique acima em Convidar membro para gerar um link compartilhável.',
  'Keys authenticate the public REST API (/api/v1) so you can build your own automations. Send them as Authorization: Bearer <key>.': 'As chaves autenticam a API REST pública (/api/v1) para que você possa criar suas próprias automações. Envie-as no cabeçalho Authorization: Bearer <key>.',
  'No API keys yet.': 'Nenhuma chave de API ainda.',
  'Click New API key to create one.': 'Clique em Nova chave de API para criar uma.',
  'Build branching, button-driven WhatsApp conversations. Useful for menus, FAQs, and triage before a human steps in.': 'Crie conversas ramificadas do WhatsApp conduzidas por botões. Útil para menus, perguntas frequentes e triagem antes da intervenção de um atendente.',
  'Draft': 'Rascunho',
  'Build workflows that react to WhatsApp® events automatically.': 'Crie fluxos de trabalho que reajam automaticamente aos eventos do WhatsApp®.',
  'Quick-start templates': 'Modelos para começar rapidamente',
  'Welcome Message': 'Mensagem de boas-vindas',
  'Auto-reply to first-time contacts with a greeting.': 'Responda automaticamente aos contatos que escrevem pela primeira vez com uma saudação.',
  'Out of Office': 'Fora do expediente',
  'Auto-reply during off-hours so nobody is left waiting.': 'Responda automaticamente fora do horário de atendimento para que ninguém fique esperando.',
  'Lead Qualifier': 'Qualificação de leads',
  'Ask qualification questions to filter inbound leads.': 'Faça perguntas de qualificação para filtrar os leads recebidos.',
  'Follow-up Reminder': 'Lembrete de acompanhamento',
  'Send a nudge if a contact has not replied within 24 hours.': 'Envie um lembrete se um contato não responder em até 24 horas.',
  'No automations yet': 'Nenhuma automação ainda',
  'Pick a template above or create one from scratch.': 'Escolha um modelo acima ou crie um do zero.',
  'Send bulk messages to your contacts using approved templates.': 'Envie mensagens em massa para seus contatos usando modelos aprovados.',
  'No broadcasts yet': 'Nenhum disparo ainda',
  'Create your first broadcast to reach your contacts at scale.': 'Crie seu primeiro disparo para alcançar seus contatos em grande escala.',
  'Manage your contact list. {count} total contacts.': 'Gerencie sua lista de contatos. {count} contatos no total.',
  'Conversations other teammates assign to you show up here.': 'As conversas que outros membros da equipe atribuírem a você aparecerão aqui.',
  'No notifications yet': 'Nenhuma notificação ainda',
  "You'll see an alert here when someone assigns you a conversation.": 'Você verá um alerta aqui quando alguém atribuir uma conversa a você.',
  'Select a conversation': 'Selecione uma conversa',
  'Choose a conversation from the left to start messaging': 'Escolha uma conversa à esquerda para começar a enviar mensagens',
  'Conversations Over Time': 'Conversas ao longo do tempo',
  'Daily message volume by direction': 'Volume diário de mensagens por direção',
  'No message activity in this range': 'Nenhuma atividade de mensagens neste período',
  'Send or receive messages to start populating this chart.': 'Envie ou receba mensagens para começar a preencher este gráfico.',
  'Pipeline Value': 'Valor do funil',
  'Open deals by stage': 'Negócios abertos por etapa',
  'Average First Response Time': 'Tempo médio da primeira resposta',
  "Minutes to reply to a customer's first unreplied message, by weekday": 'Minutos para responder à primeira mensagem não respondida de um cliente, por dia da semana',
  'target {minutes}m': 'meta de {minutes} min',
  'No replies recorded yet': 'Nenhuma resposta registrada ainda',
  'This chart fills in as you reply to customer messages.': 'Este gráfico será preenchido à medida que você responder às mensagens dos clientes.',
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
