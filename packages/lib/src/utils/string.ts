export const isEmptyString = (value: string | undefined | null): boolean => {
  return value == null || value.trim() === '';
};
