import type { Core } from '@strapi/strapi';

import type { CSVExporterPlugin } from './data-format';

export const CONFIG_NAMESPACE = 'csv-exporter';

const IMPLICIT_COLUMNS = ['id', 'documentId'];

export type ResolvedCSVExporterConfig = CSVExporterPlugin &
  Required<Pick<CSVExporterPlugin, 'ignore' | 'escapeFormulas' | 'bom'>>;

export class MissingConfigError extends Error {
  constructor() {
    super(
      `Missing or invalid "config/${CONFIG_NAMESPACE}.ts": it must export an object with a "config" key. ` +
        `See https://github.com/breezertwo/strapi-plugin-csv-exporter#-quick-start`
    );
    this.name = 'MissingConfigError';
  }
}

export const getPluginConfig = (strapi: Core.Strapi): ResolvedCSVExporterConfig => {
  const userConfig = strapi.config.get<CSVExporterPlugin | undefined>(CONFIG_NAMESPACE);

  if (!userConfig || typeof userConfig !== 'object' || !userConfig.config) {
    throw new MissingConfigError();
  }

  return {
    ...userConfig,
    ignore: userConfig.ignore ?? [],
    escapeFormulas: userConfig.escapeFormulas ?? true,
    bom: userConfig.bom ?? true,
  };
};

export const validatePluginConfig = (strapi: Core.Strapi): void => {
  let pluginConfig: ResolvedCSVExporterConfig;

  try {
    pluginConfig = getPluginConfig(strapi);
  } catch (error) {
    strapi.log.error(`[csv-exporter] ${(error as Error).message}`);
    return;
  }

  const entries = Object.entries(pluginConfig.config);

  if (entries.length === 0) {
    strapi.log.warn(
      `[csv-exporter] "config" is empty - no content type will be available for export.`
    );
    return;
  }

  for (const [uid, contentTypeConfig] of entries) {
    const contentType = strapi.contentTypes[uid];

    if (!contentType) {
      strapi.log.error(`[csv-exporter] Unknown content type "${uid}" - it will be skipped.`);
      continue;
    }

    if (contentType.kind !== 'collectionType') {
      strapi.log.warn(
        `[csv-exporter] "${uid}" is a ${contentType.kind}, only collection types can be exported.`
      );
    }

    if (!Array.isArray(contentTypeConfig?.columns) || contentTypeConfig.columns.length === 0) {
      strapi.log.error(`[csv-exporter] "${uid}" has no "columns" - nothing would be exported.`);
      continue;
    }

    const known = [...Object.keys(contentType.attributes ?? {}), ...IMPLICIT_COLUMNS];

    const unknownColumns = contentTypeConfig.columns.filter((column) => !known.includes(column));
    if (unknownColumns.length > 0) {
      strapi.log.warn(
        `[csv-exporter] "${uid}" lists unknown column(s): ${unknownColumns.join(', ')}.`
      );
    }

    for (const relationKey of Object.keys(contentTypeConfig.relation ?? {})) {
      const attribute = contentType.attributes?.[relationKey];

      if (!attribute) {
        strapi.log.warn(
          `[csv-exporter] "${uid}" declares a relation on unknown field "${relationKey}".`
        );
      } else if (attribute.type !== 'relation' && attribute.type !== 'component') {
        strapi.log.warn(
          `[csv-exporter] "${uid}.${relationKey}" is of type "${attribute.type}", not a relation.`
        );
      }
    }
  }
};
