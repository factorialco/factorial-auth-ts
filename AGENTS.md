# Agent Development Guidelines

## Commands

- `pnpm test` — run tests once (vitest); also `test:watch`, `test:coverage`
- `pnpm build` — build to `dist/` (ESM + CJS + `.d.ts`) via tsup
- `pnpm checks` — run all checks in parallel: `checks:lint` (oxlint), `checks:format` (oxfmt, check-only; `pnpm exec oxfmt` to fix), `checks:tsc` (tsgo), `checks:knip` (unused files/exports/deps)
- `pnpm typecheck` — type-check with `tsc --noEmit` (`checks:tsc` uses tsgo)

## Code Style

- **Imports**: Use `@/*` aliase, never use relative paths upwards or `.ts` extensions
- **Types**: Strict TypeScript with no unused locals/parameters. Only use "as TYPE" as a last resort.
- **Documentation**: Use docstrings, avoid superfluous comments
- **Naming**: Follow existing conventions, camelCase for variables/functions
- **Error handling**: Use try/catch with specific error types, avoid generic catches

## Testing

- **Framework**: never use globals, always import from 'vitest'
- **File structure**: Colocate test files with the file it is testing
- **Mocks**: No top-level or global mocks, use only required mocks
- **Coverage**: Target high coverage, exclude index.ts and static definitions

## Rules

- Never hardcode data/logic unless explicitly requested
- Never test constants, enums, type definitions or any other kind of static definition
- Never implement any kind of backwards compatibility unless asked
- Always clean up unused code and debug scripts
- Always run `pnpm checks` after making changes and fix any errors
