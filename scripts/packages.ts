/**
 * Builds the SDKs for npm and, with --publish, publishes them.
 *
 *   npm run packages             build each package into packages/<name>/npm/
 *   npm run packages -- --pack   also show what each tarball would contain
 *   npm run packages -- --publish  publish them (needs `npm login` first)
 *
 * In the monorepo the packages run from their TypeScript sources. For npm each
 * one gets its own folder with compiled JavaScript, type definitions, a
 * package.json that points at them, its README and the licence, so what is
 * published never depends on the rest of the repository.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const REPO = 'https://github.com/m2moryne/Oryne'
const LICENSE = 'MIT'

/** In dependency order: each one is built before the packages that use it. */
const packages = ['core', 'agent', 'merchant', 'mcp']
const keywords = ['stellar', 'x402', 'ai-agents', 'agent-payments', 'usdc', 'soroban']

const mode = process.argv.includes('--publish') ? 'publish' : process.argv.includes('--pack') ? 'pack' : 'build'
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

const manifests = Object.fromEntries(
  packages.map((name) => [name, JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))]),
)

for (const name of packages) {
  const source = join(root, 'packages', name)
  const out = join(source, 'npm')
  const manifest = manifests[name]
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  // Compile src/ to dist/: .js and .d.ts, with ./x.ts imports rewritten to ./x.js.
  // Other @oryne packages resolve to their already-built types.
  const paths = Object.fromEntries(
    packages.filter((other) => other !== name).map((other) => [`@oryne/${other}`, [`../${other}/npm/dist/index.d.ts`]]),
  )
  const tsconfig = join(source, 'tsconfig.npm.json')
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        noEmit: false,
        declaration: true,
        rewriteRelativeImportExtensions: true,
        rootDir: 'src',
        outDir: 'npm/dist',
        paths,
      },
      include: ['src'],
      exclude: ['src/**/*.test.ts'],
    }),
  )
  try {
    run('npx', ['tsc', '-p', tsconfig])
  } finally {
    rmSync(tsconfig)
  }

  const dependencies = Object.fromEntries(
    Object.entries((manifest.dependencies ?? {}) as Record<string, string>).map(([dependency, range]) => [
      dependency,
      dependency.startsWith('@oryne/') ? `^${manifests[dependency.slice(7)].version}` : range,
    ]),
  )
  const published: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    license: LICENSE,
    homepage: 'https://oryne.org',
    repository: { type: 'git', url: `git+${REPO}.git`, directory: `packages/${name}` },
    bugs: `${REPO}/issues`,
    keywords,
    type: 'module',
    engines: { node: '>=20' },
    ...(manifest.bin
      ? { bin: { 'oryne-mcp': './dist/server.js' } }
      : {
          main: './dist/index.js',
          types: './dist/index.d.ts',
          exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
        }),
    files: ['dist'],
    dependencies,
    publishConfig: { access: 'public' },
  }
  writeFileSync(join(out, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)
  copyFileSync(join(source, 'README.md'), join(out, 'README.md'))
  copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE'))
  console.log(`built ${manifest.name}@${manifest.version}`)

  if (mode === 'pack') run('npm', ['pack', '--dry-run'], out)
  if (mode === 'publish') {
    if (!existsSync(join(out, 'dist'))) throw new Error(`${name}: nothing built`)
    run('npm', ['publish'], out)
  }
}
