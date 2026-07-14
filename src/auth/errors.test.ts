import { describe, expect, it } from 'vitest'
import {
  AuthError,
  ConfigurationError,
  ExpiredToken,
  ImmatureToken,
  InvalidAudience,
  InvalidIssuer,
  InvalidToken,
  JwksFetchError,
  JwksParseError,
  OidcDiscoveryFetchError,
  OidcDiscoveryParseError,
  TokenError,
} from '@/auth/errors'

describe('errors', () => {
  it.each([
    { ErrorClass: ConfigurationError, name: 'ConfigurationError' },
    { ErrorClass: OidcDiscoveryFetchError, name: 'OidcDiscoveryFetchError' },
    { ErrorClass: OidcDiscoveryParseError, name: 'OidcDiscoveryParseError' },
    { ErrorClass: JwksFetchError, name: 'JwksFetchError' },
    { ErrorClass: JwksParseError, name: 'JwksParseError' },
    { ErrorClass: InvalidToken, name: 'InvalidToken' },
    { ErrorClass: ExpiredToken, name: 'ExpiredToken' },
    { ErrorClass: InvalidIssuer, name: 'InvalidIssuer' },
    { ErrorClass: InvalidAudience, name: 'InvalidAudience' },
    { ErrorClass: ImmatureToken, name: 'ImmatureToken' },
  ])('$name reports its class name', ({ ErrorClass, name }) => {
    expect(new ErrorClass('boom').name).toBe(name)
  })

  it('any error is catchable as the AuthError base (try* contract)', () => {
    expect(() => {
      throw new InvalidToken('bad')
    }).toThrow(AuthError)
  })

  it('token errors are catchable as the TokenError base', () => {
    expect(() => {
      throw new ExpiredToken('expired')
    }).toThrow(TokenError)
  })
})
