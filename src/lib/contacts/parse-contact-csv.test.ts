import { describe, expect, it } from 'vitest';
import { parseContactCsv, parseTagCell } from './parse-contact-csv';

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('parses optional tags column', () => {
    const csv = `phone,name,tags
+15551234567,Alice,"VIP, Lead"
+15559876543,Bob,Customer`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: true,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('returns empty tagNames when tags column is absent', () => {
    const csv = `phone,name
+15551234567,Alice`;

    expect(parseContactCsv(csv)).toEqual({
      hasPhoneColumn: true,
      hasTagsColumn: false,
      hasCompanyColumn: false,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: undefined,
          company: undefined,
          tagNames: [],
        },
      ],
    });
  });

  it('recognizes Portuguese headers and semicolon-separated files', () => {
    const result = parseContactCsv(`Nome;Celular;E-mail
Maria;11999998888;maria@example.com`);

    expect(result.hasPhoneColumn).toBe(true);
    expect(result.rows).toEqual([
      {
        phone: '11999998888',
        name: 'Maria',
        email: 'maria@example.com',
        company: undefined,
        tagNames: [],
      },
    ]);
  });

  it('imports name-only contacts when phone is not mapped', () => {
    const result = parseContactCsv(`Nome,Observação
Joana,Retorno em breve
Pedro,Indicação`);

    expect(result.hasPhoneColumn).toBe(false);
    expect(result.rows).toEqual([
      {
        phone: '',
        name: 'Joana',
        email: undefined,
        company: undefined,
        tagNames: [],
      },
      {
        phone: '',
        name: 'Pedro',
        email: undefined,
        company: undefined,
        tagNames: [],
      },
    ]);
  });

  it('supports manually mapping non-standard column names', () => {
    const result = parseContactCsv(
      `Cliente,WhatsApp
Carla,5511999999999`,
      { name: 0, phone: 1 },
    );

    expect(result.rows[0]).toMatchObject({
      name: 'Carla',
      phone: '5511999999999',
    });
  });

});
