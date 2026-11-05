#!/usr/bin/env node
// Pulls BizPeel's public startups export and renders the README and category
// tables from it, writing only the files whose content changed.
//
//   node scripts/update.mjs                     # BIZPEEL_EXPORT_URL + BIZPEEL_EXPORT_TOKEN
//   node scripts/update.mjs --input export.json # a local copy of the export
//
// Options: --input <file>, --site <base> (default https://bizpeel.com),
// --out <dir> (default: the repository root).
//
// Without --input and without both environment variables the run is a no-op
// that prints a warning, so the scheduled workflow stays green until the
// export is configured. The URL and the token are never printed.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { DEFAULT_SITE, renderAll } from './render.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FETCH_TIMEOUT_MS = 60_000;
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
/** The run fails when the export has more than this share fewer rows. */
const MAX_ROW_DROP = 0.2;

const BANDS = ['lt10k', '10k-30k', '30k-50k', '50k-100k', 'gte100k'];
const GROWTH = ['surging', 'up', 'flat', 'down'];
const ROLES = ['founder', 'official'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Category keys become file names, so they stay this narrow. */
const CATEGORY_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9._~%/-]*$/;
const HANDLE = /^[A-Za-z0-9_]{1,50}$/;

// The export's own figure check (`carriesFigure` in BizPeel's
// src/contracts/public-export.ts), repeated here so a server mistake cannot
// publish a figure: currency, shares, multiples and magnitudes in either
// language, and any number other than a year or a single digit ("8 plays",
// "top 5"). Keep the two in step.
const FIGURE_MARKS =
  /[$¥€£￥₩₹%％×倍百千万亿]|美元|美金|人民币|位数|\b(?:usd|dollars?|percent|hundred|thousand|million|billion)\b|\b(?:two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)-?fold\b|\d\s*-?fold\b|\b(?:three|four|five|six|seven|eight|nine)-figures?\b/i;
/**
 * Other currencies, and shares or changes said in words: "half its visits",
 * "a third of search traffic", "revenue halved", "doubled", 一半, 减半, 三成,
 * 三分之一. "Half a year" and "third-party" are not shares.
 */
const WORD_FIGURES =
  /\b(?:eur|euros?|gbp|bucks|yuan|rmb|cny|jpy|yen)\b|欧元|英镑|日元|块钱|[0-9０-９一二两三四五六七八九十]\s*[元刀]|\bhal(?:f|ves?|ved|ving)\b(?!\s+(?:an?\s+|the\s+)?(?:years?|months?|weeks?|days?|decades?|hours?)\b)|\b(?:a|one|two)[- ]thirds?\b(?!-part)|\bthirds\b|\b(?:a|one|three)[- ]quarters?\s+of\b|\bthree[- ]quarters\b|\b(?:doubled|doubling|tripled|tripling|quadrupled)\b|\btwice\s+(?:as|the)\b|一半|半数|过半|减半|翻番|翻了一番|分之|[一二两三四五六七八九十几]成(?![功为本果立长员交])/i;
/**
 * A digit with a unit that makes it a traffic or business figure: session
 * time ("5 minutes per session", 5分钟) or a count of keywords, visits,
 * users, customers and the like ("2 ranking US keywords", 2 个关键词).
 * "8 plays" / 8 条 stay: the plays count is public.
 */
const MEASURED_DIGIT =
  /\d\s*-?\s*(?:min(?:ute)?s?|sec(?:ond)?s?|hours?|hrs?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)[- ](?:minutes?|seconds?|hours?)\b|\d\s+(?!plays?\b)(?:[A-Za-z-]+\s+){0,2}(?:keywords?|rankings?|visits?|visitors?|sessions?|page\s?views?|users?|customers?|clients?|subscribers?|sign-?ups?|followers?|downloads?|installs?|backlinks?|reviews?)\b|\d\s*(?:分钟|秒|小时)|\d\s*[个位名次]?\s*(?:关键词|访问|访客|用户|客户|订阅|粉丝|下载|安装|外链|评价|评论)/i;
const NUMBER = /[0-9０-９][0-9０-９,，.．]*/g;
const YEAR = /^(?:19|20)\d{2}$/;
/**
 * "5k", "2M", "3B", "5x", "5MM", "5bn", "9+": a digit with a magnitude,
 * multiple or plus.
 */
const MAGNITUDE_SUFFIX = /^\s?(?:(?:mm|bn|mn|[kmbx])(?![a-z])|\+)/i;

/**
 * GitHub turns a bare URL, `www.` host or email address into a live link
 * even when it is escaped, so free text carrying one is left out.
 */
const LINKISH = /:\/\/|\bwww\.|[^\s@]@[^\s@]+\.[A-Za-z]/i;

/** Text the tables may not show: a figure, or something GitHub would link. */
function unsafeText(text) {
  return carriesFigure(text) || LINKISH.test(text);
}

/** Whether a text carries a money figure, share, count or growth rate. */
export function carriesFigure(text) {
  if (
    FIGURE_MARKS.test(text) ||
    WORD_FIGURES.test(text) ||
    MEASURED_DIGIT.test(text)
  ) {
    return true;
  }
  for (const match of text.matchAll(NUMBER)) {
    const token = match[0]
      .replace(/[０-９]/g, (digit) =>
        String.fromCharCode(digit.charCodeAt(0) - 0xfee0)
      )
      .replace(/[,，.．]+$/, '');
    if (YEAR.test(token)) continue;
    if (!/^\d$/.test(token)) return true;
    const after = text.slice(match.index + match[0].length);
    if (MAGNITUDE_SUFFIX.test(after)) return true;
  }
  return false;
}
/** Files this script owns under categories/. */
const CATEGORY_FILE = /^[a-z0-9][a-z0-9-]{0,63}(?:\.zh-(?:CN|TW))?\.md$/;

const TOP_KEYS = [
  'version',
  'generatedAt',
  'dataAsOf',
  'revenueColumns',
  'total',
  'categories',
  'startups',
];
const ROW_KEYS = [
  'slug',
  'name',
  'domain',
  'reportPath',
  'logoPath',
  'category',
  'mrrBand',
  'growth',
  'channels',
  'productHunt',
  'builder',
  'question',
  'playsCount',
  'addedAt',
];

export class ExportError extends Error {}

// ---------------------------------------------------------------------------
// Validation

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path, expected) {
  throw new ExportError(`Invalid export: ${path} must be ${expected}`);
}

function text(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, 'a non-empty string');
  }
  return value;
}

function nullable(value, path, check) {
  return value === null ? null : check(value, path);
}

function oneOf(values) {
  return (value, path) => {
    if (!values.includes(value)) fail(path, `one of ${values.join(', ')}`);
    return value;
  };
}

function date(value, path) {
  if (typeof value !== 'string' || !DATE.test(value)) fail(path, 'YYYY-MM-DD');
  return value;
}

function count(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    fail(path, 'a non-negative integer');
  }
  return value;
}

function sitePath(value, path) {
  if (typeof value !== 'string' || !SITE_PATH.test(value)) {
    fail(path, 'a site-relative path');
  }
  return value;
}

function labels(value, path) {
  if (!isObject(value)) fail(path, 'an object with en and zh');
  return { en: text(value.en, `${path}.en`), zh: text(value.zh, `${path}.zh`) };
}

function category(value, path) {
  if (!isObject(value)) fail(path, 'an object');
  const key = text(value.key, `${path}.key`);
  if (!CATEGORY_KEY.test(key)) fail(`${path}.key`, 'a lowercase slug');
  return { key, ...labels(value, path) };
}

function noteUnknown(value, known, path, unknown) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) unknown.add(`${path}.${key}`);
  }
}

function row(value, index, warnings, unknown, revenueColumns) {
  const path = `startups[${index}]`;
  if (!isObject(value)) fail(path, 'an object');
  noteUnknown(value, ROW_KEYS, 'startups[]', unknown);

  const slug = text(value.slug, `${path}.slug`);
  const name = text(value.name, `${path}.name`);
  nullable(value.domain, `${path}.domain`, text);
  const reportPath = sitePath(value.reportPath, `${path}.reportPath`);

  let logoPath = nullable(value.logoPath, `${path}.logoPath`, (v, p) => {
    if (typeof v !== 'string') fail(p, 'a string or null');
    return v;
  });
  if (logoPath !== null && !SITE_PATH.test(logoPath)) {
    warnings.push(`${slug}: logo path is not site-relative; logo left out`);
    logoPath = null;
  }

  const mrrBand = nullable(value.mrrBand, `${path}.mrrBand`, oneOf(BANDS));
  const growth = nullable(value.growth, `${path}.growth`, oneOf(GROWTH));

  if (!Array.isArray(value.channels)) fail(`${path}.channels`, 'an array');
  const channels = value.channels.map((channel, i) => {
    const channelPath = `${path}.channels[${i}]`;
    if (!isObject(channel)) fail(channelPath, 'an object');
    noteUnknown(
      channel,
      ['en', 'zh', 'icons'],
      'startups[].channels[]',
      unknown
    );
    if (
      !Array.isArray(channel.icons) ||
      !channel.icons.every((icon) => typeof icon === 'string')
    ) {
      fail(`${channelPath}.icons`, 'an array of strings');
    }
    return labels(channel, channelPath);
  });
  // A channel name with a figure in it would publish a share or a price.
  const channelCount = channels.length;
  for (let i = channels.length - 1; i >= 0; i--) {
    if (unsafeText(channels[i].en) || unsafeText(channels[i].zh)) {
      channels.splice(i, 1);
    }
  }
  if (channels.length < channelCount) {
    warnings.push(
      `${slug}: a channel name carries a figure or a link; channel left out`
    );
  }
  if (channels.length > 2) {
    warnings.push(`${slug}: more than two channels; showing the first two`);
  }

  if (typeof value.productHunt !== 'boolean') {
    fail(`${path}.productHunt`, 'a boolean');
  }

  let builder = nullable(value.builder, `${path}.builder`, (v, p) => {
    if (!isObject(v)) fail(p, 'an object or null');
    noteUnknown(
      v,
      ['platform', 'handle', 'followers', 'role'],
      'startups[].builder',
      unknown
    );
    oneOf(['x'])(v.platform, `${p}.platform`);
    oneOf(ROLES)(v.role, `${p}.role`);
    const followers = nullable(v.followers, `${p}.followers`, (f, fp) => {
      if (typeof f !== 'number' || !Number.isFinite(f) || f < 0) {
        fail(fp, 'a non-negative number or null');
      }
      return f;
    });
    return { handle: text(v.handle, `${p}.handle`), followers, role: v.role };
  });
  if (builder && !HANDLE.test(builder.handle)) {
    warnings.push(
      `${slug}: builder handle is not an X handle; builder left out`
    );
    builder = null;
  }

  let question = nullable(value.question, `${path}.question`, labels);
  // The export already drops questions that carry a figure; this repeats the
  // check so a server mistake cannot publish one.
  if (question && (unsafeText(question.en) || unsafeText(question.zh))) {
    warnings.push(
      `${slug}: question carries a figure or a link; question left out`
    );
    question = null;
  }

  return {
    slug,
    name,
    reportPath,
    logoPath,
    category: nullable(value.category, `${path}.category`, (v, p) => {
      if (isObject(v))
        noteUnknown(v, ['key', 'en', 'zh'], 'startups[].category', unknown);
      return category(v, p);
    }),
    mrrBand: revenueColumns ? mrrBand : null,
    growth: revenueColumns ? growth : null,
    channels: channels.slice(0, 2),
    productHunt: value.productHunt,
    builder,
    question,
    playsCount: nullable(value.playsCount, `${path}.playsCount`, count),
    addedAt: nullable(value.addedAt, `${path}.addedAt`, date),
  };
}

/**
 * Checks the export against the contract and keeps only the fields the
 * tables use. Anything else in the payload is dropped here and named in a
 * warning (by field name only), so it can never reach a rendered file.
 */
export function validateExport(raw) {
  if (!isObject(raw)) fail('the export', 'a JSON object');
  if (raw.version !== 1) {
    throw new ExportError('Unsupported export version (expected 1)');
  }
  const warnings = [];
  const unknown = new Set();
  noteUnknown(raw, TOP_KEYS, 'export', unknown);

  text(raw.generatedAt, 'generatedAt');
  const dataAsOf = nullable(raw.dataAsOf, 'dataAsOf', date);
  if (typeof raw.revenueColumns !== 'boolean') {
    fail('revenueColumns', 'a boolean');
  }
  const total = count(raw.total, 'total');

  if (!Array.isArray(raw.categories)) fail('categories', 'an array');
  const categories = raw.categories.map((value, i) => {
    const c = category(value, `categories[${i}]`);
    noteUnknown(value, ['key', 'en', 'zh', 'count'], 'categories[]', unknown);
    count(value.count, `categories[${i}].count`);
    return c;
  });

  if (!Array.isArray(raw.startups)) fail('startups', 'an array');
  if (raw.startups.length !== total) {
    throw new ExportError(
      `Invalid export: total is ${total} but startups has ${raw.startups.length} rows`
    );
  }
  const startups = raw.startups.map((value, i) =>
    row(value, i, warnings, unknown, raw.revenueColumns)
  );

  const slugs = new Set();
  for (const startup of startups) {
    if (slugs.has(startup.slug)) {
      throw new ExportError(`Invalid export: duplicate slug ${startup.slug}`);
    }
    slugs.add(startup.slug);
  }

  if (unknown.size) {
    warnings.push(
      `Export has fields the tables do not use, ignored: ${[...unknown].join(', ')}`
    );
  }
  return {
    data: {
      dataAsOf,
      revenueColumns: raw.revenueColumns,
      categories,
      startups,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Row-count guard

/** The row count recorded in a rendered README, or null. */
export function readRowsMarker(readme) {
  const match = /<!--\s*rows:\s*(\d+)\s*-->/.exec(readme ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Refuses an empty export, or one with more than 20% fewer rows than the
 * tables already committed.
 */
export function checkRowGuard(rows, previousRows) {
  if (rows === 0) {
    throw new ExportError('The export has no startups; tables left untouched');
  }
  if (previousRows !== null && rows < previousRows * (1 - MAX_ROW_DROP)) {
    throw new ExportError(
      `The export has ${rows} startups, more than 20% fewer than the ${previousRows} in the committed tables; tables left untouched`
    );
  }
}

// ---------------------------------------------------------------------------
// Fetching

async function fetchExport(rawUrl, token) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExportError('BIZPEEL_EXPORT_URL is not a valid URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ExportError('BIZPEEL_EXPORT_URL must be an https URL');
  }
  if (url.username || url.password) {
    throw new ExportError('BIZPEEL_EXPORT_URL must not contain credentials');
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      // A redirect could carry the token elsewhere; the export never redirects.
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    // Network errors can quote the host or URL, so only a code is reported.
    const code = [error?.cause?.code, error?.cause?.name, error?.name].find(
      (value) => typeof value === 'string' && /^[A-Za-z_]+$/.test(value)
    );
    throw new ExportError(`Export request failed (${code ?? 'network error'})`);
  }
  if (!response.ok) {
    throw new ExportError(`Export request failed with HTTP ${response.status}`);
  }
  const body = await response.text();
  if (body.length > MAX_EXPORT_BYTES) {
    throw new ExportError('Export response is larger than expected');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ExportError('Export response is not valid JSON');
  }
}

function readInput(file) {
  let body;
  try {
    body = readFileSync(file, 'utf8');
  } catch {
    throw new ExportError(`Cannot read --input ${file}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ExportError(`--input ${file} is not valid JSON`);
  }
}

// ---------------------------------------------------------------------------
// Writing

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Works out which files to write and which stale category files to remove. */
export function planWrites(outDir, files) {
  const writes = [];
  const unchanged = [];
  for (const [path, content] of files) {
    const target = resolve(outDir, path);
    if (!target.startsWith(outDir + sep)) {
      throw new ExportError(`Refusing to write outside ${outDir}`);
    }
    if (readIfExists(target) === content) unchanged.push(path);
    else writes.push({ path, target, content });
  }
  const deletes = [];
  const categoriesDir = join(outDir, 'categories');
  if (existsSync(categoriesDir)) {
    for (const name of readdirSync(categoriesDir).sort()) {
      const path = `categories/${name}`;
      if (CATEGORY_FILE.test(name) && !files.has(path)) {
        deletes.push({ path, target: join(categoriesDir, name) });
      }
    }
  }
  return { writes, unchanged, deletes };
}

function applyPlan({ writes, deletes }) {
  for (const { target, content } of writes) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  for (const { target } of deletes) rmSync(target);
}

// ---------------------------------------------------------------------------
// CLI

function siteBase(site) {
  let url;
  try {
    url = new URL(site);
  } catch {
    throw new ExportError('--site must be a URL such as https://bizpeel.com');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ExportError('--site must be an http(s) URL');
  }
  return url.origin;
}

/**
 * A GitHub Actions annotation. Messages can quote export data (a slug, a
 * field name), so `%`, CR and LF are escaped: a newline in the data must not
 * start a workflow command of its own.
 */
function annotate(level, message) {
  const escaped = String(message)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  console.log(`::${level}::${escaped}`);
}

function setOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  appendFileSync(
    file,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  );
}

const HELP = `Usage: node scripts/update.mjs [--input <file.json>] [--site <base>] [--out <dir>]

Reads the export from BIZPEEL_EXPORT_URL with BIZPEEL_EXPORT_TOKEN, or from
--input, and renders README.md, README.zh-CN.md and categories/*.md.`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      site: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const site = siteBase(values.site ?? DEFAULT_SITE);
  const outDir = resolve(values.out ?? REPO_ROOT);

  let raw;
  if (values.input) {
    raw = readInput(resolve(values.input));
  } else {
    const url = env.BIZPEEL_EXPORT_URL?.trim();
    const token = env.BIZPEEL_EXPORT_TOKEN?.trim();
    if (!url || !token) {
      console.log(
        '::warning::BIZPEEL_EXPORT_URL or BIZPEEL_EXPORT_TOKEN is not set; skipping the update and leaving the tables as they are.'
      );
      return 0;
    }
    raw = await fetchExport(url, token);
  }

  const { data, warnings } = validateExport(raw);
  for (const warning of warnings) annotate('warning', warning);

  const rows = data.startups.length;
  const previousRows = readRowsMarker(readIfExists(join(outDir, 'README.md')));
  checkRowGuard(rows, previousRows);

  const plan = planWrites(outDir, renderAll(data, { site }));
  applyPlan(plan);

  for (const { path } of plan.writes) console.log(`Wrote ${path}`);
  for (const { path } of plan.deletes) console.log(`Removed ${path}`);
  const changed = plan.writes.length + plan.deletes.length > 0;
  console.log(
    `${rows} startups, data as of ${data.dataAsOf ?? 'n/a'}: ${plan.writes.length} written, ${plan.deletes.length} removed, ${plan.unchanged.length} unchanged`
  );
  setOutputs({
    rows,
    data_as_of: data.dataAsOf ?? 'n/a',
    changed,
  });
  return 0;
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return (
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      if (
        error instanceof ExportError ||
        String(error?.code).startsWith('ERR_PARSE_ARGS')
      ) {
        annotate('error', error.message);
      } else {
        // Unexpected: name the error type only, never a message that could
        // quote the input. DEBUG_UPDATE=1 prints the stack for local runs.
        annotate(
          'error',
          `Update failed unexpectedly (${error?.name ?? 'Error'})`
        );
        if (process.env.DEBUG_UPDATE === '1') console.error(error);
      }
      process.exitCode = 1;
    }
  );
}
