export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeZero(value) {
  if (value === 0) {
    return 0;
  }
  return value;
}
