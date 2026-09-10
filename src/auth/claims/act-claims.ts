import { z } from 'zod'
import { ActType } from '@/auth/act-type'
import { ActorRef } from '@/auth/actor-ref'
import {
  dropNullValues,
  firstIssueMessage,
  optionalAuthenticationMethods,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
} from '@/auth/claims/fields'
import { InvalidToken } from '@/auth/errors'
import {
  DEFAULT_IDENTITY_CHAIN_MAX_DEPTH,
  IdentityChain,
  IdentityChainError,
} from '@/auth/identity-chain'

// Not .strict(): unknown claims are ignored like the Ruby gem does, so factorial-id
// can add act sub-claims without breaking older consumers.
const actClaimsSchema = z.object({
  sub: requiredString,
  eid: optionalString,
  cid: optionalString,
  cell: optionalString,
  client_id: optionalString,
  staff: optionalBoolean,
  bt: optionalString,
  amr: optionalAuthenticationMethods,
  act: optionalRecord,
})

type ParsedActClaims = z.infer<typeof actClaimsSchema>

/** Typed representation of a nested OAuth `act` claim. */
export class ActClaims {
  readonly sub: string
  readonly eid?: string
  readonly cid?: string
  readonly cell?: string
  readonly client_id?: string
  readonly staff?: boolean
  readonly bt?: string
  readonly amr?: Array<string | Record<string, unknown>>
  readonly act?: ActClaims

  private constructor(parsed: ParsedActClaims, act?: ActClaims) {
    this.sub = parsed.sub
    this.eid = parsed.eid
    this.cid = parsed.cid
    this.cell = parsed.cell
    this.client_id = parsed.client_id
    this.staff = parsed.staff
    this.bt = parsed.bt
    this.amr = parsed.amr
    this.act = act
    Object.freeze(this)
  }

  /** Parses an `act` object from an already-verified JWT payload; performs no signature checks. */
  static parse(payload: Record<string, unknown>): ActClaims {
    const result = actClaimsSchema.safeParse(dropNullValues(payload))
    if (!result.success) {
      throw new InvalidToken(firstIssueMessage(result.error))
    }

    const nested = result.data.act === undefined ? undefined : ActClaims.parse(result.data.act)
    return new ActClaims(result.data, nested)
  }

  get actorRef(): ActorRef | null {
    if (this.eid !== undefined && this.eid.length > 0) {
      return ActorRef.employee(this.eid)
    }

    const serializedActorRef = ActorRef.tryParse(this.sub)
    if (serializedActorRef !== null) {
      if (serializedActorRef.isSystem() && serializedActorRef.id !== this.client_id) {
        return null
      }

      return serializedActorRef
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
      actType: this.act === undefined ? undefined : actTypeFromBt(this.act.bt),
    })
  }
}

/** Maps the `bt` claim to the relationship between a node's actor and its `act` actor. */
export function actTypeFromBt(bt: string | undefined): ActType {
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
