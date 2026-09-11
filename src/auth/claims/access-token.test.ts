import { describe, expect, it } from 'vitest'
import { ActType } from '@/auth/act-type'
import { ActorRef } from '@/auth/actor-ref'
import { parseAccessTokenClaims } from '@/auth/claims/access-token'
import { InvalidToken } from '@/auth/errors'
import { IdentityChain, IdentityChainError } from '@/auth/identity-chain'

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
      amr: [{ type: 'password', auth_time: 1_699_999_940 }],
      acr: 'urn:nist:params:authn:aal:1',
      auth_time: 1_699_999_940,
      client_id: 'one-runtime',
      act: {
        sub: 'actor-1',
        eid: 'actor-employee-1',
        bt: 'admin',
        amr: [{ type: 'eotp', auth_time: 1_699_999_950 }],
        act: { sub: 'staff-1', eid: 'staff-employee-1', bt: 'staff' },
      },
    })

    expect(claims.sub).toBe('user-1')
    expect(claims.jti).toBe('jti-1')
    expect(claims.staff).toBe(true)
    expect(claims.amr).toEqual([{ type: 'password', auth_time: 1_699_999_940 }])
    expect(claims.client_id).toBe('one-runtime')
    expect(claims.act?.sub).toBe('actor-1')
    expect(claims.act?.amr).toEqual([{ type: 'eotp', auth_time: 1_699_999_950 }])
    expect(claims.act?.act?.sub).toBe('staff-1')
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

    it('accepts RFC authentication method strings', () => {
      expect(parseAccessTokenClaims({ ...validPayload(), amr: ['pwd', 'otp'] }).amr).toEqual([
        'pwd',
        'otp',
      ])
    })

    it('rejects unsupported amr entries', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), amr: [42] })).toThrow(InvalidToken)
    })

    it('rejects a non-object act claim', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), act: 'nope' })).toThrow(InvalidToken)
    })

    it('ignores unknown nested actor claims like the gem does', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        act: { sub: 'actor-1', unexpected: 'value' },
      })
      expect(claims.act?.sub).toBe('actor-1')
      expect(claims.act).not.toHaveProperty('unexpected')
    })

    it('rejects empty-string and exponent-notation integer claims', () => {
      expect(() => parseAccessTokenClaims({ ...validPayload(), nbf: '' })).toThrow(InvalidToken)
      expect(() => parseAccessTokenClaims({ ...validPayload(), exp: '1e3' })).toThrow(InvalidToken)
    })
  })

  describe('error messages', () => {
    it('names the failing claim', () => {
      const { sub, ...withoutSub } = validPayload()
      void sub
      expect(() => parseAccessTokenClaims(withoutSub)).toThrow(/sub/)
      expect(() => parseAccessTokenClaims({ ...validPayload(), exp: '1e3' })).toThrow(/exp/)
    })
  })

  describe('required claims', () => {
    it('rejects a missing required claim', () => {
      const { sub, ...withoutSub } = validPayload()
      void sub
      expect(() => parseAccessTokenClaims(withoutSub)).toThrow(InvalidToken)
    })
  })

  describe('authenticated identity', () => {
    it('derives an employee identity chain', () => {
      const claims = parseAccessTokenClaims({ ...validPayload(), eid: 'employee-1' })

      expect(claims.actorRef?.equals(ActorRef.employee('employee-1'))).toBe(true)
      expect(
        claims.identityChain()?.equals(
          new IdentityChain({
            actor: ActorRef.employee('employee-1'),
          })
        )
      ).toBe(true)
    })

    it('derives nested admin and staff become identity', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        eid: 'employee-1',
        act: {
          sub: 'admin-user',
          eid: 'admin-employee',
          bt: 'admin',
          act: {
            sub: 'staff-user',
            eid: 'staff-employee',
            bt: 'staff',
          },
        },
      })

      const chain = claims.identityChain()
      expect(chain?.actType).toBe(ActType.AdminBecome)
      expect(chain?.act?.actor.equals(ActorRef.employee('admin-employee'))).toBe(true)
      expect(chain?.act?.actType).toBe(ActType.StaffBecome)
      expect(chain?.act?.act?.actor.equals(ActorRef.employee('staff-employee'))).toBe(true)
      expect(chain?.isBecome()).toBe(true)
    })

    it('derives delegated and canonical platform system identities', () => {
      const delegated = parseAccessTokenClaims({
        ...validPayload(),
        eid: 'employee-1',
        client_id: 'one-runtime',
        act: { sub: 'f:act:system:one-runtime', client_id: 'one-runtime' },
      }).identityChain()
      const platform = parseAccessTokenClaims({
        ...validPayload(),
        sub: 'f:act:system:one-runtime',
        client_id: 'one-runtime',
      })

      expect(delegated?.actType).toBe(ActType.Delegation)
      expect(delegated?.act?.actor.equals(ActorRef.system('one-runtime'))).toBe(true)
      expect(delegated?.isBecome()).toBe(false)
      expect(platform.actorRef?.equals(ActorRef.system('one-runtime'))).toBe(true)
    })

    it('supports legacy platform subjects that equal the client id', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        sub: 'one-runtime',
        client_id: 'one-runtime',
      })

      expect(claims.actorRef?.equals(ActorRef.system('one-runtime'))).toBe(true)
    })

    it.each([undefined, 'another-runtime'])(
      'rejects a canonical system subject not bound to client_id %s',
      (clientId) => {
        const claims = parseAccessTokenClaims({
          ...validPayload(),
          sub: 'f:act:system:one-runtime',
          client_id: clientId,
        })

        expect(claims.actorRef).toBeNull()
        expect(claims.identityChain()).toBeNull()
      }
    )

    it('derives a canonical company actor subject', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        sub: 'f:act:company:company-1',
      })

      expect(claims.actorRef?.equals(ActorRef.company('company-1'))).toBe(true)
    })

    it('prefers the employee identity when both eid and a matching client_id are present', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        sub: 'one-runtime',
        client_id: 'one-runtime',
        eid: 'employee-1',
      })

      expect(claims.actorRef?.equals(ActorRef.employee('employee-1'))).toBe(true)
    })

    it('falls through an empty eid to the system identity', () => {
      const claims = parseAccessTokenClaims({
        ...validPayload(),
        sub: 'one-runtime',
        client_id: 'one-runtime',
        eid: '',
      })

      expect(claims.actorRef?.equals(ActorRef.system('one-runtime'))).toBe(true)
    })

    it('throws when called with a non-positive max depth', () => {
      const claims = parseAccessTokenClaims({ ...validPayload(), eid: 'employee-1' })

      expect(() => claims.identityChain({ maxDepth: 0 })).toThrow(IdentityChainError)
    })

    it('does not derive a chain for incomplete or user-level identities', () => {
      const incomplete = parseAccessTokenClaims({
        ...validPayload(),
        eid: 'employee-1',
        act: { sub: 'one-runtime' },
      })
      const user = parseAccessTokenClaims(validPayload())

      expect(incomplete.act?.actorRef).toBeNull()
      expect(incomplete.identityChain()).toBeNull()
      expect(user.actorRef).toBeNull()
      expect(user.identityChain()).toBeNull()
    })

    it('rejects unknown become types and excessive depth', () => {
      const unknown = parseAccessTokenClaims({
        ...validPayload(),
        eid: 'employee-1',
        act: { sub: 'actor', eid: 'actor-1', bt: 'unknown' },
      })
      const deep = parseAccessTokenClaims({
        ...validPayload(),
        eid: 'employee-1',
        act: {
          sub: 'actor-1',
          eid: 'actor-1',
          bt: 'admin',
          act: {
            sub: 'actor-2',
            eid: 'actor-2',
            bt: 'staff',
            act: { sub: 'actor-3', eid: 'actor-3', bt: 'admin' },
          },
        },
      })

      expect(() => unknown.identityChain()).toThrow(IdentityChainError)
      expect(() => deep.identityChain()).toThrow('Reached maximum allowed identity chain depth')
    })
  })
})
