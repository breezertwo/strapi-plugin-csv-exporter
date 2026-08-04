import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Core } from '@strapi/strapi';

import {
  FALLBACK_LOCALE,
  findLocales,
  getDefaultLocale,
  getLocaleOptions,
  withLocaleField,
} from './locale';

const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

const locales = [
  { name: 'English (en)', code: 'en' },
  { name: 'German (de)', code: 'de' },
];

const withI18n = (overrides: Record<string, unknown> = {}) =>
  ({
    log,
    plugin: () => ({
      service: () => ({
        find: async () => locales,
        getDefaultLocale: async () => 'de',
        setIsDefault: async (input: any[]) =>
          input.map((locale) => ({ ...locale, isDefault: locale.code === 'de' })),
        ...overrides,
      }),
    }),
  }) as unknown as Core.Strapi;

const withoutI18n = () => ({ log, plugin: () => undefined }) as unknown as Core.Strapi;

const throwingI18n = () =>
  ({
    log,
    plugin: () => {
      throw new Error('Plugin i18n not found');
    },
  }) as unknown as Core.Strapi;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withLocaleField', () => {
  const withLocalization = (localized: boolean) =>
    ({
      log,
      contentTypes: { 'api::article.article': {} },
      plugin: () => ({ service: () => ({ isLocalizedContentType: () => localized }) }),
    }) as unknown as Core.Strapi;

  it('adds locale so the permission checker can match the row', () => {
    const query = withLocaleField(withLocalization(true), 'api::article.article', {
      fields: ['title'],
      limit: 10,
    });

    expect(query).toEqual({ fields: ['title', 'locale'], limit: 10 });
  });

  it.each([
    ['the content type is not localized', withLocalization(false), ['title']],
    ['locale is already exported', withLocalization(true), ['title', 'locale']],
  ])('leaves the fields alone when %s', (_label, strapi, fields) => {
    expect(withLocaleField(strapi, 'api::article.article', { fields })).toEqual({ fields });
  });
});

describe('findLocales', () => {
  it('returns the configured locales', async () => {
    await expect(findLocales(withI18n())).resolves.toEqual(locales);
  });

  it.each([
    ['i18n disabled', withoutI18n],
    ['strapi.plugin throwing', throwingI18n],
  ])('returns an empty array when %s', async (_label, buildStrapi) => {
    await expect(findLocales(buildStrapi())).resolves.toEqual([]);
  });

  it('survives the locales service throwing', async () => {
    const strapi = withI18n({
      find: async () => {
        throw new Error('db down');
      },
    });

    await expect(findLocales(strapi)).resolves.toEqual([]);
    expect(log.warn).toHaveBeenCalled();
  });

  it('coerces a non-array result', async () => {
    await expect(findLocales(withI18n({ find: async () => null }))).resolves.toEqual([]);
  });
});

describe('getDefaultLocale', () => {
  it('uses the i18n default', async () => {
    await expect(getDefaultLocale(withI18n())).resolves.toBe('de');
  });

  it.each([
    ['i18n disabled', withoutI18n],
    ['strapi.plugin throwing', throwingI18n],
  ])('falls back to %s', async (_label, buildStrapi) => {
    await expect(getDefaultLocale(buildStrapi())).resolves.toBe(FALLBACK_LOCALE);
  });

  it('falls back when i18n returns nothing', async () => {
    const strapi = withI18n({ getDefaultLocale: async () => undefined });

    await expect(getDefaultLocale(strapi)).resolves.toBe(FALLBACK_LOCALE);
  });
});

describe('getLocaleOptions', () => {
  it('maps locales to dropdown options and marks the default', async () => {
    await expect(getLocaleOptions(withI18n())).resolves.toEqual({
      locales: [
        { label: 'English (en)', value: 'en' },
        { label: 'German (de)', value: 'de' },
      ],
      defaultLocale: 'de',
    });
  });

  it.each([
    ['i18n disabled', withoutI18n],
    ['strapi.plugin throwing', throwingI18n],
  ])('degrades to no locales when %s', async (_label, buildStrapi) => {
    await expect(getLocaleOptions(buildStrapi())).resolves.toEqual({
      locales: [],
      defaultLocale: FALLBACK_LOCALE,
    });
  });

  it('falls back to the first locale when none is marked default', async () => {
    const strapi = withI18n({ setIsDefault: async (input: any[]) => input });

    await expect(getLocaleOptions(strapi)).resolves.toMatchObject({ defaultLocale: 'en' });
  });

  it('still returns options when setIsDefault throws', async () => {
    const strapi = withI18n({
      setIsDefault: async () => {
        throw new Error('nope');
      },
    });

    const result = await getLocaleOptions(strapi);

    expect(result.locales).toHaveLength(2);
    expect(result.defaultLocale).toBe('en');
    expect(log.warn).toHaveBeenCalled();
  });
});
