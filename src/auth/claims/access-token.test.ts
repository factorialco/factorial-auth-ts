import { describe, expect, it } from 'vitest'
import { parseAccessTokenClaims } from '@/auth/claims/access-token'
import { InvalidToken } from '@/auth/errors'

const validPayload = () => ({
  iss: 'https://factorial-id.example.com',
  sub: 'user-1',
  aud: 'factorial',
  iat: 1_700_000_000,
  exp: 1_700_003_600,
  jti: 'jti-1',
})

describe('parseAccessTokenClaims', () => {
  it('parses a full payload', () => {
    const claims = parseAccessTokenClaims({
      ...validPayload(),
      nbf: 1_700_000_000,
      staff: true,
      cid: 'company-1',
      eid: 'employee-1',
      cell: 'cell-1',
      scope: 'openid profile',
      amr: ['pwd'],
      acr: 'urn:nist:params:authn:aal:1',
      auth_time: 1_699_999_940,
      client_id: 'one-runtime',
      act: { sub: 'actor-1', act: { sub: 'staff-1' } },
    })

    expect(claims.sub).toBe('user-1')
    expect(claims.jti).toBe('jti-1')
    expect(claims.staff).toBe(true)
    expect(claims.client_id).toBe('one-runtime')
    expect(claims.amr).toEqual(['pwd'])
    expect(claims.act).toEqual({ sub: 'actor-1', act: { sub: 'staff-1' } })
  })

  it('leaves optional claims undefined when absent', () => {
    const claims = parseAccessTokenClaims(validPayload())
    expect(claims.nbf).toBeUndefined()
    expect(claims.cid).toBeUndefined()
    expect(claims.act).toBeUndefined()
  })

  it('ignores unknown claims', () => {
    const claims = parseAccessTokenClaims({ ...validPayload(), unknown_claim: 'x' })
    expect(claims).not.toHaveProperty('unknown_claim')
    expect(claims.sub).toBe('user-1')
  })

  it('treats null optional claims as absent', () => {
    const claims = parseAccessTokenClaims({ ...validPayload(), cid: null, act: null })
    expect(claims.cid).toBeUndefined()
    expect(claims.act).toBeUndefined()
  })

  it('is frozen', () => {
    const claims = parseAccessTokenClaims(validPayload())
    expect(Object.isFrozen(claims)).toBe(true)
  })

  describe('lenient coercion', () => {
    it('coerces a numeric string field to a string', () => {
      expect(parseAccessTokenClaims({ ...validPayload(), cid: 42 }).cid).toBe('42')
    })

    it('coerces a numeric-string integer to a number', () => {
      expect(parseAccessTokenClaims({ ...validPayload(), iat: '1700000000' }).iat).toBe(
        1_700_000_000
      )
    })

    it('rejects a non-integer numeric claim', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), exp: 12.5 })).toThrow(InvalidToken)
    })

    it('rejects a non-boolean staff claim', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), staff: 'true' })).toThrow(
        InvalidToken
      )
    })

    it('rejects a non-array amr claim', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), amr: 'pwd' })).toThrow(InvalidToken)
    })

    it('rejects a non-object act claim', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), act: 'nope' })).toThrow(InvalidToken)
    })
  })

  describe('required claims', () => {
    it('rejects a missing required claim', () => {
      const { sub, ...withoutSub } = validPayload()
      void sub
      expect(() => parseAccessTokenClaims(withoutSub)).toThrow(InvalidToken)
    })
  })
})
