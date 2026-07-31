export const toStringArray = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  // qs falls back to an index-keyed object once the array grows past `arrayLimit`.
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, entry]) => entry)
      .filter((entry): entry is string => typeof entry === 'string');
  }

  return [];
};
