# Contributing

Thanks for contributing to `@factorialco/auth`!

## Prerequisites

The toolchain (Node.js and pnpm) is pinned with [mise](https://mise.jdx.dev).

1. Install mise — follow the [mise installation guide](https://mise.jdx.dev/getting-started.html).
2. From the project root, install the pinned tools declared in `mise.toml`:

   ```bash
   mise install
   ```

If you'd rather manage versions yourself, check `mise.toml` for the expected
Node.js and pnpm versions.

## Setup

Install dependencies:

```bash
pnpm install
```

## Development

Run the checks before opening a pull request:

```bash
pnpm checks
```

The full list of commands and the coding, testing, and contribution conventions
live in [AGENTS.md](AGENTS.md).
