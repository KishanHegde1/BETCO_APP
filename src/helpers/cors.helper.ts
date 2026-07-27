export function parseCorsOrigins(value: string): true | string[] {
  if (value.trim() === '*') {
    return true;
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
