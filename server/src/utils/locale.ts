import type { Core } from '@strapi/strapi';

export const FALLBACK_LOCALE = 'en';

export interface LocaleOption {
  label: string;
  value: string;
}

export interface LocaleOptions {
  locales: LocaleOption[];
  defaultLocale: string;
}

const getLocalesService = (strapi: Core.Strapi): any | null => {
  try {
    return strapi.plugin('i18n')?.service('locales') ?? null;
  } catch {
    return null;
  }
};

export const isLocalizedContentType = (strapi: Core.Strapi, uid: string): boolean => {
  try {
    return Boolean(
      strapi
        .plugin('i18n')
        ?.service('content-types')
        ?.isLocalizedContentType(strapi.contentTypes[uid])
    );
  } catch {
    return false;
  }
};

/**
 * i18n scopes the read permission per locale, and the permission checker evaluates that condition
 * against the row it sanitizes. A row fetched without its `locale` therefore fails the condition
 * and comes back with every localized field stripped, so ask for the column even when it is not
 * exported.
 */
export const withLocaleField = <T extends { fields?: string[] }>(
  strapi: Core.Strapi,
  uid: string,
  query: T
): T => {
  if (
    !Array.isArray(query.fields) ||
    query.fields.includes('locale') ||
    !isLocalizedContentType(strapi, uid)
  ) {
    return query;
  }

  return { ...query, fields: [...query.fields, 'locale'] };
};

export const findLocales = async (strapi: Core.Strapi): Promise<any[]> => {
  const localesService = getLocalesService(strapi);

  if (!localesService) {
    return [];
  }

  try {
    const locales = await localesService.find();
    return Array.isArray(locales) ? locales : [];
  } catch (error) {
    strapi.log.warn('[csv-exporter] Could not read locales from i18n:', error);
    return [];
  }
};

export const getDefaultLocale = async (strapi: Core.Strapi): Promise<string> => {
  const localesService = getLocalesService(strapi);

  if (localesService) {
    try {
      const defaultLocale = await localesService.getDefaultLocale();
      if (defaultLocale) {
        return defaultLocale;
      }
    } catch (error) {
      strapi.log.warn('Could not determine default locale from i18n settings:', error);
    }
  }

  return FALLBACK_LOCALE;
};

export const getLocaleOptions = async (strapi: Core.Strapi): Promise<LocaleOptions> => {
  const localesService = getLocalesService(strapi);
  const locales = await findLocales(strapi);

  const options = locales.map((locale: any) => ({
    label: locale.name,
    value: locale.code,
  }));

  let defaultLocale: string | undefined;

  try {
    const withDefault = await localesService?.setIsDefault(locales);
    defaultLocale = withDefault?.find((locale: any) => locale.isDefault)?.code;
  } catch (error) {
    strapi.log.warn('[csv-exporter] Could not determine the default locale:', error);
  }

  return {
    locales: options,
    defaultLocale: defaultLocale || options[0]?.value || FALLBACK_LOCALE,
  };
};
