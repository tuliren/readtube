/**
 * Returns true if `value` is nullish (`null` or `undefined`), an empty string,
 * or a string consisting entirely of whitespace.
 */
export function isEmptyString(value: string | null | undefined): value is null | undefined | '' {
  return value == null || value.trim() === '';
}

/** `value` with all whitespace runs collapsed to one space and trimmed, or null when nothing is left. */
export function toOneLine(value: string | null | undefined): string | null {
  if (isEmptyString(value)) {
    return null;
  }
  return value.replace(/\s+/g, ' ').trim();
}
