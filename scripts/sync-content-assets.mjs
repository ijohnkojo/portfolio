/**
 * Mirrors non-MDX files from content/ into public/content/, so assets can sit
 * next to the writeup that uses them while still being served statically.
 *
 * Runs from `predev` and `prebuild`. `public/content/` is generated and
 * gitignored — content/ stays the only place anything is authored.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'content')
const DEST = path.join(ROOT, 'public', 'content')
const AUTHORED = new Set(['.mdx', '.md'])

let copied = 0

function sync(from, to) {
  if (!fs.existsSync(from)) return

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)

    if (entry.isDirectory()) {
      sync(src, dest)
      continue
    }
    if (AUTHORED.has(path.extname(entry.name).toLowerCase())) continue

    fs.mkdirSync(to, { recursive: true })
    fs.copyFileSync(src, dest)
    copied++
  }
}

// Rebuild from scratch, so deleting an asset also removes the served copy.
fs.rmSync(DEST, { recursive: true, force: true })
sync(SRC, DEST)

console.log(`content assets → public/content: ${copied} file${copied === 1 ? '' : 's'}`)
