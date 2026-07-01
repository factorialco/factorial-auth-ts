import { describe, expect, it } from "vitest";
import { parseIdTokenClaims } from "@/claims/id-token";
import { InvalidToken } from "@/errors";

const validPayload = () => ({
  iss: "https://factorial-id.example.com",
  sub: "user-1",
  aud: "factorial",
  iat: 1_700_000_000,
  exp: 1_700_003_600,
});

describe("parseIdTokenClaims", () => {
  it("parses a full payload", () => {
    const claims = parseIdTokenClaims({
      ...validPayload(),
      nbf: 1_700_000_000,
      email: "u@example.com",
      email_verified: true,
      staff: false,
      cid: "company-1",
      eid: "employee-1",
      cell: "cell-1",
      nonce: "nonce-1",
      auth_time: 1_699_999_940,
    });

    expect(claims.sub).toBe("user-1");
    expect(claims.nonce).toBe("nonce-1");
    expect(claims.email).toBe("u@example.com");
    expect(claims.email_verified).toBe(true);
    expect(claims.staff).toBe(false);
  });

  it("leaves optional claims undefined when absent", () => {
    const claims = parseIdTokenClaims(validPayload());
    expect(claims.email).toBeUndefined();
    expect(claims.email_verified).toBeUndefined();
  });

  it("ignores unknown claims", () => {
    const claims = parseIdTokenClaims({ ...validPayload(), scope: "openid" });
    expect(claims).not.toHaveProperty("scope");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(parseIdTokenClaims(validPayload()))).toBe(true);
  });

  it("rejects a non-boolean email_verified claim", () => {
    expect(() => parseIdTokenClaims({ ...validPayload(), email_verified: "yes" })).toThrow(
      InvalidToken,
    );
  });

  it("rejects a missing required claim", () => {
    const { aud, ...withoutAud } = validPayload();
    void aud;
    expect(() => parseIdTokenClaims(withoutAud)).toThrow(InvalidToken);
  });
});
