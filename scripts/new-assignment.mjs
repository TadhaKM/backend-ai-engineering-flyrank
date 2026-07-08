#!/usr/bin/env node
/**
 * Scaffold a new assignment from templates/assignment/.
 *
 * Usage:
 *   npm run new:assignment -- --week 2         -> assignments/week-02/assignment-02
 *   npm run new:assignment -- --week 2 rag     -> assignments/week-02/02-rag
 *
 * `--week` is required: every assignment lives inside a week folder.
 * Assignment numbers are a single global sequence across all weeks — the next
 * number is (highest existing anywhere) + 1, so numbers are never reused.
 *
 * Default naming is `assignment-NN` (zero-padded, so folders keep sorting past
 * 10). Pass a kebab-case name only when the assignment has a meaningful topic.
 *
 * Replaces the __WEEK__ / __FOLDER__ / __NUMBER__ / __SLUG__ / __TITLE__ /
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
const WEEK_DIR_RE = /^week-(\d+)$/;

const USAGE = [
  'Usage:',
  '  npm run new:assignment -- --week <n> [name]',
  '',
  'Examples:',
  '  npm run new:assignment -- --week 2         -> assignments/week-02/assignment-02',
  '  npm run new:assignment -- --week 2 rag     -> assignments/week-02/02-rag',
].join('\n');

function fail(message) {
  console.error(`\n✖ ${message}\n\n${USAGE}\n`);
  process.exit(1);
}

/** Turn a kebab-case slug into a human title, e.g. "rag-pipeline" -> "Rag Pipeline". */
function toTitle(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Parse `--week N` / `--week=N` plus an optional positional name. */
function parseArgs(argv) {
  let week;
  let name;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--week') {
      week = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--week=')) {
      week = arg.slice('--week='.length);
    } else if (!arg.startsWith('-') && name === undefined) {
      name = arg;
    }
  }
  return { week, name };
}

/**
 * Highest assignment number across EVERY week, or 0 if none.
 * Numbers are a single global sequence, so this must look inside each
 * `week-NN/` folder — a top-level scan would silently reuse numbers.
 * Recognises both `NN-slug` and `assignment-NN` folder names.
 */
async function highestNumber() {
  const weeks = await readdir(ASSIGNMENTS_DIR, { withFileTypes: true });
  let max = 0;
  for (const week of weeks) {
    if (!week.isDirectory() || !WEEK_DIR_RE.test(week.name)) continue;
    const entries = await readdir(join(ASSIGNMENTS_DIR, week.name), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = /^(\d+)-/.exec(entry.name) ?? /^assignment-(\d+)$/.exec(entry.name);
      if (match) max = Math.max(max, Number(match[1]));
    }
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

  const { week: weekArg, name: named } = parseArgs(process.argv.slice(2));

  if (!weekArg) fail('Missing required --week <n>.');
  if (!/^\d{1,2}$/.test(weekArg) || Number(weekArg) < 1) {
    fail(`Invalid week "${weekArg}". Use a number, e.g. --week 2.`);
  }
  const weekName = `week-${String(Number(weekArg)).padStart(2, '0')}`;
  const weekDir = join(ASSIGNMENTS_DIR, weekName);
  await mkdir(weekDir, { recursive: true }); // harmless if it already exists

  const number = String((await highestNumber()) + 1).padStart(2, '0');

  let folderName;
  let slug;
  let title;

  if (named !== undefined) {
    // Explicit topic name -> `NN-slug` (e.g. `02-rag`).
    const lowered = named.trim().toLowerCase();
    if (!SLUG_RE.test(lowered)) {
      fail(`Invalid name "${named}". Use lowercase letters, numbers, and single dashes.`);
    }
    slug = lowered;
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

  const dest = join(weekDir, folderName);
  if (existsSync(dest)) {
    fail(`${relative(ROOT, dest)} already exists — never overwrite an assignment.`);
  }

  const tokens = {
    // __WEEK__ / __FOLDER__ must be distinct from __NUMBER__/__SLUG__: templates
    // can't compose the path, since the folder is not always `NN-slug`.
    __WEEK__: weekName,
    __FOLDER__: folderName,
    __NUMBER__: number,
    __SLUG__: slug,
    __TITLE__: title,
    __PACKAGE__: `@flyrank/${folderName}`,
  };

  await copyWithTokens(TEMPLATE_DIR, dest, tokens);

  const created = await stat(dest);
  if (!created.isDirectory()) fail('Copy failed unexpectedly.');

  const rel = `assignments/${weekName}/${folderName}`;
  console.log(`\n✔ Created ${rel}\n`);
  console.log('Next steps:');
  console.log('  1. npm install                      # link the new workspace');
  console.log(`  2. cd ${rel}`);
  console.log('  3. cp .env.example .env             # then fill in real values');
  console.log('  4. npm run dev');
  console.log("\nDon't forget to add a row to the progress tables in");
  console.log('  README.md and assignments/README.md\n');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
