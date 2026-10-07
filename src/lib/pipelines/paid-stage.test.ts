import { describe, expect, it } from 'vitest';

import { isPaidStageName } from './paid-stage';

describe('isPaidStageName', () => {
  it.each(['Pago', 'Contrato pago', 'PAGAMENTO', 'Paid'])('recognizes %s', (name) => {
    expect(isPaidStageName(name)).toBe(true);
  });

  it.each(['Reunião', 'Prospecção iniciada', 'Contrato a ser assinado', '', null])(
    'does not recognize %s',
    (name) => {
      expect(isPaidStageName(name)).toBe(false);
    },
  );
});
