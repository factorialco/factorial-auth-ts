import { z } from 'zod'

/**
 * Coerce a present scalar to a string. Matches ruby `.to_s`
 */
const stringValue = z.union([z.string(), z.number(), z.boolean()]).transform(String)

/**
 * Coerce a number or a numeric string into a number. Matches Ruby `Ingeger()`
 */
const integerValue = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const parsed = Number(value)

  if (!Number.isInteger(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'must be an integer' })
    return z.NEVER
  }

  return parsed
})

export const requiredString = stringValue
export const optionalString = stringValue.optional()
export const requiredInteger = integerValue
export const optionalInteger = integerValue.optional()
export const optionalBoolean = z.boolean().optional()
export const optionalAuthenticationMethods = z
  .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
  .optional()
export const optionalRecord = z.record(z.string(), z.unknown()).optional()

/**
 * Drops null-valued keys so they are treated as absent — mirroring the gem,
 * where a `nil` claim is equivalent to a missing one for optional fields.
 */
export function dropNullValues(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null))
}
