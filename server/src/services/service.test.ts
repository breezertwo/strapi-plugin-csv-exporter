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
