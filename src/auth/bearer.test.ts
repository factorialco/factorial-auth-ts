import { describe, expect, it } from "vitest";
import { extractBearerToken } from "@/auth/bearer";

describe("extractBearerToken", () => {
  it("extracts the token from a Bearer header", () => {
    expect(extractBearerToken("Bearer token-123")).toBe("token-123");
  });

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearerToken("Basic abc")).toBeNull();
  });

  it("is case-sensitive on the scheme", () => {
    expect(extractBearerToken("bearer token-123")).toBeNull();
  });

  it("returns null for a missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("returns null when the token is missing or there are extra parts", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer a b")).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });

  it("tolerates surrounding and repeated whitespace", () => {
    expect(extractBearerToken("  Bearer   token-123  ")).toBe("token-123");
  });
});
