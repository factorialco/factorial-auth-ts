import { describe, expect, it } from "vitest";
import { ActType } from "@/auth/act-type";
import { ActorRef } from "@/auth/actor-ref";
import { IdentityChain, IdentityChainError } from "@/auth/identity-chain";

const employee = ActorRef.employee("123");
const admin = ActorRef.employee("999");
const staff = ActorRef.employee("777");

describe("IdentityChain", () => {
  describe("construction", () => {
    it("builds a direct identity chain", () => {
      const chain = new IdentityChain({ actor: employee });

      expect(chain.actor.equals(employee)).toBe(true);
      expect(chain.act).toBeUndefined();
      expect(chain.actType).toBeUndefined();
    });

    it("builds a nested act chain", () => {
      const chain = new IdentityChain({
        actor: employee,
        act: new IdentityChain({ actor: admin }),
        actType: ActType.AdminBecome,
      });

      expect(chain.actor.equals(employee)).toBe(true);
      expect(chain.act?.actor.equals(admin)).toBe(true);
      expect(chain.actType).toBe(ActType.AdminBecome);
    });

    it("requires act when actType is present", () => {
      expect(() => new IdentityChain({ actor: employee, actType: ActType.AdminBecome })).toThrow(
        "Identity chain act_type requires act",
      );
    });

    it("requires actType when act is present", () => {
      expect(
        () => new IdentityChain({ actor: employee, act: new IdentityChain({ actor: admin }) }),
      ).toThrow("Identity chain act requires act_type");
    });

    it("allows manually built chains beyond the default parse max depth", () => {
      const adminStaff = new IdentityChain({
        actor: admin,
        act: new IdentityChain({ actor: staff }),
        actType: ActType.StaffBecome,
      });
      const employeeChain = new IdentityChain({
        actor: employee,
        act: adminStaff,
        actType: ActType.AdminBecome,
      });
      const root = new IdentityChain({
        actor: ActorRef.company("42"),
        act: employeeChain,
        actType: ActType.StaffBecome,
      });

      expect(root.act?.act?.act?.actor.equals(staff)).toBe(true);
    });
  });

  describe("create", () => {
    it("builds a nested chain from value objects", () => {
      const chain = IdentityChain.create({
        actor: employee,
        act: IdentityChain.create({ actor: admin }),
        actType: ActType.AdminBecome,
      });

      expect(chain.actor.equals(employee)).toBe(true);
      expect(chain.act?.actor.equals(admin)).toBe(true);
      expect(chain.actType).toBe(ActType.AdminBecome);
    });

    it("enforces the act/actType invariant", () => {
      expect(() => IdentityChain.create({ actor: employee, actType: ActType.AdminBecome })).toThrow(
        IdentityChainError,
      );
    });
  });

  describe("parse", () => {
    const serialized = {
      actor: "f:act:employee:123",
      act_type: "admin_become",
      act: {
        actor: "f:act:employee:999",
        act_type: "staff_become",
        act: { actor: "f:act:employee:777" },
      },
    };

    it("round-trips a recursively serialized chain", () => {
      const chain = IdentityChain.parse(serialized);

      expect(chain.actor.equals(employee)).toBe(true);
      expect(chain.actType).toBe(ActType.AdminBecome);
      expect(chain.act?.actor.equals(admin)).toBe(true);
      expect(chain.act?.actType).toBe(ActType.StaffBecome);
      expect(chain.act?.act?.actor.equals(staff)).toBe(true);
      expect(chain.toObject()).toEqual(serialized);
    });

    it("rejects chains deeper than the configured max depth", () => {
      expect(() => IdentityChain.parse(serialized, { maxDepth: 1 })).toThrow(
        "Identity chain cannot be deeper than 1 actors",
      );
    });

    it("rejects a non-positive max depth", () => {
      expect(() => IdentityChain.parse({ actor: "f:act:employee:123" }, { maxDepth: 0 })).toThrow(
        "Identity chain max depth must be positive",
      );
    });

    it("rejects a missing or non-string actor", () => {
      expect(() => IdentityChain.parse({})).toThrow(IdentityChainError);
      expect(() => IdentityChain.parse({ actor: 123 })).toThrow(IdentityChainError);
    });

    it("rejects malformed actor refs", () => {
      expect(() => IdentityChain.parse({ actor: "not-an-actor-ref" })).toThrow(IdentityChainError);
    });

    it("rejects a non-object act", () => {
      expect(() =>
        IdentityChain.parse({ actor: "f:act:employee:123", act: "nope", act_type: "admin_become" }),
      ).toThrow(IdentityChainError);
    });

    it("rejects a non-string act_type", () => {
      expect(() =>
        IdentityChain.parse({
          actor: "f:act:employee:123",
          act: { actor: "f:act:employee:999" },
          act_type: 5,
        }),
      ).toThrow(IdentityChainError);
    });

    it("rejects an unknown act_type value", () => {
      expect(() =>
        IdentityChain.parse({
          actor: "f:act:employee:123",
          act: { actor: "f:act:employee:999" },
          act_type: "become",
        }),
      ).toThrow(IdentityChainError);
    });

    it("enforces the act/actType invariant on parsed nodes", () => {
      expect(() =>
        IdentityChain.parse({ actor: "f:act:employee:123", act: { actor: "f:act:employee:999" } }),
      ).toThrow("Identity chain act requires act_type");
    });
  });

  describe("equals", () => {
    const make = () =>
      new IdentityChain({
        actor: employee,
        act: new IdentityChain({ actor: admin }),
        actType: ActType.AdminBecome,
      });

    it("compares the whole chain", () => {
      expect(make().equals(make())).toBe(true);
      expect(make().equals(new IdentityChain({ actor: employee }))).toBe(false);
    });
  });
});
