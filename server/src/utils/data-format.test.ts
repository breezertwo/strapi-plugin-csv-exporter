import { describe, expect, it } from "vitest";
import type { UID } from "@strapi/strapi";

import { restructureData } from "./data-format";

const uid = "api::article.article" as UID.ContentType;

describe("restructureData", () => {
  const data = [{ title: "Hello", secret: "shhh" }];

  it('does not throw when "ignore" is omitted', async () => {
    await expect(restructureData(data, { columns: ["title"] }, uid, {})).resolves.toEqual([
      { title: "Hello" },
    ]);
  });

  it('drops ignored columns when "ignore" is provided', async () => {
    const result = await restructureData(data, { columns: ["title", "secret"] }, uid, {
      ignore: ["secret"],
    });

    expect(result).toEqual([{ title: "Hello" }]);
  });

  it("keeps columns that are not ignored", async () => {
    const result = await restructureData(data, { columns: ["title", "secret"] }, uid, {
      ignore: [],
    });

    expect(result).toEqual([{ title: "Hello", secret: "shhh" }]);
  });
});
