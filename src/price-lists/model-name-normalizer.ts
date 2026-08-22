/**
 * The canonical model key used for every Price List comparison. This is exact
 * after whitespace and case normalization; it deliberately never fuzzy-matches.
 */
export const normalizeModelName = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toUpperCase();
