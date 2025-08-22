import type { Core } from '@strapi/strapi';
import { permissions } from './utils/permissions';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.admin.services.permission.actionProvider.registerMany(permissions);
};

export default bootstrap;
