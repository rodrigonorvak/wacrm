import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messages from '../../messages/pt-BR.json';

describe('Portuguese message template translations', () => {
  const t = createTranslator({
    locale: 'pt-BR',
    messages,
    namespace: 'Settings.templates',
  });

  it('translates form labels, categories and statuses', () => {
    expect(t('dialogNewTitle')).toBe('Novo template de mensagem');
    expect(t('dialogNewDesc')).toBe('Crie um template e envie-o à Meta para aprovação. Depois de aprovado, você poderá usá-lo em disparos e na caixa de entrada.');
    expect(t('headerNone')).toBe('Nenhum');
    expect(t('uploadHint')).toBe('JPEG ou PNG, até 5 MB');
    expect(t('qualityScore')).toBe('Classificação de qualidade da Meta');
    expect(t('categories.Utility')).toBe('Utilidade');
    expect(t('statuses.PENDING')).toBe('Pendente');
    expect(t('submitApproval')).toBe('Enviar para aprovação');
    expect(t('buttonsLimit', { max: 10 })).toContain('Até 10 botões');
  });

  it('preserves literal WhatsApp variables and rich-text formatting', () => {
    expect(t.raw('bodyHint')).toContain('{{1}}');
    expect(t.raw('bodyHint')).toContain('{{2}}');
    expect(t.raw('headerTextPlaceholder')).toContain('{{1}}');
    expect(t('toastSyncCount', { total: 1 })).toBe('1 template sincronizado da Meta');
    expect(t('toastSyncCount', { total: 2 })).toBe('2 templates sincronizados da Meta');
    expect(t.rich('langHint', { code: (chunks) => chunks })).toBe(
      'Use exatamente o código da Meta: en_US e en são diferentes.',
    );
  });
});
