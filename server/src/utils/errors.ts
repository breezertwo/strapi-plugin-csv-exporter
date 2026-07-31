import { errors } from "@strapi/utils";
import type { Core, UID } from "@strapi/strapi";

import type { ResolvedCSVExporterConfig } from "./config";

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

export const isApplicationError = (error: unknown): boolean =>
  error instanceof errors.ApplicationError;
