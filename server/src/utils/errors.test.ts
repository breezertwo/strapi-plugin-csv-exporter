import { describe, expect, it } from "vitest";
import { errors } from "@strapi/utils";
import type { UID } from "@strapi/strapi";

import { assertExportableUid, isApplicationError } from "./errors";

const uid = "api::article.article" as UID.ContentType;
const config = { [uid]: { columns: ["title"] } } as any;
const contentTypes = { [uid]: { kind: "collectionType", attributes: {} } } as any;

describe("assertExportableUid", () => {
  it("passes for a configured, existing content type", () => {
    expect(() => assertExportableUid(uid, config, contentTypes)).not.toThrow();
  });

  it.each([[undefined], ["" as UID.ContentType]])("rejects a missing uid (%p)", (value) => {
    expect(() => assertExportableUid(value as undefined, config, contentTypes)).toThrow(
      /Missing required query parameter/,
    );
  });

  it("rejects a content type that is not configured", () => {
    expect(() =>
      assertExportableUid("api::secret.secret" as UID.ContentType, config, contentTypes),
    ).toThrow(/is not configured for export/);
  });

  it("rejects a configured content type that does not exist", () => {
    expect(() => assertExportableUid(uid, config, {} as any)).toThrow(/does not exist/);
  });

  it("names the offending uid in the message", () => {
    expect(() =>
      assertExportableUid("api::secret.secret" as UID.ContentType, config, contentTypes),
    ).toThrow(/api::secret\.secret/);
  });

  it("throws errors Strapi maps to a 400", () => {
    // ValidationError is not in Strapi's status map, and formatApplicationError defaults
    // unmapped ApplicationErrors to 400.
    try {
      assertExportableUid(undefined, config, contentTypes);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(errors.ValidationError);
      expect(error).toBeInstanceOf(errors.ApplicationError);
    }
  });
});

describe("isApplicationError", () => {
  it.each([
    [new errors.ValidationError("nope")],
    [new errors.NotFoundError("nope")],
    [new errors.ForbiddenError("nope")],
  ])("recognizes %o", (error) => {
    expect(isApplicationError(error)).toBe(true);
  });

  it.each([[new Error("boom")], [new TypeError("boom")], ["boom"], [null], [undefined]])(
    "does not claim %p",
    (value) => {
      expect(isApplicationError(value)).toBe(false);
    },
  );
});
