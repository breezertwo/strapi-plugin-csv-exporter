import { TZDate } from '@date-fns/tz';
import type { UID } from '@strapi/strapi';
import { parseISO, format, isValid } from 'date-fns';

export interface RelationConfig {
  column: string[];
  relation?: {
    [key: string]: RelationConfig;
  };
}

export interface ContentTypeConfig {
  columns: string[];
  relation?: {
    [key: string]: RelationConfig;
  };
  dropdownLabel?: string;
  filter?: Record<string, any>;
  status?: 'draft' | 'published';
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
  dateFormat?: string;
  dateOnlyFormat?: string;
  timeFormat?: string;
  timeZone?: string;
  ignore?: string[];
  excludePrivateFields?: boolean;
  escapeFormulas?: boolean;
  bom?: boolean;
  batchSize?: number;
  maxRows?: number;
  config: AtLeastOne<Record<UID.ContentType, ContentTypeConfig>>;
}

const processRelations = (relations: { [key: string]: RelationConfig }): Record<string, any> => {
  const populate = {};

  for (const key in relations || {}) {
    const relation = relations[key];
    populate[key] = {
      fields: relation.column,
    };

    if (relation.relation) {
      populate[key].populate = processRelations(relation.relation);
    }
  }

  return populate;
};

export const restructureObject = async (
  config: ContentTypeConfig,
  filter?: Record<string, any>,
  limit?: number,
  start?: number
) => {
  const filters = {
    ...filter,
  };

  const restructuredObject = {
    fields: config.columns || undefined,
    filters,
    status: config.status || 'draft',
    populate: {},
    sort: 'id:asc',
    limit: limit,
    start: start,
  };

  restructuredObject.populate = processRelations(config.relation || {});
  return restructuredObject;
};

// A relation with a single configured column keeps writing to its own key,
// a relation with multiple configured columns is split
const relationColumns = (relations: { [key: string]: RelationConfig } = {}): string[] =>
  Object.entries(relations).flatMap(([key, relation]) => [
    ...((relation.column?.length ?? 0) > 1
      ? relation.column.map((column) => `${key}:${column}`)
      : [key]),
    ...relationColumns(relation.relation),
  ]);

export const expectedColumns = (config: ContentTypeConfig, ignore: string[] = []): string[] => {
  const columns = [
    ...(config.columns ?? []).filter((column) => !ignore.includes(column)),
    ...relationColumns(config.relation),
    ...Object.keys(config.customColumns ?? {}),
  ];

  return [...new Set(columns)];
};

export const restructureData = async (
  data: any,
  config: ContentTypeConfig,
  uid: UID.ContentType,
  options: {
    dateFormat?: string;
    dateOnlyFormat?: string;
    timeFormat?: string;
    timeZone?: string;
    ignore?: string[];
  }
): Promise<Record<string, string>[]> => {
  return data.map((item: Record<string, any>) => {
    const restructuredItem = {};

    // Process regular columns
    // filter out documentId - for some reason it gets added somewhere and i can not fathom where
    const ignore = options.ignore ?? [];

    for (const key of config.columns.filter((c) => !ignore.includes(c))) {
      if (key in item) {
        if (isISODateString(item[key])) {
          restructuredItem[key] = format(
            new TZDate(item[key], options.timeZone ?? '+00:00'),
            options.dateFormat ?? 'dd.MM.yyyy HH:mm'
          );
        } else if (isISODateOnlyString(item[key])) {
          restructuredItem[key] = format(
            parseISO(item[key]),
            options.dateOnlyFormat ?? 'dd.MM.yyyy'
          );
        } else if (isISOTimeOnlyString(item[key])) {
          restructuredItem[key] = format(
            parseISO(`1970-01-01T${item[key]}`),
            options.timeFormat ?? 'HH:mm'
          );
        } else if (Array.isArray(item[key])) {
          const entries = item[key];
          restructuredItem[key] = entries.every(
            (e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean'
          )
            ? entries.join(', ')
            : JSON.stringify(entries);
        } else if (isPlainObject(item[key])) {
          restructuredItem[key] = JSON.stringify(item[key]);
        } else {
          restructuredItem[key] = item[key];
        }
      }
    }

    // Process relations
    for (const [relationKey, relationConfig] of Object.entries(config.relation || {})) {
      if (relationKey in item) {
        parseNestedRelations(item[relationKey], relationConfig, restructuredItem, relationKey);
      }
    }

    // Process custom columns
    for (const key in config.customColumns || {}) {
      restructuredItem[key] = config.customColumns[key].column(item, uid);
    }

    return restructuredItem;
  });
};

const parseNestedRelations = (
  item: any,
  relationConfig: RelationConfig,
  result: Record<string, any>,
  parentKey: string = ''
) => {
  if (!item || typeof item !== 'object') {
    return;
  }

  // `parentKey` (e.g. "author") or multiple (e.g. "author:name", "author:id").
  const columns = relationConfig.column ?? [];
  const cellKey = (column: string) => (columns.length > 1 ? `${parentKey}:${column}` : parentKey);

  // Handle arrays
  if (Array.isArray(item)) {
    if (item.length === 0) {
      return;
    }

    // Format every related record first so each column retains the same positions,
    // including duplicates, falsy values, and blanks for missing fields or relations.
    const rows: Record<string, any>[] = item.map((arrayItem) => {
      const row: Record<string, any> = {};
      parseNestedRelations(arrayItem, relationConfig, row, parentKey);
      return row;
    });
    const keys = new Set([...columns.map(cellKey), ...rows.flatMap((row) => Object.keys(row))]);

    for (const key of keys) {
      result[key] = rows.map((row) => row[key] ?? '').join(', ');
    }

    return;
  }

  // Handle single objects
  // Get each configured column's value
  for (const column of columns) {
    if (column in item) {
      result[cellKey(column)] = item[column];
    }
  }

  // Recursively parse nested relations
  if (relationConfig.relation) {
    for (const [nestedKey, nestedConfig] of Object.entries(relationConfig.relation)) {
      if (nestedKey in item) {
        parseNestedRelations(item[nestedKey], nestedConfig, result, nestedKey);
      }
    }
  }
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?$/;

const matchesIso = (value: any, pattern: RegExp, prefix = '') =>
  typeof value === 'string' && pattern.test(value) && isValid(parseISO(`${prefix}${value}`));

const isISODateString = (value: any) => matchesIso(value, ISO_DATE_TIME);
const isISODateOnlyString = (value: any) => matchesIso(value, ISO_DATE);
const isISOTimeOnlyString = (value: any) => matchesIso(value, ISO_TIME, '1970-01-01T');

const isPlainObject = (value: any) =>
  value !== null && typeof value === 'object' && !(value instanceof Date);
