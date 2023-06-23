/**
 * Filters out null elements from an array.
 * @param list List of elements that might be null.
 * @returns List of elements with nulls removed.
 */
export function pruneNull<T>(list: (T | null)[]): T[] {
  return list.filter((i) => i !== null) as T[];
}
