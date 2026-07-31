import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Core } from '@strapi/strapi';

import { MissingConfigError, getPluginConfig, validatePluginConfig } from './config';

const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

const fakeStrapi = (userConfig: unknown, contentTypes: Record<string, any> = {}) =>
  ({
    config: { get: () => userConfig },
    contentTypes,
    log,
  }) as unknown as Core.Strapi;

const article = {
  kind: 'collectionType',
  attributes: {
    title: { type: 'string' },
    createdAt: { type: 'datetime' },
    author: { type: 'relation', relation: 'oneToOne', target: 'api::author.author' },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPluginConfig', () => {
  const minimal = { config: { 'api::article.article': { columns: ['title'] } } };

  it.each([[undefined], [null], [{}], ['not an object'], [{ ignore: [] }]])(
    'throws MissingConfigError for %p',
    (userConfig) => {
      expect(() => getPluginConfig(fakeStrapi(userConfig))).toThrow(MissingConfigError);
    }
  );

  it('names the config file in the error message', () => {
    expect(() => getPluginConfig(fakeStrapi(undefined))).toThrow(/config\/csv-exporter\.ts/);
  });

  it('defaults ignore to an empty array', () => {
    expect(getPluginConfig(fakeStrapi(minimal)).ignore).toEqual([]);
  });

  it('defaults escapeFormulas to true', () => {
    expect(getPluginConfig(fakeStrapi(minimal)).escapeFormulas).toBe(true);
  });

  it('keeps explicitly provided values', () => {
    const resolved = getPluginConfig(
      fakeStrapi({ ...minimal, ignore: ['secret'], escapeFormulas: false })
    );

    expect(resolved.ignore).toEqual(['secret']);
    expect(resolved.escapeFormulas).toBe(false);
  });

  it('leaves dateFormat and timeZone unset so the request timezone can win', () => {
    const resolved = getPluginConfig(fakeStrapi(minimal));

    expect(resolved.dateFormat).toBeUndefined();
    expect(resolved.timeZone).toBeUndefined();
  });

  it('passes the content type config through untouched', () => {
    expect(getPluginConfig(fakeStrapi(minimal)).config).toEqual(minimal.config);
  });
});

describe('validatePluginConfig', () => {
  it('logs and returns instead of throwing when the config is missing', () => {
    expect(() => validatePluginConfig(fakeStrapi(undefined))).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('config/csv-exporter.ts'));
  });

  it('stays silent for a valid config', () => {
    validatePluginConfig(
      fakeStrapi(
        {
          config: {
            'api::article.article': {
              columns: ['title', 'createdAt', 'id', 'documentId'],
              relation: { author: { column: ['name'] } },
            },
          },
        },
        { 'api::article.article': article }
      )
    );

    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns about an empty config', () => {
    validatePluginConfig(fakeStrapi({ config: {} }));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('empty'));
  });

  it('reports an unknown content type', () => {
    validatePluginConfig(fakeStrapi({ config: { 'api::nope.nope': { columns: ['x'] } } }));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Unknown content type'));
  });

  it('reports a content type without columns', () => {
    validatePluginConfig(
      fakeStrapi({ config: { 'api::article.article': {} } }, { 'api::article.article': article })
    );
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('no "columns"'));
  });

  it('reports unknown columns', () => {
    validatePluginConfig(
      fakeStrapi(
        { config: { 'api::article.article': { columns: ['title', 'nope'] } } },
        { 'api::article.article': article }
      )
    );
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('nope'));
  });

  it('reports a relation declared on a non-relation field', () => {
    validatePluginConfig(
      fakeStrapi(
        { config: { 'api::article.article': { columns: ['title'], relation: { title: {} } } } },
        { 'api::article.article': article }
      )
    );
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not a relation'));
  });

  it('warns when a single type is configured', () => {
    validatePluginConfig(
      fakeStrapi(
        { config: { 'api::home.home': { columns: ['title'] } } },
        { 'api::home.home': { ...article, kind: 'singleType' } }
      )
    );
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('singleType'));
  });

  it('keeps going after a bad entry', () => {
    validatePluginConfig(
      fakeStrapi(
        {
          config: {
            'api::nope.nope': { columns: ['x'] },
            'api::article.article': { columns: ['title', 'alsoNope'] },
          },
        },
        { 'api::article.article': article }
      )
    );

    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Unknown content type'));
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('alsoNope'));
  });
});

describe('bom option', () => {
  const minimal = { config: { 'api::article.article': { columns: ['title'] } } };

  it('defaults to true so Excel reads UTF-8 correctly', () => {
    expect(getPluginConfig(fakeStrapi(minimal)).bom).toBe(true);
  });

  it('can be disabled', () => {
    expect(getPluginConfig(fakeStrapi({ ...minimal, bom: false })).bom).toBe(false);
  });
});
