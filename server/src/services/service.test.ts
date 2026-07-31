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
      plugin: () => undefined,
    }) as unknown as Core.Strapi;

  it("still lists the configured content types", async () => {
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

describe("locale handling", () => {
  const localizedUid = uid;
  const plainUid = "api::setting.setting";

  const spyStrapi = () => {
    const calls: { findMany: any[]; count: any[] } = { findMany: [], count: [] };

    const strapi = {
      config: {
        get: () => ({
          config: {
            [localizedUid]: { columns: ["title"] },
            [plainUid]: { columns: ["title"] },
          },
        }),
      },
      contentTypes: {
        [localizedUid]: { kind: "collectionType", attributes: { title: { type: "string" } } },
        [plainUid]: { kind: "collectionType", attributes: { title: { type: "string" } } },
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
      documents: () => ({
        findMany: async (params: any) => {
          calls.findMany.push(params);
          return [];
        },
        count: async (params: any) => {
          calls.count.push(params);
          return 0;
        },
      }),
      plugin: () => ({
        service: () => ({
          find: async () => [
            { name: "English (en)", code: "en" },
            { name: "German (de)", code: "de" },
          ],
          getDefaultLocale: async () => "en",
          setIsDefault: async (input: any[]) => input,
        }),
      }),
    } as unknown as Core.Strapi;

    return { strapi, calls };
  };

  it.each([
    ["getTableData", "getTableData" as const],
    ["downloadCSV", "downloadCSV" as const],
  ])("%s passes locale as a param, not a filter", async (_label, method) => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi })[method](
      fakeCtx({ uid: plainUid, locale: "de", sortOrder: ["title"] }),
    );

    expect(calls.findMany[0].locale).toBe("de");
    expect(calls.findMany[0].filters).not.toHaveProperty("locale");
  });

  it("keeps the configured filters alongside the locale param", async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: localizedUid, locale: "de" }));

    expect(calls.findMany[0]).toMatchObject({ locale: "de" });
    expect(calls.findMany[0].filters).toEqual({});
  });

  it("counts with the same locale", async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: plainUid, locale: "de" }));

    expect(calls.count[0]).toEqual({ locale: "de" });
  });

  it("falls back to the default locale when none is requested", async () => {
    const { strapi, calls } = spyStrapi();

    await service({ strapi }).getTableData(fakeCtx({ uid: plainUid }));

    expect(calls.findMany[0].locale).toBe("en");
  });
});
