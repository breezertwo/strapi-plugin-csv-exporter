import { describe, expect, it, vi } from 'vitest';
import { errors } from '@strapi/utils';
import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

import service from './service';

const uid = 'api::article.article';

const fakeStrapi = () =>
  ({
    config: { get: () => ({ config: { [uid]: { columns: ['title'] } } }) },
    contentTypes: { [uid]: { kind: 'collectionType', attributes: { title: { type: 'string' } } } },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    documents: vi.fn(() => {
      throw new Error('documents() must not be called for an invalid uid');
    }),
    plugin: vi.fn(() => {
      throw new Error('plugin() must not be called for an invalid uid');
    }),
  }) as unknown as Core.Strapi;

const locales = [
  { name: 'English (en)', code: 'en' },
  { name: 'German (de)', code: 'de' },
];

const fakePlugin =
  ({
    canRead = true,
    sanitize = (row: any) => row,
    allowFields,
  }: {
    canRead?: boolean;
    sanitize?: (row: any) => any;
    allowFields?: string[];
  } = {}) =>
  (name: string) =>
    name === 'content-manager'
      ? {
          service: () => ({
            create: () => ({
              cannot: { read: () => !canRead },
              sanitizeOutput: async (row: any) => sanitize(row),
              sanitizeQuery: async ({ fields }: any) => ({
                fields: allowFields
                  ? fields.filter((f: string) => allowFields.includes(f))
                  : fields,
              }),
            }),
          }),
        }
      : {
          service: () => ({
            find: async () => locales,
            getDefaultLocale: async () => 'en',
            setIsDefault: async (input: any[]) => input,
          }),
        };

const readCsv = async (body: any) => {
  const chunks: string[] = [];
  for await (const chunk of body) chunks.push(String(chunk));
  return chunks.join('');
};

const fakeCtx = (query: Record<string, unknown>) =>
  ({
    query,
    state: { userAbility: {} },
    badRequest: vi.fn(),
    throw: vi.fn(),
    set: vi.fn(),
  }) as unknown as Context;

describe.each(['getTableData', 'downloadCSV'] as const)('%s', (method) => {
  const invoke = (query: Record<string, unknown>) => {
    const strapi = fakeStrapi();
    const ctx = fakeCtx(query);

    return { strapi, ctx, result: service({ strapi })[method](ctx) };
  };

  it('throws a ValidationError for an unconfigured uid', async () => {
    const { result } = invoke({ uid: 'api::secret.secret' });

    await expect(result).rejects.toBeInstanceOf(errors.ValidationError);
  });

  it('throws a ValidationError when the uid is missing', async () => {
    const { result } = invoke({});

    await expect(result).rejects.toThrow(/Missing required query parameter/);
  });

  it('does not resolve with undefined, which Koa would turn into a 204', async () => {
    const { result } = invoke({ uid: 'api::secret.secret' });

    await expect(result).rejects.toBeDefined();
  });

  it('does not fall back to ctx.badRequest', async () => {
    const { ctx, result } = invoke({ uid: 'api::secret.secret' });

    await result.catch(() => {});
    expect(ctx.badRequest).not.toHaveBeenCalled();
  });

  it('is not swallowed and rethrown as a 500', async () => {
    const { ctx, strapi, result } = invoke({ uid: 'api::secret.secret' });

    await result.catch(() => {});
    expect(ctx.throw).not.toHaveBeenCalled();
    expect(strapi.log.error).not.toHaveBeenCalled();
  });

  it('rejects before doing any i18n or database work', async () => {
    const { result } = invoke({ uid: 'api::secret.secret' });

    await expect(result).rejects.toBeInstanceOf(errors.ValidationError);
  });
});

describe('getDropdownValues without i18n', () => {
  const noI18nStrapi = () =>
    ({
      config: { get: () => ({ config: { [uid]: { columns: ['title'] } } }) },
      contentTypes: {
        [uid]: { kind: 'collectionType', info: { displayName: 'Article' }, attributes: {} },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      plugin: (name: string) => (name === 'content-manager' ? fakePlugin()(name) : undefined),
    }) as unknown as Core.Strapi;

  it('still lists the configured content types', async () => {
    const strapi = noI18nStrapi();
    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.contentTypes).toEqual([{ label: 'Article', value: uid }]);
  });

  it('reports no locales instead of failing', async () => {
    const strapi = noI18nStrapi();
    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.locales).toEqual([]);
    expect(result.defaultLocale).toBe('en');
  });

  it('does not log an error or throw a 500', async () => {
    const strapi = noI18nStrapi();
    const ctx = fakeCtx({});

    await service({ strapi }).getDropdownValues(ctx);

    expect(strapi.log.error).not.toHaveBeenCalled();
    expect(ctx.throw).not.toHaveBeenCalled();
  });
});

describe('locale handling', () => {
  const localizedUid = uid;
  const plainUid = 'api::setting.setting';

  const spyStrapi = () => {
    const calls: { findMany: any[]; count: any[] } = { findMany: [], count: [] };

    const strapi = {
      config: {
        get: () => ({
          config: {
            [localizedUid]: { columns: ['title'] },
            [plainUid]: { columns: ['title'] },
          },
        }),
      },
      contentTypes: {
        [localizedUid]: { kind: 'collectionType', attributes: { title: { type: 'string' } } },
        [plainUid]: { kind: 'collectionType', attributes: { title: { type: 'string' } } },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async (params: any) => {
          calls.findMany.push(params);
          return [];
        },
        count: async (params: any) => {
          calls.count.push(params);
          return 0;
        },
      }),
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    return { strapi, calls };
  };

  it.each([
    ['getTableData', 'getTableData' as const],
    ['downloadCSV', 'downloadCSV' as const],
  ])('%s passes locale as a param, not a filter', async (_label, method) => {
    const { strapi, calls } = spyStrapi();

    const result = await service({ strapi })[method](
      fakeCtx({ uid: plainUid, locale: 'de', sortOrder: ['title'] })
    );
    if (method === 'downloadCSV') await readCsv(result);

    expect(calls.findMany[0].locale).toBe('de');
    expect(calls.findMany[0].filters).not.toHaveProperty('locale');
  });

  it('keeps the configured filters alongside the locale param', async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: localizedUid, locale: 'de' }));

    expect(calls.findMany[0]).toMatchObject({ locale: 'de' });
    expect(calls.findMany[0].filters).toEqual({});
  });

  it('counts with the same locale', async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: plainUid, locale: 'de' }));

    expect(calls.count[0]).toMatchObject({ locale: 'de' });
  });

  it('falls back to the default locale when none is requested', async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: plainUid }));

    expect(calls.findMany[0].locale).toBe('en');
  });
});

describe('row count', () => {
  const filteredUid = 'api::article.article';

  const spyStrapi = (contentTypeConfig: Record<string, unknown>) => {
    const calls: { findMany: any[]; count: any[] } = { findMany: [], count: [] };

    const strapi = {
      config: { get: () => ({ config: { [filteredUid]: contentTypeConfig } }) },
      contentTypes: {
        [filteredUid]: {
          kind: 'collectionType',
          attributes: { title: { type: 'string' }, createdAt: { type: 'datetime' } },
        },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async (params: any) => {
          calls.findMany.push(params);
          return [];
        },
        count: async (params: any) => {
          calls.count.push(params);
          return 0;
        },
      }),
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    return { strapi, calls };
  };

  it('counts with the configured filters', async () => {
    const { strapi, calls } = spyStrapi({
      columns: ['title'],
      filter: { title: { $contains: 'Hello' } },
    });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid }));

    expect(calls.count[0].filters).toEqual({ title: { $contains: 'Hello' } });
  });

  it('counts the same set the rows come from', async () => {
    const { strapi, calls } = spyStrapi({
      columns: ['title'],
      filter: { title: { $contains: 'Hello' } },
      status: 'published',
    });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid }));

    expect(calls.count[0].filters).toEqual(calls.findMany[0].filters);
    expect(calls.count[0].status).toBe(calls.findMany[0].status);
    expect(calls.count[0].locale).toBe(calls.findMany[0].locale);
  });

  it('counts with the configured status', async () => {
    const { strapi, calls } = spyStrapi({ columns: ['title'], status: 'published' });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid }));

    expect(calls.count[0].status).toBe('published');
  });

  it('defaults the counted status to draft like the query does', async () => {
    const { strapi, calls } = spyStrapi({ columns: ['title'] });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid }));

    expect(calls.count[0].status).toBe('draft');
  });

  it('does not count with pagination params', async () => {
    const { strapi, calls } = spyStrapi({ columns: ['title'] });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid, limit: '5', offset: '10' }));

    expect(calls.count[0]).not.toHaveProperty('limit');
    expect(calls.count[0]).not.toHaveProperty('offset');
    expect(calls.findMany[0]).toMatchObject({ limit: 5, offset: 10 });
  });

  it('drops filters on fields that do not exist', async () => {
    const { strapi, calls } = spyStrapi({
      columns: ['title'],
      filter: { title: { $eq: 'a' }, ghost: { $eq: 'b' } },
    });

    await service({ strapi }).getTableData(fakeCtx({ uid: filteredUid }));

    expect(calls.count[0].filters).toEqual({ title: { $eq: 'a' } });
  });
});

describe('column set', () => {
  const columnUid = 'api::article.article';

  const spyStrapi = (
    contentTypeConfig: Record<string, unknown>,
    rows: any[],
    ignore?: string[]
  ) => {
    const strapi = {
      config: { get: () => ({ config: { [columnUid]: contentTypeConfig }, ignore }) },
      contentTypes: {
        [columnUid]: {
          kind: 'collectionType',
          attributes: { title: { type: 'string' }, subtitle: { type: 'string' } },
        },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async () => rows,
        count: async () => rows.length,
      }),
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    return strapi;
  };

  it('reports a column that is null on the visible page', async () => {
    const strapi = spyStrapi({ columns: ['title', 'subtitle'] }, [{ title: 'Hi' }]);

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: columnUid }));

    expect(result.columns).toEqual(['title', 'subtitle']);
  });

  it('reports columns even when the page is empty', async () => {
    const strapi = spyStrapi({ columns: ['title', 'subtitle'] }, []);

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: columnUid }));

    expect(result.columns).toEqual(['title', 'subtitle']);
  });

  it('honours ignore in the reported columns', async () => {
    const strapi = spyStrapi({ columns: ['title', 'subtitle'] }, [{ title: 'Hi' }], ['subtitle']);

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: columnUid }));

    expect(result.columns).toEqual(['title']);
  });

  it('exports a column that is null in every row', async () => {
    const strapi = spyStrapi({ columns: ['title', 'subtitle'] }, [{ title: 'Hi' }]);

    const csv = await readCsv(
      await service({ strapi }).downloadCSV(
        fakeCtx({ uid: columnUid, sortOrder: ['title', 'subtitle'] })
      )
    );

    expect(csv).toContain('Title,Subtitle');
    expect(csv).toContain('Hi,');
  });
});

describe('admin permissions', () => {
  const permUid = 'api::article.article';

  const makeStrapi = (pluginDouble: any, rows: any[] = [{ title: 'Hi', secret: 'shh' }]) =>
    ({
      config: {
        get: () => ({ config: { [permUid]: { columns: ['title', 'createdAt', 'secret'] } } }),
      },
      contentTypes: {
        [permUid]: {
          kind: 'collectionType',
          info: { displayName: 'Article' },
          attributes: {
            title: { type: 'string' },
            createdAt: { type: 'datetime' },
            secret: { type: 'string' },
          },
        },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({ findMany: async () => rows, count: async () => rows.length }),
      plugin: pluginDouble,
    }) as unknown as Core.Strapi;

  it.each(['getTableData', 'downloadCSV'] as const)(
    '%s is forbidden without Content-Manager read access',
    async (method) => {
      const strapi = makeStrapi(fakePlugin({ canRead: false }));

      await expect(
        service({ strapi })[method](fakeCtx({ uid: permUid, sortOrder: ['title'] }))
      ).rejects.toBeInstanceOf(errors.ForbiddenError);
    }
  );

  it('denies when the request carries no userAbility', async () => {
    const strapi = makeStrapi(fakePlugin());
    const ctx = { query: { uid: permUid }, state: {}, throw: vi.fn() } as unknown as Context;

    await expect(service({ strapi }).getTableData(ctx)).rejects.toBeInstanceOf(
      errors.ForbiddenError
    );
  });

  it('omits fields the role may not read', async () => {
    const strapi = makeStrapi(fakePlugin({ allowFields: ['title', 'createdAt'] }));

    const csv = await readCsv(
      await service({ strapi }).downloadCSV(
        fakeCtx({ uid: permUid, sortOrder: ['title', 'secret'] })
      )
    );

    expect(csv).toContain('Title');
    expect(csv).not.toContain('Secret');
    expect(csv).not.toContain('shh');
  });

  it('omits unreadable fields from the table columns too', async () => {
    const strapi = makeStrapi(fakePlugin({ allowFields: ['title', 'createdAt'] }));

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: permUid }));

    expect(result.columns).toEqual(['title', 'createdAt']);
  });

  it('keeps createdAt for a role with field restrictions', async () => {
    const strapi = makeStrapi(
      fakePlugin({
        allowFields: ['title', 'createdAt'],
        sanitize: ({ secret, ...rest }: any) => rest,
      }),
      [{ title: 'Hi', createdAt: '2024-01-15T10:00:00.000Z', secret: 'shh' }]
    );

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: permUid }));

    expect(result.columns).toContain('createdAt');
    expect(result.columns).not.toContain('secret');
  });

  it('keeps every column for a role without field restrictions', async () => {
    const strapi = makeStrapi(fakePlugin());

    const result = await service({ strapi }).getTableData(fakeCtx({ uid: permUid }));

    expect(result.columns).toEqual(['title', 'createdAt', 'secret']);
  });

  it('hides unreadable content types from the dropdown', async () => {
    const strapi = makeStrapi(fakePlugin({ canRead: false }));

    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.contentTypes).toEqual([]);
  });
});

describe('dropdown content type matching', () => {
  it('does not offer a content type whose uid merely contains a configured one', async () => {
    const strapi = {
      config: { get: () => ({ config: { 'api::post.post': { columns: ['title'] } } }) },
      contentTypes: {
        'api::post.post': { kind: 'collectionType', info: { displayName: 'Post' }, attributes: {} },
        'api::post.post-archive': {
          kind: 'collectionType',
          info: { displayName: 'Post Archive' },
          attributes: {},
        },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.contentTypes).toEqual([{ label: 'Post', value: 'api::post.post' }]);
  });

  it('skips a configured uid that is not a collection type', async () => {
    const strapi = {
      config: { get: () => ({ config: { 'api::home.home': { columns: ['title'] } } }) },
      contentTypes: { 'api::home.home': { kind: 'singleType', attributes: {} } },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.contentTypes).toEqual([]);
  });
});

describe('streamed export', () => {
  const streamUid = 'api::article.article';

  const spyStrapi = (total: number, pluginConfig: Record<string, unknown> = {}) => {
    const rows = Array.from({ length: total }, (_, i) => ({ title: `row${i}` }));
    const calls: { limit: number; offset: number }[] = [];

    const strapi = {
      config: {
        get: () => ({ config: { [streamUid]: { columns: ['title'] } }, ...pluginConfig }),
      },
      contentTypes: {
        [streamUid]: { kind: 'collectionType', attributes: { title: { type: 'string' } } },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async ({ limit, offset }: any) => {
          calls.push({ limit, offset });
          return rows.slice(offset, offset + limit);
        },
        count: async () => rows.length,
      }),
      plugin: fakePlugin(),
    } as unknown as Core.Strapi;

    return { strapi, calls };
  };

  const download = (strapi: Core.Strapi) =>
    service({ strapi }).downloadCSV(fakeCtx({ uid: streamUid, sortOrder: ['title'] }));

  it('fetches in batches instead of loading everything at once', async () => {
    const { strapi, calls } = spyStrapi(12, { batchSize: 5 });

    await readCsv(await download(strapi));

    expect(calls).toEqual([
      { limit: 5, offset: 0 },
      { limit: 5, offset: 5 },
      { limit: 5, offset: 10 },
    ]);
  });

  it('exports every row across batches, with one header', async () => {
    const { strapi } = spyStrapi(12, { batchSize: 5 });

    const csv = await readCsv(await download(strapi));
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');

    expect(lines[0]).toBe('Title');
    expect(lines).toHaveLength(13);
    expect(lines[lines.length - 1]).toBe('row11');
  });

  it('stops at maxRows', async () => {
    const { strapi } = spyStrapi(100, { batchSize: 10, maxRows: 25 });

    const csv = await readCsv(await download(strapi));

    expect(csv.trim().split('\r\n')).toHaveLength(26);
  });

  it('still emits a header when the collection is empty', async () => {
    const { strapi } = spyStrapi(0);

    const csv = await readCsv(await download(strapi));

    expect(csv.replace(/^﻿/, '')).toBe('Title\r\n');
  });

  it('returns a stream rather than a buffered body', async () => {
    const { strapi } = spyStrapi(3);

    const body = await download(strapi);

    expect(typeof (body as any).pipe).toBe('function');
  });
});

describe('column set does not depend on the data', () => {
  const colUid = 'api::article.article';

  const makeStrapi = (rows: any[], allowFields?: string[]) =>
    ({
      config: {
        get: () => ({
          config: { [colUid]: { columns: ['title', 'secret'] } },
          batchSize: 1,
        }),
      },
      contentTypes: {
        [colUid]: {
          kind: 'collectionType',
          attributes: { title: { type: 'string' }, secret: { type: 'string' } },
        },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async ({ limit, offset }: any) => rows.slice(offset, offset + limit),
        count: async () => rows.length,
      }),
      plugin: fakePlugin({
        allowFields,
        sanitize: ({ secret, ...rest }: any) => (allowFields ? rest : { secret, ...rest }),
      }),
    }) as unknown as Core.Strapi;

  it('omits a restricted field even when it is absent from the first batch', async () => {
    // The restricted field only appears in the second batch. Deciding the header from batch one
    // would have listed it.
    const rows = [{ title: 'a' }, { title: 'b', secret: 'shh' }];
    const strapi = makeStrapi(rows, ['title']);

    const csv = await readCsv(
      await service({ strapi }).downloadCSV(
        fakeCtx({ uid: colUid, sortOrder: ['title', 'secret'] })
      )
    );

    expect(csv).not.toContain('Secret');
    expect(csv).not.toContain('shh');
  });

  it('keeps a permitted field that no row happens to populate', async () => {
    const strapi = makeStrapi([{ title: 'a' }]);

    const csv = await readCsv(
      await service({ strapi }).downloadCSV(
        fakeCtx({ uid: colUid, sortOrder: ['title', 'secret'] })
      )
    );

    expect(csv).toContain('Title,Secret');
  });
});
