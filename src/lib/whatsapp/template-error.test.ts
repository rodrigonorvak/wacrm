import { describe, expect, it } from 'vitest';
import { formatTemplateSubmissionError } from './template-error';

const labels = {
  invalidParameter: 'A Meta rejeitou um parâmetro do template.',
  unknownError: 'Não foi possível enviar o template.',
  details: 'Detalhes da Meta',
};

describe('formatTemplateSubmissionError', () => {
  it('localizes a generic invalid parameter without inventing a cause', () => {
    expect(formatTemplateSubmissionError('Invalid parameter', labels)).toBe(
      labels.invalidParameter
    );
  });

  it('preserves the provider details alongside the localized warning', () => {
    expect(
      formatTemplateSubmissionError(
        'Invalid parameter — Body is invalid — (code 100, subcode 42)',
        labels
      )
    ).toBe(
      'A Meta rejeitou um parâmetro do template. Detalhes da Meta: Body is invalid — (code 100, subcode 42)'
    );
  });

  it('does not hide other errors', () => {
    expect(formatTemplateSubmissionError('Network failure', labels)).toContain(
      'Network failure'
    );
  });
});
