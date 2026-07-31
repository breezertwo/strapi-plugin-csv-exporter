import { describe, expect, it, vi } from 'vitest';

import { MAX_PAGE_SIZE, batched, clampPageSize } from './batch';

const collection = (size: number) => Array.from({ length: size }, (_, i) => i);

const pager = (rows: number[]) => {
  const calls: { limit: number; offset: number }[] = [];
  const fetchPage = vi.fn(async (limit: number, offset: number) => {
    calls.push({ limit, offset });
    return rows.slice(offset, offset + limit);
  });

  return { fetchPage, calls };
};

const drain = async (rows: number[], options = {}) => {
  const { fetchPage, calls } = pager(rows);
  const seen: number[] = [];

  for await (const page of batched(fetchPage, options)) {
    seen.push(...page);
  }

  return { seen, calls };
};

describe('clampPageSize', () => {
  it.each([
    [10, 10],
    [0, 1],
    [-5, 1],
    [MAX_PAGE_SIZE + 1000, MAX_PAGE_SIZE],
    [Number.NaN, 1],
  ])('clamps %p to %p', (input, expected) => {
    expect(clampPageSize(input)).toBe(expected);
  });
});

describe('batched', () => {
  it('walks the whole collection in order', async () => {
    const { seen } = await drain(collection(12), { batchSize: 5 });

    expect(seen).toEqual(collection(12));
  });

  it('advances the offset by the batch size', async () => {
    const { calls } = await drain(collection(12), { batchSize: 5 });

    expect(calls).toEqual([
      { limit: 5, offset: 0 },
      { limit: 5, offset: 5 },
      { limit: 5, offset: 10 },
    ]);
  });

  it('stops on a short page rather than fetching again', async () => {
    const { calls } = await drain(collection(8), { batchSize: 5 });

    expect(calls).toHaveLength(2);
  });

  it('handles an empty collection with a single fetch', async () => {
    const { seen, calls } = await drain([], { batchSize: 5 });

    expect(seen).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('stops at maxRows', async () => {
    const { seen } = await drain(collection(100), { batchSize: 10, maxRows: 25 });

    expect(seen).toEqual(collection(25));
  });

  it('never fetches more than maxRows needs', async () => {
    const { calls } = await drain(collection(100), { batchSize: 10, maxRows: 25 });

    expect(calls[calls.length - 1]).toEqual({ limit: 5, offset: 20 });
  });

  it('is unbounded when maxRows is not set', async () => {
    const { seen } = await drain(collection(30), { batchSize: 10 });

    expect(seen).toHaveLength(30);
  });
});
