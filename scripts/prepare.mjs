import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const packageManager = process.env['npm_execpath']
if (packageManager === undefined) {
  throw new Error('npm_execpath is required to prepare @factorialco/auth')
}

function runPackageManager(...args) {
  // npm_execpath is a JS entry point for npm/pnpm/yarn but a native binary for bun.
  const [command, leadingArgs] = /\.[cm]?js$/.test(packageManager)
    ? [process.execPath, [packageManager]]
    : [packageManager, []]
  execFileSync(command, [...leadingArgs, ...args], { stdio: 'inherit' })
}

// `run build` works across package managers; bare `build` is not an npm command.
runPackageManager('run', 'build')

// Git hooks only matter in a development clone. Git-dependency installs also run
// this in a real clone, so a lefthook hiccup must never fail a consumer's install.
if (existsSync('.git')) {
  try {
    runPackageManager('exec', 'lefthook', 'install')
  } catch {
    console.warn('lefthook install failed; skipping git hooks')
  }
}
