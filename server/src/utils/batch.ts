export const DEFAULT_BATCH_SIZE = 500;
export const MAX_PAGE_SIZE = 500;

export const clampPageSize = (limit: number): number =>
  Math.min(Math.max(1, Math.trunc(limit) || 1), MAX_PAGE_SIZE);

/**
 * Walks a collection page by page so an export never holds more than one batch in memory.
 * Stops on a short page, so a growing collection cannot turn this into an endless loop.
 */
export async function* batched<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  options: { batchSize?: number; maxRows?: number } = {}
): AsyncGenerator<T[]> {
  const batchSize = clampPageSize(options.batchSize ?? DEFAULT_BATCH_SIZE);
  const { maxRows } = options;

  let offset = 0;
  let emitted = 0;

  while (true) {
    const remaining = maxRows === undefined ? Infinity : maxRows - emitted;

    if (remaining <= 0) {
      return;
    }

    const limit = Math.min(batchSize, remaining);
    const page = await fetchPage(limit, offset);

    if (!page?.length) {
      return;
    }

    yield page;

    emitted += page.length;
    offset += page.length;

    if (page.length < limit) {
      return;
    }
  }
}
