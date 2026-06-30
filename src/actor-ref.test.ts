import { describe, expect, it, vi } from "vitest";
import { ActorRef, ActorRefError } from "@/actor-ref";
import { ActorType } from "@/actor-type";

describe("ActorRef", () => {
  describe("parse", () => {
    it("round-trips a known actor ref", () => {
      const actor = ActorRef.parse("f:act:employee:123");

      expect(actor.type).toBe(ActorType.Employee);
      expect(actor.id).toBe("123");
      expect(actor.toString()).toBe("f:act:employee:123");
    });

    it("allows system refs with namespaced slugs (id may contain colons)", () => {
      const actor = ActorRef.parse("f:act:system:Jobs::Backfill");

      expect(actor.type).toBe(ActorType.System);
      expect(actor.id).toBe("Jobs::Backfill");
    });

    it("rejects malformed prefixes", () => {
      expect(() => ActorRef.parse("f:actor:employee:123")).toThrow(ActorRefError);
    });

    it("rejects unknown actor types", () => {
      expect(() => ActorRef.parse("f:act:unknown:123")).toThrow(ActorRefError);
    });

    it("rejects blank ids with the gem's message", () => {
      expect(() => ActorRef.parse("f:act:employee:")).toThrow("Actor ref id must be present");
    });

    it("trims leading and trailing spaces from the id", () => {
      expect(ActorRef.parse("f:act:employee: 123").id).toBe("123");
    });

    it("rejects ids that look like email addresses", () => {
      expect(() => ActorRef.parse("f:act:employee:user@example.com")).toThrow(ActorRefError);
    });

    it("rejects ids longer than 255 characters", () => {
      expect(() => ActorRef.employee("a".repeat(256))).toThrow(
        "Actor ref id cannot be longer than 255 characters",
      );
    });
  });

  describe("tryParse", () => {
    it("returns null for malformed values", () => {
      expect(ActorRef.tryParse("not-an-actor-ref")).toBeNull();
    });

    it("returns null for empty or missing input", () => {
      expect(ActorRef.tryParse("")).toBeNull();
      expect(ActorRef.tryParse(null)).toBeNull();
      expect(ActorRef.tryParse(undefined)).toBeNull();
    });

    it("returns the actor ref for valid input", () => {
      expect(ActorRef.tryParse("f:act:employee:123")?.id).toBe("123");
    });

    it("re-throws errors that are not ActorRefError", () => {
      const spy = vi.spyOn(ActorRef, "parse").mockImplementation(() => {
        throw new Error("unexpected");
      });

      expect(() => ActorRef.tryParse("f:act:employee:1")).toThrow("unexpected");

      spy.mockRestore();
    });
  });

  describe("factories", () => {
    it("builds each actor type with the right serialization", () => {
      expect(ActorRef.employee("1").toString()).toBe("f:act:employee:1");
      expect(ActorRef.bookkeeper("2").toString()).toBe("f:act:bookkeeper:2");
      expect(ActorRef.company("42").toString()).toBe("f:act:company:42");
      expect(ActorRef.apiIntegration("svc").toString()).toBe("f:act:api_integration:svc");
    });

    it("defaults the system id to 'global'", () => {
      expect(ActorRef.system().toString()).toBe("f:act:system:global");
      expect(ActorRef.system("audit-log").id).toBe("audit-log");
    });
  });

  describe("type predicates", () => {
    it("reports only the matching type", () => {
      const actor = ActorRef.employee("123");

      expect(actor.isEmployee()).toBe(true);
      expect(actor.isPartner()).toBe(false);
      expect(actor.isBookkeeper()).toBe(false);
      expect(actor.isCompany()).toBe(false);
      expect(actor.isSystem()).toBe(false);
      expect(actor.isApiIntegration()).toBe(false);
    });

    it("recognises the partner type via parse (no factory for it)", () => {
      expect(ActorRef.parse("f:act:partner:1").isPartner()).toBe(true);
    });
  });

  describe("equals", () => {
    it("compares by type and id", () => {
      const actor = ActorRef.employee("123");

      expect(actor.equals(ActorRef.parse("f:act:employee:123"))).toBe(true);
      expect(actor.equals(ActorRef.bookkeeper("123"))).toBe(false);
      expect(actor.equals(ActorRef.employee("456"))).toBe(false);
    });
  });
});
