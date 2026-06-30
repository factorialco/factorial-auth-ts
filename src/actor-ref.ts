import { z } from "zod";
import { ActorType, isActorType } from "./actor-type";

/** Thrown when an actor ref string or id is malformed. */
export class ActorRefError extends Error {
  name = "ActorRefError";
}

const MAX_ID_LENGTH = 255;
const ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

const idSchema = z
  .string()
  .trim()
  .min(1, "Actor ref id must be present")
  .max(MAX_ID_LENGTH, `Actor ref id cannot be longer than ${MAX_ID_LENGTH} characters`)
  .regex(ID_FORMAT, "Invalid actor ref id");

/**
 * Immutable reference to one concrete authenticated actor.
 *
 * An `ActorRef` is a reference, not the actor itself: it never loads records,
 * carries permissions, or encodes tenant scope. Serializes to `f:act:<type>:<id>`.
 */
export class ActorRef {
  readonly type: ActorType;
  readonly id: string;

  constructor(type: ActorType, id: string) {
    this.type = type;
    this.id = normalizeId(id);
    Object.freeze(this);
  }

  static employee(id: string): ActorRef {
    return new ActorRef(ActorType.Employee, id);
  }

  static bookkeeper(id: string): ActorRef {
    return new ActorRef(ActorType.Bookkeeper, id);
  }

  static company(id: string): ActorRef {
    return new ActorRef(ActorType.Company, id);
  }

  static system(id = "global"): ActorRef {
    return new ActorRef(ActorType.System, id);
  }

  static apiIntegration(id: string): ActorRef {
    return new ActorRef(ActorType.ApiIntegration, id);
  }

  /** Parses the canonical `f:act:<type>:<id>` string, validating the type and id. */
  static parse(serialized: string): ActorRef {
    const parts = splitRef(serialized);

    if (parts === null || parts[0] !== "f" || parts[1] !== "act") {
      throw new ActorRefError(`Invalid actor ref prefix: ${JSON.stringify(serialized)}`);
    }

    const [, , rawType, id] = parts;

    if (!isActorType(rawType)) {
      throw new ActorRefError(`Invalid actor ref type: ${JSON.stringify(rawType)}`);
    }

    return new ActorRef(rawType, id);
  }

  /** Parses optional metadata, returning `null` instead of throwing on malformed input. */
  static tryParse(serialized: string | null | undefined): ActorRef | null {
    if (serialized === null || serialized === undefined || serialized.length === 0) {
      return null;
    }

    try {
      return ActorRef.parse(serialized);
    } catch (error) {
      if (error instanceof ActorRefError) {
        return null;
      }

      throw error;
    }
  }

  toString(): string {
    return `f:act:${this.type}:${this.id}`;
  }

  isEmployee(): boolean {
    return this.type === ActorType.Employee;
  }

  isPartner(): boolean {
    return this.type === ActorType.Partner;
  }

  isBookkeeper(): boolean {
    return this.type === ActorType.Bookkeeper;
  }

  isCompany(): boolean {
    return this.type === ActorType.Company;
  }

  isSystem(): boolean {
    return this.type === ActorType.System;
  }

  isApiIntegration(): boolean {
    return this.type === ActorType.ApiIntegration;
  }

  equals(other: ActorRef): boolean {
    return other instanceof ActorRef && this.type === other.type && this.id === other.id;
  }
}

function normalizeId(id: string): string {
  const result = idSchema.safeParse(id);

  if (!result.success) {
    throw new ActorRefError(result.error.issues[0].message);
  }

  return result.data;
}

/** Splits into the first three colon-delimited segments plus the remainder (which keeps any colons). */
function splitRef(serialized: string): [string, string, string, string] | null {
  const [scheme, kind, type, ...rest] = serialized.split(":");

  if (rest.length === 0) {
    return null;
  }

  return [scheme, kind, type, rest.join(":")];
}
