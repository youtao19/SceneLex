export function toJson<T>(value: T) {
  return JSON.stringify(value, null, 2);
}

