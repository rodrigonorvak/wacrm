import type { MessageTemplate } from '@/types';
import { buildSendComponents, type SendTimeParams } from './template-send-builder';
import { extractVariableIndices } from './template-validators';

export type ScheduledVariable =
  | { source: 'contact_name' }
  | { source: 'text'; value: string };

export interface ScheduledTemplateVariables {
  body: ScheduledVariable[];
  headerText?: ScheduledVariable;
  buttonParams?: Record<string, ScheduledVariable>;
}

function resolveVariable(input: unknown, contactName: string | null): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Variável de modelo inválida.');
  }
  const variable = input as Record<string, unknown>;
  const value = variable.source === 'contact_name'
    ? contactName
    : variable.source === 'text' && typeof variable.value === 'string'
      ? variable.value
      : null;
  if (!value?.trim()) throw new Error('Preencha todas as variáveis do modelo.');
  return value.trim();
}

/**
 * Validate the persisted mapping again at dispatch: the template or the
 * contact's name may have changed since the message was scheduled.
 */
export function resolveScheduledTemplate(
  template: MessageTemplate,
  variables: unknown,
  contactName: string | null,
): SendTimeParams {
  if (template.status !== 'APPROVED') {
    throw new Error('Somente modelos aprovados podem ser enviados.');
  }
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error('Variáveis do modelo inválidas.');
  }
  const input = variables as Record<string, unknown>;
  const indices = extractVariableIndices(template.body_text);
  if (indices.some((index, i) => index !== i + 1)) {
    throw new Error('As variáveis do corpo do modelo são inválidas.');
  }
  if (!Array.isArray(input.body) || input.body.length !== indices.length) {
    throw new Error('As variáveis não correspondem ao corpo do modelo.');
  }
  const body = input.body.map((value: unknown) => resolveVariable(value, contactName));
  const headerIndices = template.header_type === 'text'
    ? extractVariableIndices(template.header_content ?? '')
    : [];
  if (headerIndices.length > 1 || (headerIndices.length === 1 && headerIndices[0] !== 1)) {
    throw new Error('A variável do cabeçalho do modelo é inválida.');
  }
  let headerText: string | undefined;
  if (headerIndices.length) headerText = resolveVariable(input.headerText, contactName);
  else if (input.headerText !== undefined) throw new Error('O modelo não possui variável no cabeçalho.');

  const supplied = input.buttonParams ?? {};
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    throw new Error('Variáveis dos botões inválidas.');
  }
  const suppliedButtons = supplied as Record<string, unknown>;
  const requiredButtons = (template.buttons ?? [])
    .map((button, index) => ({ button, index }))
    .filter(({ button }) => button.type === 'URL' && extractVariableIndices(button.url).length > 0);
  const buttonParams: Record<number, string> = {};
  for (const { index } of requiredButtons) {
    buttonParams[index] = resolveVariable(suppliedButtons[String(index)], contactName);
  }
  if (Object.keys(suppliedButtons).some((key) => !requiredButtons.some(({ index }) => String(index) === key))) {
    throw new Error('As variáveis não correspondem aos botões do modelo.');
  }
  const params = { body, headerText, buttonParams };
  buildSendComponents(template, params);
  return params;
}
