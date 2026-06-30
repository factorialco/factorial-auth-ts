# @factorialco/factorial-auth

Decode and verify [Factorial ID](https://github.com/factorialco/factorial) JWT
tokens in TypeScript.

## What it does

- Resolves the issuer + JWKS URI via OIDC discovery (cached, with stale
  fallback).
- Verifies access / ID tokens (ES256) — signature, `iss`, `aud`, `exp`, `nbf`.
- Returns strict, typed, immutable claim objects.
- Ships actor-identity value objects: `ActorRef`, `ActorType`, `IdentityChain`.
- Provides a framework-agnostic `extractBearerToken` helper.

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm lint        # oxlint
pnpm fmt:check   # oxfmt --check
pnpm build       # tsup -> dist/ (ESM + CJS + d.ts)
```
