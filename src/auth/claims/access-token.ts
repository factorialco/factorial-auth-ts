import { z } from 'zod'
import { ActType } from '@/auth/act-type'
import { ActorRef } from '@/auth/actor-ref'
import { ActClaims } from '@/auth/claims/act-claims'
import {
  dropNullValues,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalRecordArray,
  optionalString,
  requiredInteger,
  requiredString,
} from '@/auth/claims/fields'
import { InvalidToken } from '@/auth/errors'
import {
  DEFAULT_IDENTITY_CHAIN_MAX_DEPTH,
  IdentityChain,
  IdentityChainError,
} from '@/auth/identity-chain'

const accessTokenClaimsSchema = z.object({
  iss: requiredString,
  sub: requiredString,
  aud: requiredString,
  iat: requiredInteger,
  exp: requiredInteger,
  jti: requiredString,
  nbf: optionalInteger,
  staff: optionalBoolean,
  cid: optionalString,
  eid: optionalString,
  cell: optionalString,
  scope: optionalString,
  amr: optionalRecordArray,
  acr: optionalString,
  auth_time: optionalInteger,
  client_id: optionalString,
  act: optionalRecord,
})

type ParsedAccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>

/** Strict typed representation of verified Factorial ID access-token claims. */
export class AccessTokenClaims {
  readonly iss: string
  readonly sub: string
  readonly aud: string
  readonly iat: number
  readonly exp: number
  readonly jti: string
  readonly nbf?: number
  readonly staff?: boolean
  readonly cid?: string
  readonly eid?: string
  readonly cell?: string
  readonly scope?: string
  readonly amr?: Record<string, unknown>[]
  readonly acr?: string
  readonly auth_time?: number
  readonly client_id?: string
  readonly act?: ActClaims

  private constructor(parsed: ParsedAccessTokenClaims, act?: ActClaims) {
    this.iss = parsed.iss
    this.sub = parsed.sub
    this.aud = parsed.aud
    this.iat = parsed.iat
    this.exp = parsed.exp
    this.jti = parsed.jti
    this.nbf = parsed.nbf
    this.staff = parsed.staff
    this.cid = parsed.cid
    this.eid = parsed.eid
    this.cell = parsed.cell
    this.scope = parsed.scope
    this.amr = parsed.amr
    this.acr = parsed.acr
    this.auth_time = parsed.auth_time
    this.client_id = parsed.client_id
    this.act = act
    Object.freeze(this)
  }

  static parse(payload: Record<string, unknown>): AccessTokenClaims {
    const result = accessTokenClaimsSchema.safeParse(dropNullValues(payload))
    if (!result.success) {
      throw new InvalidToken(result.error.issues[0].message)
    }

    const act = result.data.act === undefined ? undefined : ActClaims.parse(result.data.act)
    return new AccessTokenClaims(result.data, act)
  }

  get actorRef(): ActorRef | null {
    if (this.eid !== undefined && this.eid.length > 0) {
      return ActorRef.employee(this.eid)
    }
    if (this.client_id !== undefined && this.client_id.length > 0 && this.sub === this.client_id) {
      return ActorRef.system(this.sub)
    }
    return null
  }

  identityChain(options: { maxDepth?: number } = {}): IdentityChain | null {
    const maxDepth = options.maxDepth ?? DEFAULT_IDENTITY_CHAIN_MAX_DEPTH
    if (maxDepth < 1) {
      throw new IdentityChainError('Reached maximum allowed identity chain depth')
    }

    const actor = this.actorRef
    if (actor === null) return null

    const act = this.act?.identityChain({ maxDepth: maxDepth - 1 })
    if (this.act !== undefined && act === null) return null

    return new IdentityChain({
      actor,
      act: act ?? undefined,
      actType: this.act === undefined ? undefined : actTypeFor(this.act.bt),
    })
  }
}

/** Parses a verified JWT payload into typed access-token claims. */
export function parseAccessTokenClaims(payload: Record<string, unknown>): AccessTokenClaims {
  return AccessTokenClaims.parse(payload)
}

function actTypeFor(bt: string | undefined): ActType {
  switch (bt) {
    case 'admin':
      return ActType.AdminBecome
    case 'staff':
      return ActType.StaffBecome
    case undefined:
      return ActType.Delegation
    default:
      throw new IdentityChainError(`Unknown bt value: ${JSON.stringify(bt)}`)
  }
}
