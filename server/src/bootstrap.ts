import type { Core } from '@strapi/strapi';
import { permissions } from './utils/permissions';
import { validatePluginConfig } from './utils/config';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.admin.services.permission.actionProvider.registerMany(permissions);

  validatePluginConfig(strapi);
};

export default bootstrap;
