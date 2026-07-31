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

describe("date formatting fallbacks", () => {
  const iso = [{ when: "2024-01-15T23:30:00.000Z" }];

  it("falls back to UTC, matching the documented default", async () => {
    const result = await restructureData(iso, { columns: ["when"] }, uid, {});

    expect(result[0].when).toBe("15.01.2024 23:30");
  });

  it("honours an explicit timezone", async () => {
    const result = await restructureData(iso, { columns: ["when"] }, uid, {
      timeZone: "Europe/Berlin",
    });

    expect(result[0].when).toBe("16.01.2024 00:30");
  });
});
