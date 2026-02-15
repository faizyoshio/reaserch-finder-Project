import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const TARGET_DIRS = ['app', 'components', 'styles', 'hooks', 'lib']
const EXTENSIONS = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'artifacts'])

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), out)
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!EXTENSIONS.has(ext)) continue
    out.push(path.join(dir, entry.name))
  }
}

function stripBlockCommentContents(text) {
  if (!text.includes('/*')) return text
  return text.replace(/\/\*[\s\S]*?\*\//g, '/* */')
}

function main() {
  const files = []
  for (const dir of TARGET_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    walk(abs, files)
  }

  let changed = 0
  const changedFiles = []

  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8')
    const after = stripBlockCommentContents(before)
    if (after === before) continue
    fs.writeFileSync(file, after, 'utf8')
    changed += 1
    changedFiles.push(path.relative(ROOT, file).replace(/\\/g, '/'))
  }

  console.log(`Updated ${changed} file(s).`)
  for (const f of changedFiles) console.log(`- ${f}`)
}

main()

