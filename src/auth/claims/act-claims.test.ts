import { describe, expect, it } from 'vitest'
import { ActType } from '@/auth/act-type'
import { ActorRef } from '@/auth/actor-ref'
import { ActClaims, actTypeFromBt } from '@/auth/claims/act-claims'
import { InvalidToken } from '@/auth/errors'
import { IdentityChainError } from '@/auth/identity-chain'

describe('ActClaims', () => {
  it('parses nested act claims and treats null optional values as absent', () => {
    const claims = ActClaims.parse({
      sub: 'admin-user',
      eid: null,
      cid: 'company-1',
      act: { sub: 'staff-user', eid: 'staff-1', bt: 'staff' },
    })

    expect(claims.sub).toBe('admin-user')
    expect(claims.eid).toBeUndefined()
    expect(claims.cid).toBe('company-1')
    expect(claims.act?.eid).toBe('staff-1')
    expect(Object.isFrozen(claims)).toBe(true)
  })

  it('ignores unknown claims at any depth like the gem does', () => {
    const claims = ActClaims.parse({
      sub: 'actor-1',
      unexpected: 'value',
      act: { sub: 'actor-2', also_unexpected: true },
    })

    expect(claims).not.toHaveProperty('unexpected')
    expect(claims.act).not.toHaveProperty('also_unexpected')
  })

  it('requires a sub and names the failing claim', () => {
    expect(() => ActClaims.parse({ eid: 'actor-1' })).toThrow(InvalidToken)
    expect(() => ActClaims.parse({ eid: 'actor-1' })).toThrow(/sub/)
  })

  it('accepts mixed string and structured amr entries', () => {
    const claims = ActClaims.parse({ sub: 'actor-1', amr: ['pwd', { type: 'eotp' }] })
    expect(claims.amr).toEqual(['pwd', { type: 'eotp' }])
  })

  it('derives employee and system actors with employee precedence', () => {
    expect(
      ActClaims.parse({ sub: 'runtime', client_id: 'runtime', eid: 'employee-1' }).actorRef?.equals(
        ActorRef.employee('employee-1')
      )
    ).toBe(true)
    expect(
      ActClaims.parse({ sub: 'runtime', client_id: 'runtime' }).actorRef?.equals(
        ActorRef.system('runtime')
      )
    ).toBe(true)
    expect(ActClaims.parse({ sub: 'user-1' }).actorRef).toBeNull()
  })

  it('maps bt values to act types', () => {
    expect(actTypeFromBt('admin')).toBe(ActType.AdminBecome)
    expect(actTypeFromBt('staff')).toBe(ActType.StaffBecome)
    expect(actTypeFromBt(undefined)).toBe(ActType.Delegation)
    expect(() => actTypeFromBt('other')).toThrow(IdentityChainError)
    expect(() => actTypeFromBt('other')).toThrow('Unknown bt value: "other"')
  })

  it('builds a staff-become chain from the top level', () => {
    const claims = ActClaims.parse({
      sub: 'staff-user',
      eid: 'employee-1',
      act: { sub: 'staff-2', eid: 'staff-2', bt: 'staff' },
    })

    expect(claims.identityChain()?.actType).toBe(ActType.StaffBecome)
  })
})
