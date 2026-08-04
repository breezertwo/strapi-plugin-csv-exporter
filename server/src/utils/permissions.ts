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
  sanitizeQuery: (query: Record<string, any>) => Promise<Record<string, any>>;
  sanitizedQuery: { read: (query: Record<string, any>) => Promise<Record<string, any>> };
}

const READ_ACTION = "plugin::content-manager.explorer.read";

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

const conditionPaths = (conditions: unknown, paths = new Set<string>()): Set<string> => {
  if (!conditions || typeof conditions !== "object") {
    return paths;
  }

  for (const [key, value] of Object.entries(conditions)) {
    if (key.startsWith("$")) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        conditionPaths(entry, paths);
      }
    } else {
      paths.add(key);
    }
  }

  return paths;
};

const readConditionPaths = (ctx: Context, uid: UID.ContentType): string[] => {
  const userAbility = ctx.state?.userAbility;

  if (typeof userAbility?.rulesFor !== "function") {
    return [];
  }

  try {
    const rules = userAbility.rulesFor(READ_ACTION, uid) as { conditions?: unknown }[];

    return [
      ...rules.reduce((paths, rule) => conditionPaths(rule.conditions, paths), new Set<string>()),
    ];
  } catch {
    return [];
  }
};

const populateForPath = (strapi: Core.Strapi, attribute: any, segments: string[]): any => {
  const [next, ...rest] = segments;
  const nested = next ? strapi.getModel(attribute.target)?.attributes?.[next] : undefined;

  if (nested?.type !== "relation") {
    return true;
  }

  return { populate: { [next]: populateForPath(strapi, nested, rest) } };
};

export const scopeQueryToPermissions = async <
  T extends { fields?: string[]; populate?: Record<string, any>; filters?: Record<string, any> },
>(
  strapi: Core.Strapi,
  ctx: Context,
  uid: UID.ContentType,
  checker: PermissionChecker,
  query: T,
): Promise<T> => {
  const attributes = strapi.contentTypes[uid]?.attributes ?? {};
  const fields = Array.isArray(query.fields) ? [...query.fields] : undefined;
  const populate = { ...query.populate };

  for (const path of readConditionPaths(ctx, uid)) {
    const [root, ...nested] = path.split(".");
    const attribute = attributes[root];

    if (!attribute || root in populate) {
      continue;
    }

    if (attribute.type === "relation") {
      populate[root] = populateForPath(strapi, attribute, nested);
    } else if (fields && !fields.includes(root)) {
      fields.push(root);
    }
  }

  let filters = query.filters;

  try {
    const scoped = await checker.sanitizedQuery.read({});

    if (scoped?.filters && Object.keys(scoped.filters).length > 0) {
      filters =
        filters && Object.keys(filters).length > 0
          ? { $and: [filters, scoped.filters] }
          : scoped.filters;
    }
  } catch (error) {
    strapi.log.warn("[csv-exporter] Could not scope the query to the read permission:", error);
  }

  return { ...query, fields, populate, filters };
};

export const sanitizeRows = async (
  checker: PermissionChecker,
  rows: Record<string, any>[],
): Promise<Record<string, any>[]> => Promise.all(rows.map((row) => checker.sanitizeOutput(row)));

export const permittedColumns = async (
  checker: PermissionChecker,
  columns: string[],
  attributes: Record<string, any> = {},
): Promise<string[]> => {
  const candidates = columns.filter((column) => {
    const attribute = attributes[column];

    return !attribute?.private && attribute?.type !== "password";
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
