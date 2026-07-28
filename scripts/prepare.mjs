import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const packageManager = process.env['npm_execpath']
if (packageManager === undefined) {
  throw new Error('npm_execpath is required to prepare @factorialco/auth')
}

function runPnpm(...args) {
  execFileSync(process.execPath, [packageManager, ...args], { stdio: 'inherit' })
}

// `run build` works across package managers; bare `build` is not an npm command.
runPnpm('run', 'build')

if (existsSync('.git')) {
  runPnpm('exec', 'lefthook', 'install')
}
