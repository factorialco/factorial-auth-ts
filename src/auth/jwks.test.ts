import {
  type CryptoKey,
  type JWK,
  SignJWT,
  errors,
  exportJWK,
  generateKeyPair,
  jwtVerify,
} from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { validateConfig } from "@/auth/config";
import { JwksFetchError, JwksParseError } from "@/auth/errors";
import { JwksClient } from "@/auth/jwks";
import { DiscoveryClient } from "@/auth/oidc-discovery";

const DISCOVERY_URL = "https://factorial-id.example.com/.well-known/openid-configuration";
const JWKS_URL = "https://factorial-id.example.com/.well-known/jwks.json";

async function makeKey(kid: string): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return { privateKey, jwk };
}

function signToken(privateKey: CryptoKey, kid: string): Promise<string> {
  return new SignJWT({ sub: "user-1" }).setProtectedHeader({ alg: "ES256", kid }).sign(privateKey);
}

function discoveryHandler() {
  return http.get(DISCOVERY_URL, () =>
    HttpResponse.json({ issuer: "https://factorial-id.example.com", jwks_uri: JWKS_URL }),
  );
}

function buildClient(): JwksClient {
  const config = validateConfig({ oidcDiscoveryUrl: DISCOVERY_URL, audience: "factorial" });
  return new JwksClient(config, new DiscoveryClient(config));
}

const server = setupServer();

describe("JwksClient", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("resolves the key for a known kid", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.json({ keys: [jwk] })),
    );

    const token = await signToken(privateKey, "kid-1");
    const { payload } = await jwtVerify(token, buildClient().getKey);

    expect(payload.sub).toBe("user-1");
  });

  it("refreshes once on an unknown kid to pick up a rotated key", async () => {
    const { jwk: jwk1 } = await makeKey("kid-1");
    const { privateKey: privateKey2, jwk: jwk2 } = await makeKey("kid-2");

    let jwksCalls = 0;
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => {
        jwksCalls += 1;
        return HttpResponse.json({ keys: [jwksCalls === 1 ? jwk1 : jwk2] });
      }),
    );

    const token = await signToken(privateKey2, "kid-2");
    const { payload } = await jwtVerify(token, buildClient().getKey);

    expect(payload.sub).toBe("user-1");
    expect(jwksCalls).toBe(2);
  });

  it("fails when the kid is unknown even after a refresh", async () => {
    const { jwk } = await makeKey("kid-1");
    const { privateKey: otherKey } = await makeKey("kid-2");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.json({ keys: [jwk] })),
    );

    const token = await signToken(otherKey, "kid-2");

    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(errors.JWKSNoMatchingKey);
  });

  it("propagates resolver errors other than a missing kid (no refresh)", async () => {
    const { jwk: jwk1 } = await makeKey("kid-1");
    const { privateKey, jwk: jwk2 } = await makeKey("kid-2");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.json({ keys: [jwk1, jwk2] })),
    );

    // No kid + multiple keys -> JWKSMultipleMatchingKeys, which must not trigger a refresh.
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256" })
      .sign(privateKey);

    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(
      errors.JWKSMultipleMatchingKeys,
    );
  });

  it("caches the JWKS across verifications (one request)", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    let jwksCalls = 0;
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => {
        jwksCalls += 1;
        return HttpResponse.json({ keys: [jwk] });
      }),
    );

    const client = buildClient();
    const token = await signToken(privateKey, "kid-1");
    await jwtVerify(token, client.getKey);
    await jwtVerify(token, client.getKey);

    expect(jwksCalls).toBe(1);
  });

  it("wraps a non-2xx JWKS response as JwksFetchError", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => new HttpResponse(null, { status: 500 })),
    );

    const token = await signToken(privateKey, "kid-1");
    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(JwksFetchError);
  });

  it("wraps a network error as JwksFetchError", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.error()),
    );

    const token = await signToken(privateKey, "kid-1");
    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(JwksFetchError);
  });

  it("throws JwksParseError when the JWKS is not valid JSON", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.text("not json")),
    );

    const token = await signToken(privateKey, "kid-1");
    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(JwksParseError);
  });

  it("throws JwksParseError when the JWKS is malformed", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => HttpResponse.json({ nope: true })),
    );

    const token = await signToken(privateKey, "kid-1");
    await expect(jwtVerify(token, buildClient().getKey)).rejects.toThrow(JwksParseError);
  });
});
