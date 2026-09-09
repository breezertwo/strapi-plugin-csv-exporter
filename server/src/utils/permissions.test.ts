import { describe, expect, it } from "vitest";
import type { Core, UID } from "@strapi/strapi";
import type { Context } from "koa";

import {
  permittedColumns,
  sanitizeRows,
  scopeQueryToPermissions,
  type PermissionChecker,
} from "./permissions";

const attributes = {
  title: { type: "string" },
  createdAt: { type: "datetime" },
  email: { type: "string" },
  secret: { type: "string", private: true },
  password: { type: "password" },
};

const checker = (allow?: string[]): PermissionChecker => ({
  cannot: { read: () => false },
  sanitizeOutput: async (row) => row,
  sanitizeQuery: async ({ fields }) => ({
    fields: allow
      ? fields.filter((f: string) => [...allow, "createdAt", "updatedAt"].includes(f))
      : fields,
  }),
  sanitizedQuery: { read: async () => ({}) },
});

describe("sanitizeRows", () => {
  it("sanitizes every row", async () => {
    const stripping: PermissionChecker = {
      ...checker(),
      sanitizeOutput: async ({ email: _, ...rest }) => rest,
    };

    await expect(sanitizeRows(stripping, [{ title: "Hi", email: "a@b.c" }])).resolves.toEqual([
      { title: "Hi" },
    ]);
  });
});

describe("scopeQueryToPermissions", () => {
  const uid = "api::article.article" as UID.ContentType;

  const strapi = {
    log: { warn: () => {} },
    contentTypes: {
      [uid]: {
        attributes: {
          ...attributes,
          locale: { type: "string" },
          createdBy: { type: "relation", target: "admin::user" },
        },
      },
    },
    getModel: () => ({ attributes: { roles: { type: "relation", target: "admin::role" } } }),
  } as unknown as Core.Strapi;

  const withConditions = (conditions: unknown) =>
    ({ state: { userAbility: { rulesFor: () => [{ conditions }] } } }) as unknown as Context;

  const scoped = (filters?: Record<string, any>): PermissionChecker => ({
    ...checker(),
    sanitizedQuery: { read: async () => (filters ? { filters } : {}) },
  });

  it("asks for the locale the i18n condition matches on", async () => {
    const query = await scopeQueryToPermissions(
      strapi,
      withConditions({ $and: [{ locale: { $in: ["en"] } }] }),
      uid,
      scoped(),
      { fields: ["title"], populate: {} },
    );

    expect(query.fields).toEqual(["title", "locale"]);
  });

  it("populates the relation the creator condition matches on and filters out foreign rows", async () => {
    const permissionFilters = { $or: [{ createdBy: { id: 1 } }] };

    const query = await scopeQueryToPermissions(
      strapi,
      withConditions({
        $and: [{ $or: [{ "createdBy.roles": { $elemMatch: { id: { $in: [1] } } } }] }],
      }),
      uid,
      scoped(permissionFilters),
      { fields: ["title"], populate: {}, filters: { title: { $ne: null } } },
    );

    expect(query.populate).toEqual({ createdBy: { populate: { roles: true } } });
    expect(query.filters).toEqual({ $and: [{ title: { $ne: null } }, permissionFilters] });
  });

  it("leaves the query alone for an unconditional role", async () => {
    const query = { fields: ["title"], populate: {}, filters: { title: { $ne: null } } };

    await expect(
      scopeQueryToPermissions(strapi, withConditions(undefined), uid, scoped(), query),
    ).resolves.toEqual(query);
  });
});

describe("permittedColumns", () => {
  it("keeps everything for a role without field restrictions", async () => {
    await expect(
      permittedColumns(checker(), ["title", "email", "createdAt"], attributes),
    ).resolves.toEqual(["title", "email", "createdAt"]);
  });

  it("drops fields outside the role field list", async () => {
    await expect(
      permittedColumns(checker(["title"]), ["title", "email"], attributes),
    ).resolves.toEqual(["title"]);
  });

  it("keeps createdAt, which Strapi permits regardless of the field list", async () => {
    await expect(
      permittedColumns(checker(["title"]), ["title", "createdAt"], attributes),
    ).resolves.toEqual(["title", "createdAt"]);
  });

  it("drops password attributes but keeps private ones by default", async () => {
    await expect(
      permittedColumns(checker(), ["title", "secret", "password"], attributes),
    ).resolves.toEqual(["title", "secret"]);
  });

  it("also drops private attributes when excludePrivateFields is enabled", async () => {
    await expect(
      permittedColumns(checker(), ["title", "secret", "password"], attributes, true),
    ).resolves.toEqual(["title"]);
  });

  it("keeps names that are not attributes, such as custom columns", async () => {
    await expect(
      permittedColumns(checker(["title"]), ["title", "customThing"], attributes),
    ).resolves.toEqual(["title", "customThing"]);
  });

  it("does not need any data, so an empty collection yields the same columns", async () => {
    const columns = await permittedColumns(checker(["title"]), ["title", "email"], attributes);

    expect(columns).toEqual(["title"]);
  });

  it("keeps the columns if sanitizeQuery fails", async () => {
    const failing: PermissionChecker = {
      ...checker(),
      sanitizeQuery: async () => {
        throw new Error("boom");
      },
    };

    await expect(permittedColumns(failing, ["title", "email"], attributes)).resolves.toEqual([
      "title",
      "email",
    ]);
  });
});
