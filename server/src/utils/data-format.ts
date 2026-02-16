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
  timeZone?: string;
  ignore?: string[];
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
  offset?: number
) => {
  const filters = {
    ...(filter || {}),
  };

  const restructuredObject = {
    fields: config.columns || undefined,
    filters,
    status: config.status || 'draft',
    populate: {},
    sort: 'id:asc',
    limit: limit,
    offset: offset,
  };

  restructuredObject.populate = processRelations(config.relation || {});
  return restructuredObject;
};

export const restructureData = async (
  data: any,
  config: ContentTypeConfig,
  uid: UID.ContentType,
  options: { dateFormat?: string; timeZone?: string; ignore?: string[] }
): Promise<Record<string, string>[]> => {
  return data.map((item: Record<string, any>) => {
    const restructuredItem = {};

    // Process regular columns
    // filter out documentId - for some reason it gets added somewhere and i can not fathom where
    for (const key of config.columns.filter((c) => !options.ignore.includes(c))) {
      if (key in item) {
        if (isISODateString(item[key])) {
          restructuredItem[key] = format(
            new TZDate(item[key], options.timeZone ?? 'Europe/Berlin'),
            options.dateFormat ?? 'dd.MM.yyyy HH:mm'
          );
        } else if (Array.isArray(item[key]) && item[key].length > 0) {
          restructuredItem[key] = item[key]
            .filter((e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean')
            .join(', ');
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

const isISODateString = (value: any) => {
  if (typeof value !== 'string') return false;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(value)) return false;

  return isValid(parseISO(value));
};
