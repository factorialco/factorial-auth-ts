# Agent Development Guidelines

## Commands

- **Run all checks**: `pnpm checks` (lint, format, typecheck, unused code)
- **Test all**: `pnpm run test`
- **Typecheck**: `pnpm checks:tsc`
- **Linter**: `pnpm checks:lint`
- **Format**: `pnpm checks:format`
- **Unused code**: `pnpm checks:knip`

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
