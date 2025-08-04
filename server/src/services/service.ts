import type { Core, UID } from '@strapi/strapi';
import type { Context } from 'koa';
import { parseISO, format, isValid } from 'date-fns';

export interface ContentTypeConfig {
  columns: string[];
  relation: {
    [key: string]: {
      column: string[];
    };
  };
  locale?: string;
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

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getDropdownValues(ctx: Context) {
    try {
      const { config } = strapi.config.get<CSVExporterPlugin>('csv-exporter');
      const contentTypes = Object.keys(config || {}) as UID.ContentType[];
      const dropDownValues = [];

      Object.entries(strapi.contentTypes).forEach(([uid, contentType]) => {
        if (contentType.kind === 'collectionType') {
          contentTypes.forEach((type) => {
            if (uid.includes(type)) {
              dropDownValues.push({
                label: contentType?.info?.displayName,
                value: uid,
              });
            }
          });
        }
      });

      dropDownValues.sort((a, b) => a.label.localeCompare(b.label));
      return dropDownValues;
    } catch (error) {
      strapi.log.error('Error fetching dropdown data:', error);
      ctx.throw(500, 'internal server error while fetching dropdown data');
    }
  },
  async getTableData(ctx: Context) {
    try {
      const { config } = strapi.config.get<CSVExporterPlugin>('csv-exporter');
      const uid = ctx.query.uid as UID.ContentType;
      const limit = parseInt(ctx.query.limit as string, 10) || 10;
      const offset = parseInt(ctx.query.offset as string, 10) || 0;

      if (!uid || !config[uid]) {
        return ctx.badRequest('Invalid content type uid');
      }

      // header row
      const columns = [
        ...config[uid].columns.filter((column) => column !== 'documentId'),
        ...Object.keys(config[uid].relation || {}),
        ...Object.keys(config[uid].customColumns || {}),
      ];

      const query = await this.restructureObject(config[uid], limit, offset);
      const response = await strapi.documents(uid).findMany(query);
      const data = await this.restructureData(response, config[uid], uid);

      let where = {};
      if (config[uid].locale) {
        where = {
          locale: config[uid].locale,
        };
      }
      const count = await strapi.documents(uid).count({ filters: where });

      return {
        columns,
        data,
        count,
      };
    } catch (error) {
      strapi.log.error('Error fetching table data:', error);
      ctx.throw(500, 'Internal server error while fetching table data');
    }
  },
  async downloadCSV(ctx: Context) {
    try {
      const { config } = strapi.config.get<CSVExporterPlugin>('csv-exporter');
      const uid = ctx.query.uid as UID.ContentType;

      if (!uid || !config[uid]) {
        return ctx.badRequest('Invalid content type uid');
      }

      const query = await this.restructureObject(config[uid]);
      const response = await strapi.documents(uid).findMany(query);

      const csvData = await this.restructureData(response, config[uid], uid);

      // Extract column headers dynamically from the data
      const headers = [
        ...config[uid].columns.filter((column: string) => column !== 'documentId'),
        ...Object.keys(config[uid].relation || {}),
        ...Object.keys(config[uid].customColumns || {}),
      ];

      // Transform the original headers to the desired format
      const headerRestructure = headers.map((element) =>
        element
          .split('_')
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      );

      // Create CSV content
      let csvContent = headerRestructure.join(',') + '\n';

      // Add data rows to CSV
      csvData.forEach((row) => {
        const csvRow = headers
          .map((header) => {
            // Handle values with commas by wrapping them in quotes
            const value =
              row[header] !== undefined && row[header] !== null ? row[header].toString() : '';
            return value.includes(',') ? `"${value}"` : value;
          })
          .join(',');

        csvContent += csvRow + '\n';
      });

      // Set response headers
      ctx.set('Content-Disposition', 'attachment; filename=export.csv');
      ctx.set('Content-Type', 'text/csv');

      return Buffer.from(csvContent);
    } catch (error) {
      strapi.log.error('Error generating CSV file:', error);
      ctx.throw(500, 'Internal server error while generating CSV file');
    }
  },
  async restructureObject(config: ContentTypeConfig, limit?: number, offset?: number) {
    let filters = {};

    if (config.locale) {
      filters = {
        locale: config.locale,
      };
    }

    const restructuredObject = {
      fields: config.columns || undefined,
      populate: {},
      filters,
      // sort: { id: 'asc' },
      limit: limit,
      offset: offset,
    };

    // Populate relations
    for (const key in config.relation || {}) {
      restructuredObject.populate[key] = {
        fields: config.relation[key].column,
      };
    }

    return restructuredObject;
  },
  async restructureData(data: any, config: ContentTypeConfig, uid: UID.ContentType) {
    const dateFormat = strapi.plugin('csv-exporter').config('dateFormat') as string;

    return data.map((item: Record<string, any>) => {
      const restructuredItem = {};

      for (const key of config.columns) {
        if (key in item) {
          if (isISODateString(item[key])) {
            restructuredItem[key] = format(item[key], dateFormat);
          } else if (Array.isArray(item[key]) && item[key].length > 0) {
            restructuredItem[key] = item[key]
              .filter(
                (e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean'
              )
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
  },
});

const isISODateString = (value: any) => {
  if (typeof value !== 'string') return false;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(value)) return false;

  return isValid(parseISO(value));
};

export default service;
