import { describe, expect, it } from 'vitest';

import { permittedColumns, sanitizeRows, type PermissionChecker } from './permissions';

const attributes = {
  title: { type: 'string' },
  createdAt: { type: 'datetime' },
  email: { type: 'string' },
  secret: { type: 'string', private: true },
  password: { type: 'password' },
};

/** Mirrors Strapi: `allow` is the role's field list, plus the always-permitted timestamps. */
const checker = (allow?: string[]): PermissionChecker => ({
  cannot: { read: () => false },
  sanitizeOutput: async (row) => row,
  sanitizeQuery: async ({ fields }) => ({
    fields: allow
      ? fields.filter((f: string) => [...allow, 'createdAt', 'updatedAt'].includes(f))
      : fields,
  }),
});

describe('sanitizeRows', () => {
  it('sanitizes every row', async () => {
    const stripping: PermissionChecker = {
      ...checker(),
      sanitizeOutput: async ({ email, ...rest }) => rest,
    };

    await expect(sanitizeRows(stripping, [{ title: 'Hi', email: 'a@b.c' }])).resolves.toEqual([
      { title: 'Hi' },
    ]);
  });
});

describe('permittedColumns', () => {
  it('keeps everything for a role without field restrictions', async () => {
    await expect(
      permittedColumns(checker(), ['title', 'email', 'createdAt'], attributes)
    ).resolves.toEqual(['title', 'email', 'createdAt']);
  });

  it('drops fields outside the role field list', async () => {
    await expect(
      permittedColumns(checker(['title']), ['title', 'email'], attributes)
    ).resolves.toEqual(['title']);
  });

  it('keeps createdAt, which Strapi permits regardless of the field list', async () => {
    await expect(
      permittedColumns(checker(['title']), ['title', 'createdAt'], attributes)
    ).resolves.toEqual(['title', 'createdAt']);
  });

  it('drops private and password attributes', async () => {
    await expect(
      permittedColumns(checker(), ['title', 'secret', 'password'], attributes)
    ).resolves.toEqual(['title']);
  });

  it('keeps names that are not attributes, such as custom columns', async () => {
    await expect(
      permittedColumns(checker(['title']), ['title', 'customThing'], attributes)
    ).resolves.toEqual(['title', 'customThing']);
  });

  it('does not need any data, so an empty collection yields the same columns', async () => {
    const columns = await permittedColumns(checker(['title']), ['title', 'email'], attributes);

    expect(columns).toEqual(['title']);
  });

  it('keeps the columns if sanitizeQuery fails', async () => {
    const failing: PermissionChecker = {
      ...checker(),
      sanitizeQuery: async () => {
        throw new Error('boom');
      },
    };

    await expect(permittedColumns(failing, ['title', 'email'], attributes)).resolves.toEqual([
      'title',
      'email',
    ]);
  });
});
