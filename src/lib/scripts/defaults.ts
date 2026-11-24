/** Default Auster scripts stored as admin-editable HTML. */

export const SCRIPT_BASE_CSS = `
.script-root { color: #1e293b; font-size: 14px; line-height: 1.45; }
.script-root h2 { font-size: 1.15rem; font-weight: 700; margin: 1.25rem 0 0.35rem; }
.script-root .script-hint { color: #64748b; font-size: 12px; margin-bottom: 0.75rem; }
.script-root .script-scenario {
  display: inline-flex; align-items: center; gap: 0.4rem;
  margin: 0.75rem 0 0.5rem; padding: 0.2rem 0.65rem;
  border-radius: 999px; background: #e10c8c; color: #fff;
  font-size: 11px; font-weight: 700;
}
.script-root .script-scenario span { font-weight: 500; opacity: 0.95; }
.script-root .script-tip {
  margin: 0.5rem 0; padding: 0.55rem 0.75rem;
  border: 1px dashed #e10c8c55; border-radius: 0.75rem;
  background: #fff5fa; color: #9d174d; font-size: 12px;
}
.script-root .script-agent {
  margin: 0.45rem 0; margin-left: auto; max-width: 92%;
  padding: 0.7rem 0.85rem; border-radius: 1rem 1rem 0.25rem 1rem;
  background: #e10c8c; color: #fff; white-space: pre-wrap;
}
.script-root .script-agent strong { color: #fde68a; font-weight: 700; }
.script-root .script-lead {
  margin: 0.35rem 0; max-width: 85%;
  padding: 0.45rem 0.7rem; border-radius: 1rem 1rem 1rem 0.25rem;
  background: #f1f5f9; color: #475569; font-style: italic; font-size: 12px;
}
.script-root .script-lead::before {
  content: "LEAD"; display: block; font-style: normal;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: #94a3b8;
}
`

export interface DefaultScript {
  title: string
  position: number
  html_content: string
  css_content: string
}

function agent(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"Nome"/g, '<strong>"Nome"</strong>')
    .replace(/“Nome”/g, '<strong>“Nome”</strong>')
  return `<div class="script-agent" data-script-msg="${escapeAttr(text)}">${safe}</div>`
}

function lead(text: string): string {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div class="script-lead">${safe}</div>`
}

function tip(text: string): string {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div class="script-tip">${safe}</div>`
}

function scenario(letter: string, label: string): string {
  return `<div class="script-scenario">Cenário ${letter}<span>${escapeHtml(label)}</span></div>`
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export const DEFAULT_CONVERSATION_SCRIPTS: DefaultScript[] = [
  {
    title: 'Lead de Clareamento',
    position: 0,
    css_content: '',
    html_content: `
<div class="script-root">
  <h2>01 Abertura</h2>
  ${agent('Bom dia, pode me informar seu nome por gentileza?')}
  ${lead('Lead responde o nome')}
  ${agent('Prazer, me chamo Nati da Auster Odontologia, e vou realizar seu atendimento.')}
  ${agent('“Nome”, você já fez clareamento antes, ou seria a primeira vez?')}
  ${lead('Lead responde')}

  <h2>02 Descoberta</h2>
  <p class="script-hint">Siga o cenário de acordo com a resposta do lead.</p>
  ${scenario('A', 'Primeira vez')}
  ${agent('Perfeito, “Nome”! Na primeira vez é importante entender a necessidade de cada sorriso.')}
  ${tip('💡 Pergunta fechada para entender a dor')}
  ${agent('O que mais te incomoda hoje: o amarelado de forma geral, manchas em alguns dentes ou o sorriso sem brilho?')}
  ${lead('Lead responde')}
  ${scenario('B', 'Já fez clareamento')}
  ${agent('Entendi, “Nome”. Então você já sabe como funciona e tem uma referência.')}
  ${tip('💡 Descobrir o motivo de estar procurando de novo')}
  ${agent('E o que te fez procurar o clareamento de novo: o dente voltou a escurecer com o tempo, o resultado anterior não ficou como você queria, ou você quer manter o tom que já tinha?')}
  ${lead('Lead responde')}

  <h2>03 Conversão do agendamento</h2>
  <p class="script-hint">Use o trecho que corresponde à resposta do lead.</p>
  ${scenario('A', 'Primeira vez')}
  ${lead('Fala de amarelado, manchas ou falta de brilho')}
  ${agent('Entendi, “Nome”, então o que mais pega é o [amarelado / as manchas / a falta de brilho]. O resultado do clareamento depende muito da origem do escurecimento, e isso só dá para saber olhando de perto. É justamente o que a Dra. Patricia avalia na consulta inicial.')}
  ${lead('Resposta vaga: “não sei, acho que pode melhorar”')}
  ${agent('Entendi, “Nome”. Muita gente chega assim, sentindo que o sorriso poderia estar melhor, mas sem saber exatamente o quê. É justamente isso que a Dra. Patricia avalia na consulta inicial.')}
  ${scenario('B', 'Já fez clareamento')}
  ${lead('O dente voltou a escurecer com o tempo')}
  ${agent('Entendi, “Nome”. É bem comum, o clareamento precisa de manutenção ao longo do tempo. O melhor momento e a melhor forma de retocar dependem de cada caso, e é justamente isso que a Dra. Patricia avalia na consulta inicial.')}
  ${lead('O resultado anterior não ficou como queria')}
  ${agent('Entendi, “Nome”. Quando o clareamento não rende como esperado, quase sempre existe um motivo, seja a técnica, a concentração ou o tipo de mancha. Esse é justamente o ponto que a Dra. Patricia avalia na consulta inicial, para você não repetir o que não funcionou.')}
  ${lead('Quer manter o tom que já tinha')}
  ${agent('Entendi, “Nome”. Manter o resultado também faz parte do cuidado com o clareamento. Esse é justamente o ponto que a Dra. Patricia avalia na consulta inicial, para indicar a melhor forma de manter o seu tom.')}
  ${tip('Extra — se mencionar sensibilidade')}
  ${lead('Menciona sensibilidade por conta própria')}
  ${agent('Entendi, “Nome”. A sensibilidade tem solução e é avaliada antes de tudo. Esse é justamente o ponto que a Dra. Patricia avalia na consulta inicial, para você clarear com conforto.')}
  ${agent('“Nome”, ela gostaria de te oferecer a avaliação gratuita, e eu já consigo até te encaixar. Tenho amanhã às Xh ou Yh, qual fica melhor para você?')}

  <h2>04 Agendamento</h2>
  <p class="script-hint">Escolha binária, nunca “quando você pode?”.</p>
  ${lead('Demonstra interesse e escolhe o horário')}
  ${lead('Ou diz: “vou ver e te falo”')}
  ${agent('Claro, “Nome”! Se quiser, posso deixar um horário reservado provisoriamente, sem compromisso. Se não der, é só me avisar que eu libero. Prefere que eu reserve amanhã às Xh ou Yh?')}
  ${tip('💡 Reservar provisório reduz o esforço de decisão e mantém o compromisso. Retomar a escolha binária evita que o lead responda só “pode ser”.')}

  <h2>05 Confirmação</h2>
  <p class="script-hint">Compromisso e redução de no-show.</p>
  ${agent('Fechado, “Nome”! Agendei sua avaliação com a Dra. Patricia para [dia] às [horário]. Você prefere que eu te mande um lembrete na véspera ou no próprio dia?')}
  ${tip('💡 Outra escolha binária. O lead já se compromete mentalmente com a presença.')}
  ${tip('Notas de apoio — fora do fluxo principal.')}
  ${lead('Menciona um evento por conta própria')}
  ${agent('Que legal! Então a gente já agenda a avaliação para você ter tempo de fazer tudo com calma.')}
</div>`.trim(),
  },
  {
    title: 'Lead de Prótese',
    position: 1,
    css_content: '',
    html_content: `
<div class="script-root">
  <h2>1. Abordagem inicial</h2>
  ${agent('Bom dia! Pode me informar seu nome, por gentileza?')}
  ${lead('Lead responde')}
  ${agent('Prazer, me chamo Nati, da Auster Odontologia, e vou realizar seu atendimento.')}
  ${agent('"Nome", me conta uma coisa: você está procurando uma prótese porque perdeu algum dente ou porque já utiliza uma e gostaria de trocar?')}
  ${lead('Lead responde')}

  <h2>2. Identificação do cenário</h2>
  ${scenario('A', 'Perdeu dentes')}
  ${agent('Entendi, "Nome"! E você perdeu um ou mais dentes, ou já não possui nenhum dente?')}
  ${lead('Lead responde')}
  ${scenario('B', 'Já utiliza prótese')}
  ${agent('Entendi, "Nome"! E o que te fez procurar uma nova prótese: a atual está incomodando, você gostaria de melhorar a estética ou está buscando mais conforto e segurança para mastigar?')}
  ${lead('Lead responde')}

  <h2>3. Conversão do agendamento</h2>
  ${scenario('A', 'Perdeu um ou mais dentes')}
  ${agent('Entendi, "Nome"! A ausência de dentes pode afetar tanto a mastigação quanto a estética do sorriso. Existem diferentes possibilidades para recuperar esses dentes, e a melhor alternativa depende de uma avaliação individual. É justamente isso que a Dra. Patricia avalia na consulta.')}
  ${scenario('B', 'Perdeu todos os dentes')}
  ${agent('Entendi, "Nome"! Recuperar o sorriso também significa recuperar mais segurança para comer, conversar e sorrir. Existem diferentes possibilidades de reabilitação, e a Dra. Patricia consegue avaliar qual delas pode atender melhor às suas necessidades.')}
  ${scenario('C', 'Já utiliza prótese, mas sente desconforto')}
  ${agent('Entendi, "Nome"! A prótese precisa proporcionar conforto e segurança no dia a dia. Existem alternativas que podem melhorar esses aspectos, mas é importante avaliar sua situação atual para entender o que pode ser feito.')}
  ${scenario('D', 'Já utiliza prótese e deseja melhorar a estética')}
  ${agent('Entendi, "Nome"! A estética também é uma parte importante da reabilitação. Hoje existem materiais e soluções que buscam proporcionar um aspecto mais natural ao sorriso. A Dra. Patricia pode avaliar as possibilidades para o seu caso.')}

  <h2>4. Fechamento</h2>
  ${agent('"Nome", a Dra. Patricia gostaria de te oferecer uma avaliação para entender melhor seu caso e apresentar as possibilidades de tratamento.')}
  ${agent('Tenho amanhã às Xh ou Yh. Qual fica melhor para você?')}
</div>`.trim(),
  },
  {
    title: 'Lead Aparelho',
    position: 2,
    css_content: '',
    html_content: `
<div class="script-root">
  <h2>1 Saudação</h2>
  ${agent('Bom dia, pode me informar seu nome por gentileza?')}
  ${lead('Lead responde o nome')}
  ${agent('Prazer, me chamo Nati da Auster Odontologia, e vou realizar seu atendimento.')}
  ${agent('“Nome”, você já usou aparelho antes, ou seria a primeira vez?')}
  ${lead('Lead responde se é a primeira vez ou não')}
  <p class="script-hint">↓ Siga o cenário de acordo com a resposta do lead ↓</p>

  <h2>2A Primeira vez</h2>
  ${scenario('A', 'Primeira vez')}
  ${agent('Perfeito, “Nome”! Primeira vez é ótimo porque a gente desenha o tratamento do zero, pensando só no seu sorriso.')}
  ${tip('💡 Pergunta fechada para entender a motivação')}
  ${agent('O que mais te incomoda hoje: o alinhamento dos dentes, o espaço entre eles ou a mordida?')}

  <h2>2B Já usou aparelho</h2>
  ${scenario('B', 'Já usou aparelho')}
  ${agent('Entendi, “Nome”. Então você já conhece como funciona o processo.')}
  ${tip('💡 Descobrir se houve recidiva, que é uma dor forte')}
  ${agent('Seus dentes voltaram a se movimentar depois que tirou, ou você quer melhorar o resultado que ficou?')}
  <p class="script-hint">↓ Siga o cenário de acordo com a resposta do lead ↓</p>

  <h2>3A Conversão — primeira vez</h2>
  ${scenario('A', 'Primeira vez')}
  ${lead('Lead conta o que mais incomoda')}
  ${agent('Entendi, “Nome”, então o que mais pega é o [alinhamento / espaço / mordida].')}
  ${agent('Esse é justamente o ponto que a Dra. Patricia avalia na consulta inicial.')}
  ${agent('“Nome”, ela gostaria de te oferecer a avaliação gratuita, e eu já consigo até te encaixar. Tenho amanhã às Xh ou Yh, qual fica melhor para você?')}

  <h2>3B Conversão — já usou aparelho</h2>
  ${scenario('B', 'Já usou aparelho')}
  ${lead('Lead conta o que aconteceu: se os dentes voltaram a se movimentar ou se quer melhorar o resultado')}
  ${agent('Entendi, “Nome”, geralmente quem já usou antes já consegue ver o alinhamento mais rápido, inclusive a Dra. Patricia pode dar uma olhada para ver se vai demorar muito.')}
  ${agent('Eu posso reservar uma avaliação gratuita “Nome”, assim ela já consegue te dizer com mais detalhes sobre a continuação do tratamento. E eu já consigo até te encaixar. Tenho amanhã às Xh ou Yh, qual fica melhor para você?')}

  <h2>4 Agendamento</h2>
  <p class="script-hint">Escolha binária — nunca “quando você pode?”</p>
  ${lead('Lead demonstra interesse, mas diz “vou ver e te falo”')}
  ${agent('Claro, “Nome”! Só te aviso que os horários dessa semana costumam preencher rápido. Quer que eu reserve um provisório e, se não der, é só me avisar?')}
  ${tip('💡 Reservar provisório reduz o esforço de decisão e mantém o compromisso.')}

  <h2>5 Confirmação</h2>
  <p class="script-hint">Compromisso e redução de no-show</p>
  ${agent('Fechado, “Nome”! Agendei para dia/horário. Você prefere que eu te mande um lembrete na véspera ou no próprio dia?')}
</div>`.trim(),
  },
]

export function firstNameFromContact(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/).filter(Boolean)[0]
  return first || 'Nome'
}

export function applyScriptName(template: string, fullName: string | null | undefined): string {
  const first = firstNameFromContact(fullName)
  return template
    .replace(/[“"]Nome[”"]/g, first)
    .replace(/\bNome\b/g, first)
}
