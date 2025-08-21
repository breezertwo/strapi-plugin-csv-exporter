import type { UID } from '@strapi/strapi';
import { parseISO, format, isValid } from 'date-fns';

export interface ContentTypeConfig {
  columns: string[];
  relation: {
    [key: string]: {
      column: string[];
    };
  };
  dropdownLabel?: string;
  filter?: Record<string, any>;
  customColumns?: {
    [key: string]: {
      column: (item: any, uid: UID.ContentType) => string;
    };
  };
}

type AtLeastOne<T> = {
  [K in keyof T]: Pick<T, K> & Partial<T>;
}[keyof T];

export interface CSVExporterPlugin {
  config: AtLeastOne<Record<UID.ContentType, ContentTypeConfig>>;
}

export const restructureObject = async (
  config: ContentTypeConfig,
  filter?: Record<string, any>,
  limit?: number,
  offset?: number
) => {
  const filters = {
    locale: 'en',
    ...(filter || {}),
  };

  const restructuredObject = {
    fields: config.columns || undefined,
    filters,
    populate: {},
    sort: 'id:asc',
    limit: limit,
    offset: offset,
  };

  // Populate relations
  for (const key in config.relation || {}) {
    restructuredObject.populate[key] = {
      fields: config.relation[key].column,
    };
  }

  console.log('query', restructuredObject);

  return restructuredObject;
};

export const restructureData = async (
  data: any,
  config: ContentTypeConfig,
  uid: UID.ContentType
): Promise<Record<string, string>[]> => {
  const dateFormat = strapi.plugin('csv-exporter').config('dateFormat') as string;

  return data.map((item: Record<string, any>) => {
    const restructuredItem = {};

    for (const key of config.columns) {
      if (key in item) {
        if (isISODateString(item[key])) {
          restructuredItem[key] = format(item[key], dateFormat);
        } else if (Array.isArray(item[key]) && item[key].length > 0) {
          restructuredItem[key] = item[key]
            .filter((e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean')
            .join(', ');
        } else {
          restructuredItem[key] = item[key];
        }
      }
    }

    for (const key in config.relation || {}) {
      if (key in item) {
        const column = config.relation[key].column[0];
        if (item[key] && typeof item[key] === 'object') {
          if (Array.isArray(item[key]) && item[key].length > 0) {
            restructuredItem[key] = item[key]
              .map((obj) => obj[column])
              .filter(Boolean)
              .join(', ');
          } else {
            restructuredItem[key] = item[key][column];
          }
        } else {
          restructuredItem[key] = null;
        }
      }
    }

    for (const key in config.customColumns || {}) {
      restructuredItem[key] = config.customColumns[key].column(item, uid);
    }

    return restructuredItem;
  });
};

const isISODateString = (value: any) => {
  if (typeof value !== 'string') return false;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(value)) return false;

  return isValid(parseISO(value));
};
