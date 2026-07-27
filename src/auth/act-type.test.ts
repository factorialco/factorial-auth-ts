import { describe, expect, it } from 'vitest'
import { ActType, isActType } from '@/auth/act-type'

describe('isActType', () => {
  it('accepts known act types', () => {
    expect(isActType(ActType.AdminBecome)).toBe(true)
    expect(isActType('staff_become')).toBe(true)
    expect(isActType('delegation')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isActType('become')).toBe(false)
    expect(isActType('')).toBe(false)
  })
})
