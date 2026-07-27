import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const packageManager = process.env['npm_execpath']
if (packageManager === undefined) {
  throw new Error('npm_execpath is required to prepare @factorialco/auth')
}

function runPnpm(...args) {
  execFileSync(process.execPath, [packageManager, ...args], { stdio: 'inherit' })
}

runPnpm('build')

if (existsSync('.git')) {
  runPnpm('exec', 'lefthook', 'install')
}
