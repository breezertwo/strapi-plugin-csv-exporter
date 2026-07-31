import type { Core, UID } from "@strapi/strapi";
import type { Context } from "koa";
import {
  restructureData,
  restructureObject,
  validateFilter,
  getDefaultLocale,
  getLocaleOptions,
  getPluginConfig,
  assertExportableUid,
  isApplicationError,
  orderColumns,
  toCSVRow,
  toStringArray,
  CSV_LINE_BREAK,
  CSV_CONTENT_TYPE,
  UTF8_BOM,
} from "../utils";

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getDropdownValues(ctx: Context) {
    try {
      const { config } = getPluginConfig(strapi);
      const contentTypes = Object.keys(config) as UID.ContentType[];
      const dropDownValues = [];

      Object.entries(strapi.contentTypes).forEach(([uid, contentType]) => {
        if (contentType.kind === "collectionType") {
          contentTypes.forEach((type) => {
            if (uid.includes(type)) {
              const label = config[uid]?.dropdownLabel ?? contentType?.info?.displayName ?? type;
              dropDownValues.push({
                label,
                value: uid,
              });
            }
          });
        }
      });

      dropDownValues.sort((a, b) => a.label.localeCompare(b.label));

      // get available locales & default locale
      const { locales, defaultLocale } = await getLocaleOptions(strapi);

      return {
        locales,
        contentTypes: dropDownValues,
        defaultLocale,
      };
    } catch (error) {
      if (isApplicationError(error)) throw error;

      strapi.log.error("Error fetching dropdown data:", error);
      ctx.throw(500, "internal server error while fetching dropdown data");
    }
  },
  async getTableData(ctx: Context) {
    try {
      const { config, dateFormat, timeZone: configTimeZone, ignore } = getPluginConfig(strapi);

      const uid = ctx.query.uid as UID.ContentType;

      assertExportableUid(uid, config, strapi.contentTypes);

      const limit = parseInt(ctx.query.limit as string, 10) || 10;
      const offset = parseInt(ctx.query.offset as string, 10) || 0;
      const locale = (ctx.query.locale as string) || (await getDefaultLocale(strapi));
      const timeZone = (ctx.query.timezone as string) || "+00:00";

      const validatedFilters = validateFilter(
        config[uid].filter,
        strapi.contentTypes[uid].attributes,
      );

      const query = await restructureObject(config[uid], validatedFilters, limit, offset);

      const response = await strapi.documents(uid).findMany({
        ...query,
        locale,
      });

      const data = await restructureData(response, config[uid], uid, {
        dateFormat,
        timeZone: configTimeZone ?? timeZone,
        ignore,
      });

      // Collect all unique keys from the actual data
      const allKeys = new Set<string>();
      data.forEach((item) => {
        Object.keys(item).forEach((key) => allKeys.add(key));
      });

      const count = await strapi.documents(uid).count({
        filters: query.filters,
        status: query.status,
        locale,
      });

      return {
        columns: Array.from(allKeys),
        data,
        count,
      };
    } catch (error) {
      if (isApplicationError(error)) throw error;

      strapi.log.error("Error fetching table data:", error);
      ctx.throw(500, "Internal server error while fetching table data");
    }
  },
  async downloadCSV(ctx: Context) {
    try {
      const {
        config,
        dateFormat,
        timeZone: configTimeZone,
        ignore,
        escapeFormulas,
        bom,
      } = getPluginConfig(strapi);
      const uid = ctx.query.uid as UID.ContentType;

      assertExportableUid(uid, config, strapi.contentTypes);

      const sortOrder = toStringArray(ctx.query.sortOrder);
      const locale = (ctx.query.locale as string) || (await getDefaultLocale(strapi));
      const timeZone = (ctx.query.timezone as string) || "+00:00";

      const validatedFilters = validateFilter(
        config[uid].filter,
        strapi.contentTypes[uid].attributes,
      );

      const query = await restructureObject(config[uid], validatedFilters);
      const response = await strapi.documents(uid).findMany({
        ...query,
        locale,
      });
      const csvData = await restructureData(response, config[uid], uid, {
        dateFormat,
        ignore,
        timeZone: configTimeZone ?? timeZone,
      });

      // Collect all unique keys from the actual data
      const allKeys = new Set<string>();
      csvData.forEach((item) => {
        Object.keys(item).forEach((key) => allKeys.add(key));
      });

      const sortedArray = orderColumns(Array.from(allKeys), sortOrder);

      // Transform the headers to the desired format
      const headerRestructure = sortedArray.map((element) =>
        element
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
      );

      // Create CSV content
      const csvOptions = { escapeFormulas };
      let csvContent = bom ? UTF8_BOM : "";
      csvContent += toCSVRow(headerRestructure, csvOptions) + CSV_LINE_BREAK;

      // Add data rows to CSV
      csvData.forEach((row) => {
        const values = sortedArray.map((header) => row[header]);
        csvContent += toCSVRow(values, csvOptions) + CSV_LINE_BREAK;
      });

      // Set response headers
      ctx.set("Content-Disposition", "attachment; filename=export.csv");
      ctx.set("Content-Type", CSV_CONTENT_TYPE);
      return Buffer.from(csvContent);
    } catch (error) {
      if (isApplicationError(error)) throw error;

      strapi.log.error("Error generating CSV file:", error);
      ctx.throw(500, "Internal server error while generating CSV file");
    }
  },
});

export default service;
