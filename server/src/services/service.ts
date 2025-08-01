import type { Core, UID } from '@strapi/strapi';
import type { Context } from 'koa';
import { parseISO, format, isValid } from 'date-fns';

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getDropdownValues(ctx: Context) {
    try {
      const { config } = strapi.config.get<{ config: Record<string, any> }>('csv-exporter');
      const contentTypes = Object.keys(config || {}) as UID.ContentType[];
      const dropDownValues = [];

      Object.entries(strapi.contentTypes).forEach(([uid, contentType]) => {
        if (contentType?.kind === 'collectionType') {
          contentTypes?.forEach((type) => {
            if (uid?.startsWith(type)) {
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
  async getTableData(ctx) {
    try {
      const excel = strapi.config.get('csv-exporter') as any;
      const uid = ctx.query.uid;
      const limit = parseInt(ctx.query.limit, 10) || 10;
      const offset = parseInt(ctx.query.offset, 10) || 0;

      if (!uid || !excel?.config[uid]) {
        return ctx.badRequest('Invalid content type uid');
      }

      const query = await this.restructureObject(excel.config[uid], uid, limit, offset);

      const response = await strapi.entityService.findMany(uid, query as any);
      const header = [
        ...excel.config[uid].columns,
        ...Object.keys(excel.config[uid].relation || {}),
      ];
      let where = {};
      if (excel.config[uid].locale) {
        where = {
          locale: excel.config[uid].locale,
        };
      }

      const count = await strapi.entityService.count(uid, { filters: where });
      const tableData = await this.restructureData(response, excel.config[uid]);

      console.log('count', count, tableData.length);

      return {
        data: tableData,
        count: tableData.length,
        columns: header,
      };
    } catch (error) {
      strapi.log.error('Error fetching table data:', error);
      ctx.throw(500, 'Internal server error while fetching table data');
    }
  },
  async downloadCSV(ctx) {
    try {
      const excel = strapi.config.get('csv-exporter') as any;
      const uid = ctx.query.uid;

      if (!uid || !excel?.config[uid]) {
        return ctx.badRequest('Invalid content type uid');
      }

      const query = await this.restructureObject(excel.config[uid], uid);
      // Use entityService instead of query
      const response = await strapi.entityService.findMany(uid, query as any);
      const csvData = await this.restructureData(response, excel.config[uid]);

      // Extract column headers dynamically from the data
      const headers = [
        ...excel.config[uid].columns,
        ...Object.keys(excel.config[uid].relation || {}),
      ];

      // Transform the original headers to the desired format
      const headerRestructure = headers.map((element) =>
        element
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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
  async restructureObject(inputObject: any, uid: UID.ContentType, limit?: number, offset?: number) {
    const excel = strapi.config.get('csv-exporter') as any;

    let filters = {};

    if (excel?.config[uid]?.locale) {
      filters = {
        locale: excel?.config[uid]?.locale,
      };
    }

    // In Strapi v5, the query structure is updated
    const restructuredObject = {
      fields: inputObject.columns || undefined,
      populate: {},
      filters,
      sort: { id: 'asc' },
      limit: limit,
      offset: offset,
    };

    // Populate relations
    for (const key in inputObject.relation || {}) {
      restructuredObject.populate[key] = {
        fields: inputObject.relation[key].column,
      };
    }

    return restructuredObject;
  },
  async restructureData(data, objectStructure) {
    const dateFormat = strapi.plugin('csv-exporter').config('dateFormat') as string;

    return data.map((item) => {
      const restructuredItem = {};

      // Restructure main data based on columns
      for (const key of objectStructure.columns) {
        console.log(key, item[key]);

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

      // Restructure relation data based on the specified structure
      for (const key in objectStructure.relation || {}) {
        if (key in item) {
          const column = objectStructure.relation[key].column[0];
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

      return restructuredItem;
    });
  },
});

const isISODateString = (value) => {
  if (typeof value !== 'string') return false;

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(value)) return false;

  return isValid(parseISO(value));
};

export default service;
