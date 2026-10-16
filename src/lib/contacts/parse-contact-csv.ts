/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column handling stays aligned with phone/name/email/company.
 */

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /** True when a phone column has been mapped; phone values are optional. */
  hasPhoneColumn: boolean;
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
}

export type ContactCsvField = 'phone' | 'name' | 'email' | 'company' | 'tags';
export type ContactCsvMapping = Partial<Record<ContactCsvField, number>>;

export interface ContactCsvDocument {
  headers: string[];
  records: string[][];
  delimiter: string;
}

export function parseContactCsvDocument(text: string): ContactCsvDocument {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) {
    return { headers: [], records: [], delimiter: ',' };
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(cleanCell);
  return {
    headers,
    records: lines.slice(1).filter((line) => line.trim()).map((line) => parseCsvLine(line, delimiter)),
    delimiter,
  };
}

export function suggestContactCsvMapping(headers: string[]): ContactCsvMapping {
  const normalized = headers.map(normalizeHeader);
  const aliases: Record<ContactCsvField, string[]> = {
    phone: ['phone', 'phonenumber', 'contactphone', 'telefone', 'telefonoprincipal', 'numerodetelefone', 'numerodocelular', 'celular', 'whatsapp', 'mobile', 'mobilephone', 'fone', 'telephone', 'numero'],
    name: ['name', 'nome', 'fullname', 'nomecompleto', 'nomedocontato', 'contactname', 'contact', 'client', 'cliente'],
    email: ['email', 'emailaddress', 'e-mail', 'correioeletronico', 'mail'],
    company: ['company', 'empresa', 'organizacao', 'organization', 'companhia', 'business'],
    tags: ['tags', 'tag', 'etiquetas', 'etiqueta', 'marcadores'],
  };
  return Object.fromEntries(
    Object.entries(aliases).flatMap(([field, candidates]) => {
      const index = normalized.findIndex((header) => candidates.includes(header));
      return index < 0 ? [] : [[field, index]];
    }),
  ) as ContactCsvMapping;
}

export function parseContactCsv(
  text: string,
  mapping?: ContactCsvMapping,
): ParseContactCsvResult {
  const document = parseContactCsvDocument(text);
  if (document.headers.length === 0 || document.records.length === 0) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
    };
  }

  const selectedMapping = mapping ?? suggestContactCsvMapping(document.headers);
  const phoneIdx = selectedMapping.phone ?? -1;
  const nameIdx = selectedMapping.name ?? -1;
  const emailIdx = selectedMapping.email ?? -1;
  const companyIdx = selectedMapping.company ?? -1;
  const tagsIdx = selectedMapping.tags ?? -1;

  if (nameIdx === -1 && phoneIdx === -1) {
    return {
      rows: [],
      hasPhoneColumn: false,
      hasTagsColumn: false,
      hasCompanyColumn: false,
    };
  }

  const rows: ParsedContactRow[] = [];

  for (const values of document.records) {
    const phone = phoneIdx >= 0 ? cleanCell(values[phoneIdx]) : '';
    const name = nameIdx >= 0 ? cleanCell(values[nameIdx]) : '';
    if (!name) continue;

    rows.push({
      phone,
      name,
      email:
        emailIdx >= 0
          ? cleanCell(values[emailIdx]) || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? cleanCell(values[companyIdx]) || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0 ? parseTagCell(cleanCell(values[tagsIdx])) : [],
    });
  }

  return {
    rows,
    hasPhoneColumn: phoneIdx >= 0,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
  };
}

/** Simple CSV line parse (handles quoted fields). */
function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: parseCsvLine(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["']/g, '')
    .replace(/[^a-z0-9-]/g, '');
}

function cleanCell(value: string | undefined): string {
  return value?.replace(/["']/g, '').trim() ?? '';
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}
