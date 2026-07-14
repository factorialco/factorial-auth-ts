import { describe, expect, it } from 'vitest'
import { ActorType, isActorType } from '@/auth/actor-type'

describe('isActorType', () => {
  it('accepts known actor types', () => {
    expect(isActorType(ActorType.Employee)).toBe(true)
    expect(isActorType('api_integration')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isActorType('unknown')).toBe(false)
    expect(isActorType('')).toBe(false)
  })
})
