export const validateFilter = (
  filters: Record<string, any>,
  attributes: Record<string, any>
): Record<string, any> => {
  if (!filters || typeof filters !== 'object') {
    return {};
  }

  return Object.keys(filters).reduce((acc, key) => {
    // Always keep special operators
    if (key.startsWith('$')) {
      if (Array.isArray(filters[key])) {
        acc[key] = filters[key].map((item) => validateFilter(item, attributes));
      } else {
        acc[key] = validateFilter(filters[key], attributes);
      }
      return acc;
    }

    // If the field exists in attributes, keep its entire filter structure
    if (attributes[key]) {
      acc[key] = filters[key];
    }

    return acc;
  }, {});
};
