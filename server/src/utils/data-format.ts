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

const relationColumns = (relations: { [key: string]: RelationConfig } = {}): string[] =>
  Object.entries(relations).flatMap(([key, relation]) => [
    key,
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

  // Get the primary column value for this level
  const primaryColumn = relationConfig.column[0];

  // Handle arrays
  if (Array.isArray(item)) {
    if (item.length === 0) {
      return;
    }

    // For arrays, we need to collect all primary values and nested relations
    const primaryValues: string[] = [];
    const nestedCollections: Record<string, string[]> = {};

    for (const arrayItem of item) {
      if (arrayItem && typeof arrayItem === 'object') {
        // Collect primary value
        if (primaryColumn && primaryColumn in arrayItem) {
          primaryValues.push(arrayItem[primaryColumn]);
        }

        // Collect nested relations
        if (relationConfig.relation) {
          for (const [nestedKey, nestedConfig] of Object.entries(relationConfig.relation)) {
            if (nestedKey in arrayItem) {
              const tempResult: Record<string, any> = {};
              parseNestedRelations(arrayItem[nestedKey], nestedConfig, tempResult, nestedKey);

              // Add collected values to the nested collections
              for (const [key, value] of Object.entries(tempResult)) {
                if (!nestedCollections[key]) {
                  nestedCollections[key] = [];
                }
                if (value) {
                  nestedCollections[key].push(value);
                }
              }
            }
          }
        }
      }
    }

    // Set primary values if any (use the parent key for the primary values)
    if (primaryValues.length > 0) {
      const uniquePrimaryValues = [...new Set(primaryValues.filter(Boolean))];
      result[parentKey] = uniquePrimaryValues.join(', ');
    }

    // Set nested relation values (use their own keys)
    for (const [key, values] of Object.entries(nestedCollections)) {
      if (values.length > 0) {
        const uniqueValues = [...new Set(values.filter(Boolean))];
        result[key] = uniqueValues.join(', ');
      }
    }

    return;
  }

  // Handle single objects
  // First, get the primary column value (use parent key)
  if (primaryColumn && primaryColumn in item) {
    result[parentKey] = item[primaryColumn];
  }

  // Then, recursively parse nested relations (use their own keys)
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
