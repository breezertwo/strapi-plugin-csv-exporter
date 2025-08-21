import type { Core, UID } from '@strapi/strapi';
import type { Context } from 'koa';
import {
  restructureData,
  restructureObject,
  validateFilter,
  type CSVExporterPlugin,
} from '../utils';

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
              const label = config[uid]?.dropdownLabel ?? contentType?.info?.displayName ?? type;
              console.log(
                'label',
                label,
                'vs',
                config[uid]?.dropdownLabel,
                contentType?.info?.displayName
              );
              dropDownValues.push({
                label,
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

      const validatedFilters = validateFilter(
        config[uid].filter,
        strapi.contentTypes[uid].attributes
      );
      const query = await restructureObject(config[uid], validatedFilters, limit, offset);
      const response = await strapi.documents(uid).findMany(query);
      const data = await restructureData(response, config[uid], uid);

      const where = {
        locale: 'en',
      };

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

      const validatedFilters = validateFilter(
        config[uid].filter,
        strapi.contentTypes[uid].attributes
      );

      const query = await restructureObject(config[uid], validatedFilters);
      const response = await strapi.documents(uid).findMany(query);

      const csvData = await restructureData(response, config[uid], uid);

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
});

export default service;
