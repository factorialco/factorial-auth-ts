/** Narrows an unknown value to `string`. */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** Narrows out `null` and `undefined`. */
export function isPresent<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null
}

/** Narrows to a plain object (excludes `null`, arrays, and non-objects). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
