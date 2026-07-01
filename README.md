# @factorialco/factorial-auth

Verify and decode [Factorial ID](https://github.com/factorialco/factorial/tree/main/factorial-id) JWT access and ID tokens.

Library-agnostic: it depends only on [`jose`](https://github.com/panva/jose) and the global `fetch`,
so it runs on **Node.js (>= 22.14)** and on **edge / serverless** runtimes.

- Resolves the issuer + JWKS URI via **OIDC discovery** (cached, with stale fallback).
- Verifies tokens (ES256 by default): **signature, `iss`, `aud`, `exp`, `nbf`**.
- Refetches the JWKS automatically on **key rotation** (unknown `kid`).
- Returns **strict, typed, immutable** claim objects.
- Ships actor-identity value objects: `ActorRef`, `ActorType`, `IdentityChain`, `ActType`.
- Provides a framework-agnostic `extractBearerToken` helper.

---

## Install

```bash
pnpm add @factorialco/factorial-auth
# or: npm install / yarn add / bun add
```

## Quick start

```ts
import { FactorialAuth } from "@factorialco/factorial-auth";

const auth = new FactorialAuth({
  oidcDiscoveryUrl: "https://id.factorialhr.com/.well-known/openid-configuration",
  audience: "your-client-id",
});

// Verify an access token
const accessTokenClaim = await auth.verifyAccessToken(token);
console.log(accessTokenClaim.sub, accessTokenClaim.cid);

// Verify an id token
const idTokenClaim = await auth.verifyIdToken(token);
console.log(idTokenClaim.sub, idTokenClaim.email);
```

Construction is cheap and synchronous — no network calls happen until the first
`verify*`/`tryVerify*` call. Discovery and JWKS documents are fetched lazily and
then cached (see [Caching & key rotation](#caching--key-rotation)).

## Actor identity primitives

`ActorRef` and `IdentityChain` are small value objects for
carrying authenticated actor identity across application boundaries. They are
authentication primitives, not authorization contexts and not event transport
objects.

### ActorRef

`ActorRef` is an immutable reference to one concrete actor.

It answers: "which actor is this?"

```ts
import { ActorRef } from "@factorialco/factorial-auth";

ActorRef.employee("123");
ActorRef.company("42");
ActorRef.system("domain-events-audit-log-creator");
```

An actor ref serializes to a URI-like string:

```text
f:act:employee:123
```

Use an `ActorRef` when code needs a compact, stable actor identifier without
loading a model, carrying permissions, or encoding tenant scope. The id is
always a string and must be opaque: never put emails, names, API keys, tokens,
IPs, or other sensitive values in it.

### IdentityChain

`IdentityChain` is a recursive chain of actor refs.

It answers: "who is the effective authenticated actor, and who is acting
through whom?"

The chain root is the effective actor for the current action. If the action
happened through a become/act flow, `act` points to the actor chain that
initiated it, and `actType` describes the relationship between those two nodes.

```ts
import { ActorRef, ActType, IdentityChain } from "@factorialco/factorial-auth";

const employee = ActorRef.employee("123");
const admin = ActorRef.employee("999");

const identityChain = IdentityChain.create({
  actor: employee,
  act: IdentityChain.create({ actor: admin }),
  actType: ActType.AdminBecome,
});

identityChain.actor; // employee
identityChain.act?.actor; // admin
```

The serialized shape is string-keyed and recursive (the wire form uses the
snake_case `act_type`):

```ts
identityChain.toObject();

// {
//   actor: "f:act:employee:123",
//   act: { actor: "f:act:employee:999" },
//   act_type: "admin_become",
// }
```

Use `IdentityChain.parse` only for trusted server-side metadata.
Deserialization is capped at 3 nodes by default to keep parsing conservative;
pass `maxDepth` to change it:

```ts
IdentityChain.parse(serializedObject);
IdentityChain.parse(serializedObject, { maxDepth: 5 });
```

### How they relate

`ActorRef` is the leaf value. It identifies one actor and nothing else.

`IdentityChain` composes actor refs into the authenticated relationship graph.
This keeps actor references stable and simple while preserving become/act
context explicitly. Do not encode impersonation chains into an actor ref string;
keep the actor ref as the subject and use `IdentityChain.act` plus
`IdentityChain.actType` for the relationship.

For example, an admin becoming an employee is represented as:

```text
employee actor ref -> act(admin actor ref), actType: admin_become
```

That lets application code choose the right projection for its own contract.

Never accept a client-supplied actor ref or identity chain as authoritative for
writes. Build these objects from authenticated server-side context, credentials,
or known system callers. An actor ref identifies the actor, not the tenant, so
audit and domain-event flows must carry company or tenant scope separately.

## Error handling

Every verification/decoding failure throws a subclass of `AuthError`. Catch
`AuthError` to handle all of them, or a specific subclass for finer control. The
`tryVerify*` methods swallow `AuthError` and return `null`; any other (unexpected)
error propagates.

```
Error
├─ AuthError                       // base for everything this library throws
│  ├─ ConfigurationError           // invalid FactorialAuthConfig (thrown by the constructor)
│  ├─ OidcDiscoveryFetchError      // discovery endpoint unreachable / non-2xx / timeout
│  ├─ OidcDiscoveryParseError      // discovery document invalid JSON or missing issuer/jwks_uri
│  ├─ JwksFetchError               // JWKS endpoint unreachable / non-2xx / timeout
│  ├─ JwksParseError               // JWKS invalid JSON or malformed key set
│  └─ TokenError                   // base for token-level failures
│     ├─ InvalidToken              // bad signature, malformed token, unknown kid, or bad claim shape
│     ├─ ExpiredToken              // exp check failed
│     ├─ InvalidIssuer             // iss did not match the discovery document
│     ├─ InvalidAudience           // aud did not match config.audience
│     └─ ImmatureToken             // nbf check failed (token used before it is valid)
├─ ActorRefError                   // malformed ActorRef string/id (NOT an AuthError)
└─ IdentityChainError              // malformed identity chain (NOT an AuthError)
```

> Note: `ActorRefError` and `IdentityChainError` extend `Error` directly, **not**
> `AuthError`, and are not affected by `tryVerify*`.

```ts
import {
  FactorialAuth,
  ExpiredToken,
  TokenError,
  OidcDiscoveryFetchError,
} from "@factorialco/factorial-auth";

try {
  const claims = await auth.verifyAccessToken(token);
} catch (error) {
  if (error instanceof ExpiredToken) {
    // prompt a refresh
  } else if (error instanceof TokenError) {
    // any other invalid-token case -> 401
  } else if (error instanceof OidcDiscoveryFetchError) {
    // upstream/infra problem -> 503
  } else {
    throw error;
  }
}
```

## Caching & key rotation

- The OIDC discovery document and the JWKS are cached in memory with a dual TTL:
  **fresh for 10 minutes**, then served **stale for up to 1 hour** if a refetch
  fails (so a transient discovery/JWKS outage doesn't break verification).
- Concurrent first-time verifications trigger a **single** discovery fetch and a
  **single** JWKS fetch (in-flight requests are de-duplicated).
- When a token carries a `kid` that isn't in the cached JWKS (key rotation), the
  JWKS is refetched **once** and the lookup retried. If the `kid` is still
  unknown, the token is rejected with `InvalidToken`.

Because caches live on the instance, create **one** `FactorialAuth` and reuse it
for the lifetime of your process/worker rather than constructing one per request.

## Integration patterns

### Server request handler (Express-style)

```ts
import { FactorialAuth, extractBearerToken } from "@factorialco/factorial-auth";

const auth = new FactorialAuth({
  oidcDiscoveryUrl: process.env.FACTORIAL_OIDC_DISCOVERY_URL!,
  audience: process.env.FACTORIAL_AUDIENCE!,
});

app.use(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization ?? null);

  if (token === null) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  const claims = await auth.tryVerifyAccessToken(token);

  if (claims === null) {
    return res.status(401).json({ error: "invalid token" });
  }

  req.claims = claims;
  next();
});
```

### Edge / Web `Request`

```ts
const token = extractBearerToken(request.headers.get("authorization"));
const claims = token ? await auth.tryVerifyAccessToken(token) : null;
```

### Delegated identity (`act` → `IdentityChain`)

The `act` claim is left as a raw object on the claims; parse it explicitly when
you need the chain (e.g. staff-become / admin-become flows):

```ts
import { IdentityChain } from "@factorialco/factorial-auth";

const claims = await auth.verifyAccessToken(token);

if (claims.act) {
  const chain = IdentityChain.parse(claims.act); // throws IdentityChainError if malformed
  const effectiveActor = chain.actor; // ActorRef performing the action
}
```

## Compatibility

- **Runtime:** Node.js >= 22.14, and any edge/serverless runtime with global
  `fetch` and Web Crypto (Cloudflare Workers, Vercel Edge, Deno, Bun).
- **Modules:** dual ESM (`import`) and CJS (`require`) entry points with bundled
  `.d.ts`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and development commands.
