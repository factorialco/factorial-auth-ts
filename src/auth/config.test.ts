import { describe, expect, it } from "vitest";
import { validateConfig } from "@/auth/config";
import { ConfigurationError } from "@/auth/errors";

const validInput = {
  oidcDiscoveryUrl: "https://factorial-id.example.com/.well-known/openid-configuration",
  audience: "factorial",
};

describe("validateConfig", () => {
  it("applies defaults for omitted optional fields", () => {
    const config = validateConfig(validInput);

    expect(config.algorithms).toEqual(["ES256"]);
    expect(config.clockLeewaySeconds).toBe(30);
    expect(config.httpTimeoutMs).toBe(5000);
    expect(config.requireNbf).toBe(true);
  });

  it("keeps provided values over the defaults", () => {
    const config = validateConfig({
      ...validInput,
      algorithms: ["ES384"],
      clockLeewaySeconds: 5,
      httpTimeoutMs: 1000,
      requireNbf: false,
    });

    expect(config.algorithms).toEqual(["ES384"]);
    expect(config.clockLeewaySeconds).toBe(5);
    expect(config.httpTimeoutMs).toBe(1000);
    expect(config.requireNbf).toBe(false);
  });

  it("throws ConfigurationError when oidcDiscoveryUrl is empty", () => {
    expect(() => validateConfig({ ...validInput, oidcDiscoveryUrl: "" })).toThrow(
      ConfigurationError,
    );
  });

  it("throws ConfigurationError when audience is empty", () => {
    expect(() => validateConfig({ ...validInput, audience: "" })).toThrow(ConfigurationError);
  });

  it("throws ConfigurationError when algorithms is empty", () => {
    expect(() => validateConfig({ ...validInput, algorithms: [] })).toThrow(ConfigurationError);
  });
});
