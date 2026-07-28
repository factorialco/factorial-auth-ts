import { z } from 'zod'
import { ConfigurationError } from '@/auth/errors'

/**
 * User-facing configuration for factorial-auth.
 * Optional fields fall back to defaults.
 * */
export interface FactorialAuthConfig {
  /** OIDC discovery URL, e.g. `https://fid.example.com/.well-known/openid-configuration`. */
  oidcDiscoveryUrl: string
  /** Expected `aud` claim. */
  audience: string
  /** Allowed JWS algorithms. Defaults to `["ES256"]`. */
  algorithms?: string[]
  /** Clock skew tolerance, in seconds, for `exp`/`nbf`. Defaults to `30`. */
  clockLeewaySeconds?: number
  /**
   * Overall timeout for each HTTP request (discovery, JWKS, and token
   * endpoint), in milliseconds. Defaults to `5000`.
   */
  httpTimeoutMs?: number
  /** Whether to verify the `nbf` claim. Defaults to `true`. */
  requireNbf?: boolean
  /** OAuth client identifier used by the token client. */
  clientId?: string
  /** OAuth client secret used by the token client. */
  clientSecret?: string
}

const configSchema = z.object({
  oidcDiscoveryUrl: z.string().min(1, 'oidcDiscoveryUrl is required'),
  audience: z.string().min(1, 'audience is required'),
  algorithms: z
    .array(z.string())
    .min(1, 'algorithms must contain at least one value')
    .default(['ES256']),
  clockLeewaySeconds: z
    .number()
    .int('clockLeewaySeconds must be an integer')
    .nonnegative('clockLeewaySeconds cannot be negative')
    .default(30),
  httpTimeoutMs: z
    .number()
    .int('httpTimeoutMs must be an integer')
    .positive('httpTimeoutMs must be greater than zero')
    .default(5000),
  requireNbf: z.boolean().default(true),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
}) satisfies z.ZodType<FactorialAuthConfig>

export type FactorialAuthValidatedConfig = z.infer<typeof configSchema> & FactorialAuthConfig

/**
 * Validates the config and applies defaults, returning the resolved config.
 * Throws {@link ConfigurationError} when a required field is missing or empty
 * (mirrors the gem's `Configuration#validate!`).
 */
export function validateConfig(config: FactorialAuthConfig): FactorialAuthValidatedConfig {
  const result = configSchema.safeParse(config)

  if (!result.success) {
    throw new ConfigurationError(result.error.issues[0].message)
  }

  return result.data
}
