import { errors } from '@strapi/utils';
import type { Core, UID } from '@strapi/strapi';
import type { Context } from 'koa';

export const permissions = [
  {
    section: 'plugins',
    pluginName: 'csv-exporter',
    displayName: 'Usage',
    uid: 'usage',
  },
];

export interface PermissionChecker {
  cannot: { read: () => boolean };
  sanitizeOutput: (data: Record<string, any>) => Promise<Record<string, any>>;
  sanitizeQuery: (query: Record<string, any>) => Promise<Record<string, any>>;
}

const createChecker = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType
): PermissionChecker | null => {
  const userAbility = ctx.state?.userAbility;

  if (!userAbility) {
    return null;
  }

  try {
    return strapi
      .plugin('content-manager')
      ?.service('permission-checker')
      ?.create({ userAbility, model: uid });
  } catch {
    return null;
  }
};

export const canReadContentType = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType
): boolean => {
  const checker = createChecker(strapi, ctx, uid);

  return checker ? !checker.cannot.read() : false;
};

export const assertCanReadContentType = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType
): PermissionChecker => {
  const checker = createChecker(strapi, ctx, uid);

  if (!checker || checker.cannot.read()) {
    throw new errors.ForbiddenError(`You are not allowed to read "${uid}".`);
  }

  return checker;
};

export const sanitizeRows = async (
  checker: PermissionChecker,
  rows: Record<string, any>[]
): Promise<Record<string, any>[]> => Promise.all(rows.map((row) => checker.sanitizeOutput(row)));

/**
 * Asks Strapi which of these columns the role may read, without looking at any data, so the
 * answer is the same for an empty collection as for a large one. Names that are not attributes
 * of the content type - custom columns above all - are always kept.
 */
export const permittedColumns = async (
  checker: PermissionChecker,
  columns: string[],
  attributes: Record<string, any> = {}
): Promise<string[]> => {
  const candidates = columns.filter((column) => {
    const attribute = attributes[column];

    return !attribute?.private && attribute?.type !== 'password';
  });

  const fields = candidates.filter((column) => attributes[column]);

  if (fields.length === 0) {
    return candidates;
  }

  let allowed: Set<string>;

  try {
    const sanitized = await checker.sanitizeQuery({ fields });
    allowed = new Set(Array.isArray(sanitized?.fields) ? sanitized.fields : fields);
  } catch {
    allowed = new Set(fields);
  }

  return candidates.filter((column) => !attributes[column] || allowed.has(column));
};
