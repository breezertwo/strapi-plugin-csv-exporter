import { describe, expect, it } from 'vitest';

import { readableColumns, sanitizeRows, type PermissionChecker } from './permissions';

const attributes = {
  title: { type: 'string' },
  createdAt: { type: 'datetime' },
  secret: { type: 'string', private: true },
  password: { type: 'password' },
};

const checker = (strip: string[] = []): PermissionChecker => ({
  cannot: { read: () => false },
  sanitizeOutput: async (row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !strip.includes(key))),
});

describe('sanitizeRows', () => {
  it('reports the keys sanitizeOutput stripped', async () => {
    const { rows, removed } = await sanitizeRows(checker(['email']), [
      { title: 'Hi', email: 'a@b.c' },
    ]);

    expect(rows).toEqual([{ title: 'Hi' }]);
    expect([...removed]).toEqual(['email']);
  });

  it('collects removals across every row', async () => {
    const { removed } = await sanitizeRows(checker(['email']), [
      { title: 'Hi' },
      { email: 'a@b.c' },
    ]);

    expect([...removed]).toEqual(['email']);
  });

  it('reports nothing for an unrestricted role', async () => {
    const { removed } = await sanitizeRows(checker(), [{ title: 'Hi', createdAt: 'x' }]);

    expect(removed.size).toBe(0);
  });
});

describe('readableColumns', () => {
  it('keeps everything when nothing was stripped', () => {
    expect(readableColumns(['title', 'createdAt'], new Set(), attributes)).toEqual([
      'title',
      'createdAt',
    ]);
  });

  it('keeps createdAt, which Strapi permits regardless of the role field list', () => {
    expect(readableColumns(['title', 'createdAt'], new Set(['email']), attributes)).toContain(
      'createdAt'
    );
  });

  it('drops columns that were stripped', () => {
    expect(readableColumns(['title', 'email'], new Set(['email']), attributes)).toEqual(['title']);
  });

  it('drops private and password attributes even when no row exposed them', () => {
    expect(readableColumns(['title', 'secret', 'password'], new Set(), attributes)).toEqual([
      'title',
    ]);
  });

  it('keeps names that are not attributes, such as custom columns', () => {
    expect(readableColumns(['customThing'], new Set(), attributes)).toEqual(['customThing']);
  });
});
