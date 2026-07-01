import { ActType, isActType } from "./act-type";
import { ActorRef, ActorRefError } from "./actor-ref";
import { isPresent, isRecord, isString } from "@/shared/utils";

const DEFAULT_MAX_DEPTH = 3;

export class IdentityChainError extends Error {
  name = "IdentityChainError";
}

export type SerializedIdentityChain = {
  actor: string;
  act?: SerializedIdentityChain;
  act_type?: ActType;
};

interface IdentityChainOptions {
  actor: ActorRef;
  act?: IdentityChain;
  actType?: ActType;
}

/**
 * Recursive authentication identity chain.
 *
 * The root actor is the effective authenticated actor for the current action.
 * When the action is performed through a become/act flow, `act` points to the
 * actor that is acting through the current node. Deserialization is capped to
 * keep parsing conservative while still covering today's supported staff ->
 * admin -> employee flow.
 */
export class IdentityChain {
  readonly actor: ActorRef;
  readonly act?: IdentityChain;
  readonly actType?: ActType;

  constructor({ actor, act, actType }: IdentityChainOptions) {
    this.actor = actor;
    this.act = act;
    this.actType = actType;

    if (this.act === undefined && this.actType !== undefined) {
      throw new IdentityChainError("Identity chain act_type requires act");
    }

    if (this.act !== undefined && this.actType === undefined) {
      throw new IdentityChainError("Identity chain act requires act_type");
    }

    Object.freeze(this);
  }

  /** Builds an identity chain from value objects, enforcing the act/actType invariant. */
  static create(options: IdentityChainOptions): IdentityChain {
    return new IdentityChain(options);
  }

  /** Parses a recursively serialized identity chain, capped at `maxDepth` nodes. */
  static parse(
    serialized: Record<string, unknown>,
    options: { maxDepth?: number } = {},
  ): IdentityChain {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

    if (maxDepth < 1) {
      throw new RangeError("Identity chain max depth must be positive");
    }

    return parseNode(serialized, maxDepth, 1);
  }

  /** Serializes to the recursive wire form (omitting absent `act`/`act_type`). */
  toObject(): SerializedIdentityChain {
    const result: SerializedIdentityChain = {
      actor: this.actor.toString(),
    };

    if (this.act !== undefined) {
      result.act = this.act.toObject();
    }

    if (this.actType !== undefined) {
      result.act_type = this.actType;
    }

    return result;
  }

  equals(other: IdentityChain): boolean {
    if (!this.actor.equals(other.actor) || this.actType !== other.actType) {
      return false;
    }

    if (this.act === undefined || other.act === undefined) {
      return this.act === other.act;
    }

    return this.act.equals(other.act);
  }
}

function parseNode(node: Record<string, unknown>, maxDepth: number, depth: number): IdentityChain {
  if (depth > maxDepth) {
    throw new IdentityChainError(`Identity chain cannot be deeper than ${maxDepth} actors`);
  }

  const actorValue = node["actor"];

  if (!isString(actorValue)) {
    throw new IdentityChainError("Invalid identity chain");
  }

  let act: IdentityChain | undefined;
  const actValue = node["act"];

  if (isPresent(actValue)) {
    if (!isRecord(actValue)) {
      throw new IdentityChainError("Invalid identity chain");
    }

    act = parseNode(actValue, maxDepth, depth + 1);
  }

  let actType: ActType | undefined;
  const actTypeValue = node["act_type"];

  if (isPresent(actTypeValue)) {
    if (!isString(actTypeValue)) {
      throw new IdentityChainError("Invalid identity chain");
    }

    if (!isActType(actTypeValue)) {
      throw new IdentityChainError(`Invalid act type: ${JSON.stringify(actTypeValue)}`);
    }

    actType = actTypeValue;
  }

  try {
    return new IdentityChain({ actor: ActorRef.parse(actorValue), act, actType });
  } catch (error) {
    if (error instanceof ActorRefError) {
      throw new IdentityChainError(error.message);
    }
    throw error;
  }
}
