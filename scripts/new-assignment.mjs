#!/usr/bin/env node
/**
 * Scaffold a new assignment from templates/assignment/.
 *
 * Usage:
 *   npm run new:assignment -- <slug>     e.g. npm run new:assignment -- rag
 *   npm run new:assignment               (prompts for a slug interactively)
 *
 * It picks the next number automatically (highest existing + 1), copies the
 * template, and replaces the __NUMBER__ / __SLUG__ / __TITLE__ / __PACKAGE__
 * tokens. It never touches an existing assignment.
 *
 * Zero dependencies — Node built-ins only.
 */
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

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

/** Highest existing assignment number, or 0 if none. */
async function highestNumber() {
  const entries = await readdir(ASSIGNMENTS_DIR, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = /^(\d+)-/.exec(entry.name);
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

async function resolveSlug() {
  const argSlug = process.argv[2];
  if (argSlug) return argSlug.trim().toLowerCase();

  if (!process.stdin.isTTY) {
    fail('No slug provided. Usage: npm run new:assignment -- <slug>');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Assignment slug (kebab-case, e.g. "rag"): ');
  rl.close();
  return answer.trim().toLowerCase();
}

async function main() {
  if (!existsSync(TEMPLATE_DIR)) {
    fail(`Template not found at ${relative(ROOT, TEMPLATE_DIR)}`);
  }
  if (!existsSync(ASSIGNMENTS_DIR)) {
    await mkdir(ASSIGNMENTS_DIR, { recursive: true });
  }

  const slug = await resolveSlug();
  if (!slug) fail('A slug is required.');
  if (!SLUG_RE.test(slug)) {
    fail(`Invalid slug "${slug}". Use lowercase letters, numbers, and single dashes.`);
  }

  const number = String((await highestNumber()) + 1).padStart(2, '0');
  const folderName = `${number}-${slug}`;
  const dest = join(ASSIGNMENTS_DIR, folderName);

  if (existsSync(dest)) {
    fail(`${relative(ROOT, dest)} already exists — never overwrite an assignment.`);
  }

  const tokens = {
    __NUMBER__: number,
    __SLUG__: slug,
    __TITLE__: toTitle(slug),
    __PACKAGE__: `@flyrank/${folderName}`,
  };

  await copyWithTokens(TEMPLATE_DIR, dest, tokens);

  // Sanity check the copy produced files.
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
