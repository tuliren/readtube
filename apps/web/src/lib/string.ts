/**
 * Returns true if `value` is nullish (`null` or `undefined`), an empty string,
 * or a string consisting entirely of whitespace.
 */
export function isEmptyString(value: string | null | undefined): value is null | undefined | '' {
  return value == null || value.trim() === '';
}
