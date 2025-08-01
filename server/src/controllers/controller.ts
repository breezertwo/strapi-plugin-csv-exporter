import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getDropdownValues(ctx: Context) {
    ctx.body = await strapi.plugin('csv-exporter').service('service').getDropdownValues(ctx);
  },
  async getTableData(ctx: Context) {
    ctx.body = await strapi.plugin('csv-exporter').service('service').getTableData(ctx);
  },
  async downloadCSV(ctx: Context) {
    ctx.body = await strapi.plugin('csv-exporter').service('service').downloadCSV(ctx);
  },
});

export default controller;
