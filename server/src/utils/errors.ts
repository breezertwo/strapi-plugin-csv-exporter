import { errors } from "@strapi/utils";
import type { Core, UID } from "@strapi/strapi";

import type { ResolvedCSVExporterConfig } from "./config";

/**
 * Reject a request with a 400 instead of letting it fail later with a 500.
 *
 * Strapi's error middleware turns a thrown `ApplicationError` into a proper response, whereas
 * `ctx.badRequest()` only mutates the context and returns `undefined` - which the controller
 * then assigns to `ctx.body`, making Koa downgrade the response to an empty 204.
 */
export const assertExportableUid = (
  uid: UID.ContentType | undefined,
  config: ResolvedCSVExporterConfig["config"],
  contentTypes: Core.Strapi["contentTypes"],
): void => {
  if (!uid) {
    throw new errors.ValidationError('Missing required query parameter "uid".');
  }

  if (!config[uid]) {
    throw new errors.ValidationError(
      `Content type "${uid}" is not configured for export. Add it to config/csv-exporter.ts.`,
    );
  }

  if (!contentTypes[uid]) {
    throw new errors.ValidationError(`Content type "${uid}" does not exist.`);
  }
};

/** Application errors carry their own status and message and must reach the error middleware. */
export const isApplicationError = (error: unknown): boolean =>
  error instanceof errors.ApplicationError;
