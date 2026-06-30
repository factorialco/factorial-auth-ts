/** Base class for every error raised by factorial-auth. */
export class AuthError extends Error {
  name = "AuthError";
}

/** Mandatory configuration values are missing or invalid. */
export class ConfigurationError extends AuthError {
  name = "ConfigurationError";
}

/** OIDC discovery could not be downloaded from the configured endpoint. */
export class OidcDiscoveryFetchError extends AuthError {
  name = "OidcDiscoveryFetchError";
}

/** Downloaded OIDC discovery content is malformed or unusable. */
export class OidcDiscoveryParseError extends AuthError {
  name = "OidcDiscoveryParseError";
}

/** JWKS could not be downloaded from the configured endpoint. */
export class JwksFetchError extends AuthError {
  name = "JwksFetchError";
}

/** Downloaded JWKS content is malformed or unusable. */
export class JwksParseError extends AuthError {
  name = "JwksParseError";
}

/** Base class for token verification and decoding failures. */
export class TokenError extends AuthError {
  name = "TokenError";
}

/** Invalid JWT structure/signature or claim type/shape violation. */
export class InvalidToken extends TokenError {
  name = "InvalidToken";
}

/** Token expiration validation failed. */
export class ExpiredToken extends TokenError {
  name = "ExpiredToken";
}

/** The token `iss` claim does not match configuration. */
export class InvalidIssuer extends TokenError {
  name = "InvalidIssuer";
}

/** The token `aud` claim does not match configuration. */
export class InvalidAudience extends TokenError {
  name = "InvalidAudience";
}

/** The token was used before its `nbf` (not-before) time. */
export class ImmatureToken extends TokenError {
  name = "ImmatureToken";
}
