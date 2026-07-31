import { errors } from "@strapi/utils";
import type { Core, UID } from "@strapi/strapi";
import type { Context } from "koa";

export const permissions = [
  {
    section: "plugins",
    pluginName: "csv-exporter",
    displayName: "Usage",
    uid: "usage",
  },
];

export interface PermissionChecker {
  cannot: { read: () => boolean };
  sanitizeOutput: (data: Record<string, any>) => Promise<Record<string, any>>;
}

const createChecker = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType,
): PermissionChecker | null => {
  const userAbility = ctx.state?.userAbility;

  if (!userAbility) {
    return null;
  }

  try {
    return strapi
      .plugin("content-manager")
      ?.service("permission-checker")
      ?.create({ userAbility, model: uid });
  } catch {
    return null;
  }
};

export const canReadContentType = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType,
): boolean => {
  const checker = createChecker(strapi, ctx, uid);

  return checker ? !checker.cannot.read() : false;
};

export const assertCanReadContentType = (
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType,
): PermissionChecker => {
  const checker = createChecker(strapi, ctx, uid);

  if (!checker || checker.cannot.read()) {
    throw new errors.ForbiddenError(`You are not allowed to read "${uid}".`);
  }

  return checker;
};

export interface SanitizedRows {
  rows: Record<string, any>[];
  removed: Set<string>;
}

export const sanitizeRows = async (
  checker: PermissionChecker,
  rows: Record<string, any>[],
): Promise<SanitizedRows> => {
  const sanitized = await Promise.all(rows.map((row) => checker.sanitizeOutput(row)));
  const removed = new Set<string>();

  rows.forEach((row, index) => {
    Object.keys(row).forEach((key) => {
      if (!(key in sanitized[index])) {
        removed.add(key);
      }
    });
  });

  return { rows: sanitized, removed };
};

export const readableColumns = (
  columns: string[],
  removed: Set<string>,
  attributes: Record<string, any> = {},
): string[] =>
  columns.filter((column) => {
    const attribute = attributes[column];

    if (attribute?.private || attribute?.type === "password") {
      return false;
    }

    return !removed.has(column);
  });
