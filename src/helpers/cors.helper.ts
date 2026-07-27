export function parseCorsOrigins(value: string): false | true | string[] {
  if (value.trim().length === 0) {
    return false;
  }
  if (value.trim() === '*') {
    return true;
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
