import { describe, expect, it, vi } from "vitest";
import { errors } from "@strapi/utils";
import type { Core } from "@strapi/strapi";
import type { Context } from "koa";

import service from "./service";

const uid = "api::article.article";

const fakeStrapi = () =>
  ({
    config: { get: () => ({ config: { [uid]: { columns: ["title"] } } }) },
    contentTypes: { [uid]: { kind: "collectionType", attributes: { title: { type: "string" } } } },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    // Reaching either of these would mean the uid check ran too late.
    documents: vi.fn(() => {
      throw new Error("documents() must not be called for an invalid uid");
    }),
    plugin: vi.fn(() => {
      throw new Error("plugin() must not be called for an invalid uid");
    }),
  }) as unknown as Core.Strapi;

const fakeCtx = (query: Record<string, unknown>) =>
  ({ query, badRequest: vi.fn(), throw: vi.fn(), set: vi.fn() }) as unknown as Context;

describe.each(["getTableData", "downloadCSV"] as const)("%s", (method) => {
  const invoke = (query: Record<string, unknown>) => {
    const strapi = fakeStrapi();
    const ctx = fakeCtx(query);

    return { strapi, ctx, result: service({ strapi })[method](ctx) };
  };

  it("throws a ValidationError for an unconfigured uid", async () => {
    const { result } = invoke({ uid: "api::secret.secret" });

    await expect(result).rejects.toBeInstanceOf(errors.ValidationError);
  });

  it("throws a ValidationError when the uid is missing", async () => {
    const { result } = invoke({});

    await expect(result).rejects.toThrow(/Missing required query parameter/);
  });

  it("does not resolve with undefined, which Koa would turn into a 204", async () => {
    // Regression: the service used to `return ctx.badRequest(...)`, which returns undefined.
    // The controller then assigned that to ctx.body and Koa downgraded the 400 to an empty 204.
    const { result } = invoke({ uid: "api::secret.secret" });

    await expect(result).rejects.toBeDefined();
  });

  it("does not fall back to ctx.badRequest", async () => {
    const { ctx, result } = invoke({ uid: "api::secret.secret" });

    await result.catch(() => {});
    expect(ctx.badRequest).not.toHaveBeenCalled();
  });

  it("is not swallowed and rethrown as a 500", async () => {
    const { ctx, strapi, result } = invoke({ uid: "api::secret.secret" });

    await result.catch(() => {});
    expect(ctx.throw).not.toHaveBeenCalled();
    expect(strapi.log.error).not.toHaveBeenCalled();
  });

  it("rejects before doing any i18n or database work", async () => {
    const { result } = invoke({ uid: "api::secret.secret" });

    await expect(result).rejects.toBeInstanceOf(errors.ValidationError);
  });
});

describe("getDropdownValues without i18n", () => {
  const noI18nStrapi = () =>
    ({
      config: { get: () => ({ config: { [uid]: { columns: ["title"] } } }) },
      contentTypes: {
        [uid]: { kind: "collectionType", info: { displayName: "Article" }, attributes: {} },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      // i18n disabled: strapi.plugin('i18n') is undefined.
      plugin: () => undefined,
    }) as unknown as Core.Strapi;

  it("still lists the configured content types", async () => {
    // Regression: an unguarded strapi.plugin('i18n').service('locales') made the dropdown
    // endpoint 500, which left the whole admin page blank.
    const strapi = noI18nStrapi();
    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.contentTypes).toEqual([{ label: "Article", value: uid }]);
  });

  it("reports no locales instead of failing", async () => {
    const strapi = noI18nStrapi();
    const result = await service({ strapi }).getDropdownValues(fakeCtx({}));

    expect(result.locales).toEqual([]);
    expect(result.defaultLocale).toBe("en");
  });

  it("does not log an error or throw a 500", async () => {
    const strapi = noI18nStrapi();
    const ctx = fakeCtx({});

    await service({ strapi }).getDropdownValues(ctx);

    expect(strapi.log.error).not.toHaveBeenCalled();
    expect(ctx.throw).not.toHaveBeenCalled();
  });
});
