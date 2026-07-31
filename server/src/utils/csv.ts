const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const NEEDS_QUOTING = /["\n\r]/;

export const CSV_LINE_BREAK = '\r\n';

const escapeFormula = (value: string): string => {
  if (!value || !FORMULA_TRIGGERS.includes(value[0]) || NUMERIC.test(value)) {
    return value;
  }

  return `'${value}`;
};

export const toCSVValue = (
  value: unknown,
  options: { delimiter?: string; escapeFormulas?: boolean } = {}
): string => {
  const { delimiter = ',', escapeFormulas = true } = options;

  if (value === undefined || value === null) {
    return '';
  }

  let field = String(value);

  if (escapeFormulas) {
    field = escapeFormula(field);
  }

  if (field.includes(delimiter) || NEEDS_QUOTING.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }

  return field;
};

export const toCSVRow = (
  values: unknown[],
  options: { delimiter?: string; escapeFormulas?: boolean } = {}
): string => values.map((value) => toCSVValue(value, options)).join(options.delimiter ?? ',');
