import { describe, expect, it } from "vitest";
import qs from "qs";

import { toStringArray } from "./query";

const parseLikeStrapi = (queryString: string) =>
  qs.parse(queryString, { strictNullHandling: true, arrayLimit: 100, depth: 20 });

const buildSortOrderQuery = (columns: string[]) =>
  columns.map((column, index) => `sortOrder[${index + 1}]=${column}`).join("&");

describe("toStringArray", () => {
  it.each([[undefined], [null], [42], [true]])("returns an empty array for %p", (value) => {
    expect(toStringArray(value)).toEqual([]);
  });

  it("wraps a single string", () => {
    expect(toStringArray("title")).toEqual(["title"]);
  });

  it("passes an array through", () => {
    expect(toStringArray(["title", "createdAt"])).toEqual(["title", "createdAt"]);
  });

  it("drops non-string entries", () => {
    expect(toStringArray(["title", 42, null, "createdAt"])).toEqual(["title", "createdAt"]);
  });

  it("flattens an index-keyed object in numeric order", () => {
    expect(toStringArray({ 2: "b", 10: "c", 1: "a" })).toEqual(["a", "b", "c"]);
  });

  describe("against real Strapi query parsing", () => {
    it("handles the shape the admin sends", () => {
      const parsed = parseLikeStrapi(buildSortOrderQuery(["title", "createdAt"]));

      expect(toStringArray(parsed.sortOrder)).toEqual(["title", "createdAt"]);
    });

    it("handles a missing parameter", () => {
      const parsed = parseLikeStrapi("uid=api::article.article");

      expect(toStringArray(parsed.sortOrder)).toEqual([]);
    });

    it("preserves order past the qs arrayLimit of 100", () => {
      const columns = Array.from({ length: 150 }, (_, i) => `col${i + 1}`);
      const parsed = parseLikeStrapi(buildSortOrderQuery(columns));

      expect(Array.isArray(parsed.sortOrder)).toBe(false);
      expect(toStringArray(parsed.sortOrder)).toEqual(columns);
    });
  });
});
