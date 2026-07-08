#!/usr/bin/env node
/**
 * Scaffold a new assignment from templates/assignment/.
 *
 * Usage:
 *   npm run new:assignment              -> assignments/assignment-02   (default)
 *   npm run new:assignment -- rag       -> assignments/02-rag          (named)
 *
 * Default naming is `assignment-NN` (zero-padded, so folders keep sorting past
 * 10). Pass a kebab-case name only when the assignment has a meaningful topic.
 *
 * It picks the next number automatically (highest existing + 1), copies the
 * template, and replaces the __NUMBER__ / __SLUG__ / __TITLE__ / __FOLDER__ /
 * __PACKAGE__ tokens. It never touches an existing assignment.
 *
 * Zero dependencies — Node built-ins only.
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'templates', 'assignment');
const ASSIGNMENTS_DIR = join(ROOT, 'assignments');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Turn a kebab-case slug into a human title, e.g. "rag-pipeline" -> "Rag Pipeline". */
function toTitle(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Highest existing assignment number, or 0 if none.
 * Recognises BOTH folder conventions: `NN-slug` (e.g. `01-ai-core`) and the
 * default `assignment-NN`. Missing the second form would make the generator
 * re-use a number and collide.
 */
async function highestNumber() {
  const entries = await readdir(ASSIGNMENTS_DIR, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^(\d+)-/.exec(entry.name) ?? /^assignment-(\d+)$/.exec(entry.name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** Recursively copy `src` -> `dest`, replacing template tokens in file contents. */
async function copyWithTokens(src, dest, tokens) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyWithTokens(from, to, tokens);
    } else {
      let content = await readFile(from, 'utf8');
      for (const [token, value] of Object.entries(tokens)) {
        content = content.split(token).join(value);
      }
      await writeFile(to, content);
    }
  }
}

async function main() {
  if (!existsSync(TEMPLATE_DIR)) {
    fail(`Template not found at ${relative(ROOT, TEMPLATE_DIR)}`);
  }
  if (!existsSync(ASSIGNMENTS_DIR)) {
    await mkdir(ASSIGNMENTS_DIR, { recursive: true });
  }

  const number = String((await highestNumber()) + 1).padStart(2, '0');
  const named = process.argv[2]?.trim().toLowerCase();

  let folderName;
  let slug;
  let title;

  if (named) {
    // Explicit topic name -> `NN-slug` (e.g. `02-rag`).
    if (!SLUG_RE.test(named)) {
      fail(`Invalid name "${named}". Use lowercase letters, numbers, and single dashes.`);
    }
    slug = named;
    folderName = `${number}-${slug}`;
    title = toTitle(slug);
  } else {
    // Default -> `assignment-NN`. __TITLE__ is the *topic*, and templates already
    // render it as "Assignment NN — __TITLE__", so use a fill-me-in placeholder
    // rather than repeating the number.
    slug = `assignment-${number}`;
    folderName = slug;
    title = 'TBD';
  }

  const dest = join(ASSIGNMENTS_DIR, folderName);
  if (existsSync(dest)) {
    fail(`${relative(ROOT, dest)} already exists — never overwrite an assignment.`);
  }

  const tokens = {
    // __FOLDER__ must be distinct from __NUMBER__/__SLUG__: under the default
    // naming the folder is NOT `NN-slug`, so templates reference __FOLDER__.
    __FOLDER__: folderName,
    __NUMBER__: number,
    __SLUG__: slug,
    __TITLE__: title,
    __PACKAGE__: `@flyrank/${folderName}`,
  };

  await copyWithTokens(TEMPLATE_DIR, dest, tokens);

  const created = await stat(dest);
  if (!created.isDirectory()) fail('Copy failed unexpectedly.');

  console.log(`\n✔ Created assignments/${folderName}\n`);
  console.log('Next steps:');
  console.log('  1. npm install                      # link the new workspace');
  console.log(`  2. cd assignments/${folderName}`);
  console.log('  3. cp .env.example .env             # then fill in real values');
  console.log('  4. npm run dev');
  console.log("\nDon't forget to add a row to the progress tables in");
  console.log('  README.md and assignments/README.md\n');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
