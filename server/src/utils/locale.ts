import type { Core } from "@strapi/strapi";

export const FALLBACK_LOCALE = "en";

export interface LocaleOption {
  label: string;
  value: string;
}

export interface LocaleOptions {
  locales: LocaleOption[];
  defaultLocale: string;
}

/**
 * The i18n plugin ships with Strapi but can be disabled, in which case `strapi.plugin('i18n')`
 * is undefined and calling `.service()` on it takes down every endpoint of this plugin. Every
 * i18n access therefore goes through here, and the plugin degrades to "no locales" instead.
 */
const getLocalesService = (strapi: Core.Strapi): any | null => {
  try {
    return strapi.plugin("i18n")?.service("locales") ?? null;
  } catch {
    return null;
  }
};

/** All configured locales, or an empty array when i18n is unavailable. */
export const findLocales = async (strapi: Core.Strapi): Promise<any[]> => {
  const localesService = getLocalesService(strapi);

  if (!localesService) {
    return [];
  }

  try {
    const locales = await localesService.find();
    return Array.isArray(locales) ? locales : [];
  } catch (error) {
    strapi.log.warn("[csv-exporter] Could not read locales from i18n:", error);
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
      strapi.log.warn("Could not determine default locale from i18n settings:", error);
    }
  }

  return FALLBACK_LOCALE;
};

/** Locale dropdown options for the admin panel. Empty when i18n is unavailable. */
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
    strapi.log.warn("[csv-exporter] Could not determine the default locale:", error);
  }

  return {
    locales: options,
    defaultLocale: defaultLocale || options[0]?.value || FALLBACK_LOCALE,
  };
};

/**
 * Only filter by locale when more than one is configured - a single-locale (or i18n-less)
 * project stores `null` on non-localized entries, which would filter everything out.
 */
export const localeFilter = (locales: unknown[], locale: string): { locale?: string } =>
  locales.length > 1 ? { locale } : {};
