import type { Core } from '@strapi/strapi';

export const getDefaultLocale = async (strapi: Core.Strapi): Promise<string> => {
  try {
    const defaultLocale = await strapi.plugin('i18n').service('locales').getDefaultLocale();
    if (defaultLocale) {
      return defaultLocale;
    }
  } catch (error) {
    strapi.log.warn('Could not determine default locale from i18n settings:', error);
  }

  return 'en';
};
