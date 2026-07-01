import {
  type CryptoKey,
  type JWK,
  type JWTPayload,
  SignJWT,
  exportJWK,
  generateKeyPair,
} from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type FactorialAuthConfig, validateConfig } from "@/auth/config";
import { Decoder } from "@/auth/decoder";
import {
  ExpiredToken,
  ImmatureToken,
  InvalidAudience,
  InvalidIssuer,
  InvalidToken,
  JwksFetchError,
  OidcDiscoveryFetchError,
} from "@/auth/errors";
import { JwksClient } from "@/auth/jwks";
import { DiscoveryClient } from "@/auth/oidc-discovery";

const ISSUER = "https://factorial-id.example.com";
const AUDIENCE = "factorial";
const DISCOVERY_URL = "https://factorial-id.example.com/.well-known/openid-configuration";
const JWKS_URL = "https://factorial-id.example.com/.well-known/jwks.json";
const NOW = Math.floor(Date.now() / 1000);

async function makeKey(kid: string): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return { privateKey, jwk };
}

function signToken(privateKey: CryptoKey, kid: string, payload: JWTPayload): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "ES256", kid }).sign(privateKey);
}

function accessPayload(overrides: JWTPayload = {}): JWTPayload {
  return {
    iss: ISSUER,
    sub: "user-1",
    aud: AUDIENCE,
    iat: NOW,
    exp: NOW + 3600,
    jti: "jti-1",
    ...overrides,
  };
}

function idPayload(overrides: JWTPayload = {}): JWTPayload {
  return { iss: ISSUER, sub: "user-1", aud: AUDIENCE, iat: NOW, exp: NOW + 3600, ...overrides };
}

function discoveryHandler() {
  return http.get(DISCOVERY_URL, () => HttpResponse.json({ issuer: ISSUER, jwks_uri: JWKS_URL }));
}

function jwksHandler(...keys: JWK[]) {
  return http.get(JWKS_URL, () => HttpResponse.json({ keys }));
}

function buildDecoder(overrides: Partial<FactorialAuthConfig> = {}): Decoder {
  const config = validateConfig({
    oidcDiscoveryUrl: DISCOVERY_URL,
    audience: AUDIENCE,
    ...overrides,
  });
  const discovery = new DiscoveryClient(config);
  return new Decoder(config, discovery, new JwksClient(config, discovery));
}

const server = setupServer();

describe("Decoder", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("decodes a valid access token into typed claims", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", accessPayload({ cid: "42" }));
    const claims = await buildDecoder().decodeAccessToken(token);

    expect(claims.sub).toBe("user-1");
    expect(claims.jti).toBe("jti-1");
    expect(claims.cid).toBe("42");
  });

  it("decodes a valid ID token into typed claims", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", idPayload({ email: "user@factorial.co" }));
    const claims = await buildDecoder().decodeIdToken(token);

    expect(claims.sub).toBe("user-1");
    expect(claims.email).toBe("user@factorial.co");
  });

  it("maps an expired token to ExpiredToken", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", accessPayload({ exp: NOW - 3600 }));
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(ExpiredToken);
  });

  it("maps a wrong audience to InvalidAudience", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", accessPayload({ aud: "someone-else" }));
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(InvalidAudience);
  });

  it("maps a wrong issuer to InvalidIssuer", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(
      privateKey,
      "kid-1",
      accessPayload({ iss: "https://evil.example" }),
    );
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(InvalidIssuer);
  });

  it("maps a future nbf to ImmatureToken", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", accessPayload({ nbf: NOW + 3600 }));
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(ImmatureToken);
  });

  it("maps a bad signature to InvalidToken", async () => {
    const { privateKey } = await makeKey("kid-1");
    const { jwk: otherJwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(otherJwk));

    const token = await signToken(privateKey, "kid-1", accessPayload());
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(InvalidToken);
  });

  it("maps a malformed token to InvalidToken", async () => {
    const { jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    await expect(buildDecoder().decodeAccessToken("not.a.jwt")).rejects.toThrow(InvalidToken);
  });

  it("maps an unknown kid (even after refresh) to InvalidToken", async () => {
    const { jwk } = await makeKey("kid-1");
    const { privateKey: otherKey } = await makeKey("kid-2");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(otherKey, "kid-2", accessPayload());
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(InvalidToken);
  });

  it("maps a payload missing a required claim to InvalidToken", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    // Signature is valid, but the access-token schema requires `jti`.
    const token = await signToken(privateKey, "kid-1", accessPayload({ jti: undefined }));
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(InvalidToken);
  });

  it("ignores a future nbf when requireNbf is false", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(privateKey, "kid-1", accessPayload({ nbf: NOW + 3600 }));
    const claims = await buildDecoder({ requireNbf: false }).decodeAccessToken(token);

    expect(claims.sub).toBe("user-1");
  });

  it("still enforces expiration when requireNbf is false", async () => {
    const { privateKey, jwk } = await makeKey("kid-1");
    server.use(discoveryHandler(), jwksHandler(jwk));

    const token = await signToken(
      privateKey,
      "kid-1",
      accessPayload({ nbf: NOW + 3600, exp: NOW - 3600 }),
    );
    await expect(buildDecoder({ requireNbf: false }).decodeAccessToken(token)).rejects.toThrow(
      ExpiredToken,
    );
  });

  it("propagates a JWKS fetch failure without wrapping it as a token error", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(
      discoveryHandler(),
      http.get(JWKS_URL, () => new HttpResponse(null, { status: 500 })),
    );

    const token = await signToken(privateKey, "kid-1", accessPayload());
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(JwksFetchError);
  });

  it("wraps a non-Error verification failure as InvalidToken", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(discoveryHandler());

    const config = validateConfig({ oidcDiscoveryUrl: DISCOVERY_URL, audience: AUDIENCE });
    // A key resolver that rejects with a non-Error value exercises the fallback branch.
    const jwks = { getKey: () => Promise.reject("resolver blew up") } as unknown as JwksClient;
    const decoder = new Decoder(config, new DiscoveryClient(config), jwks);

    const token = await signToken(privateKey, "kid-1", accessPayload());
    await expect(decoder.decodeAccessToken(token)).rejects.toThrow(InvalidToken);
  });

  it("propagates a discovery fetch failure without wrapping it as a token error", async () => {
    const { privateKey } = await makeKey("kid-1");
    server.use(http.get(DISCOVERY_URL, () => new HttpResponse(null, { status: 500 })));

    const token = await signToken(privateKey, "kid-1", accessPayload());
    await expect(buildDecoder().decodeAccessToken(token)).rejects.toThrow(OidcDiscoveryFetchError);
  });
});
