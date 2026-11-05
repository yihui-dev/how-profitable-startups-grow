// Pure rendering: a validated export in, Markdown files out.
//
// Nothing here reads the clock, the network or the disk, so the same export
// always renders the same bytes and an unchanged week commits nothing.

import { toTraditional } from './s2t.mjs';
import { LANGS, MARKS, STRINGS } from './strings.mjs';

export const DEFAULT_SITE = 'https://bizpeel.com';
export const TOP_LIMIT = 100;
export const FASTEST_LIMIT = 30;
export const RECENT_LIMIT = 20;

const UTM = {
  utm_source: 'github',
  utm_medium: 'readme',
  utm_campaign: 'how-profitable-startups-grow',
};
const EMPTY = '—';
const BADGE_COLORS = {
  startups: '1f2937',
  dataAsOf: '0e7490',
  updated: '15803d',
};

// ---------------------------------------------------------------------------
// Escaping and formatting

/**
 * Makes a data string safe inside a Markdown table cell or link text: one
 * line, no table pipes, no HTML, no Markdown emphasis, links or math.
 */
export function escapeText(value) {
  return (
    String(value)
      // Newlines and other whitespace would end the table row.
      .replace(/\s+/gu, ' ')
      // Control characters and bidirectional overrides render invisibly.
      .replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, '')
      .replace(/ {2,}/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[\\`*_[\]|~$]/g, (c) => `\\${c}`)
      .trim()
  );
}

/** Escapes a value for a double-quoted HTML attribute. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 1234567 → "1,234,567", independent of the machine's locale. */
export function formatCount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Rounds a non-negative count to two significant digits. */
export function roundSignificant(n) {
  const value = Math.max(0, Math.round(n));
  if (value < 100) return value;
  const step = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / step) * step;
}

/** Followers as 530, 12K, 1.2M. */
export function formatFollowers(n) {
  const value = roundSignificant(n);
  /** @type {[number, string][]} */
  const units = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size;
      const text = Number.isInteger(scaled)
        ? String(scaled)
        : scaled.toFixed(1).replace(/\.0$/, '');
      return `${text}${suffix}`;
    }
  }
  return String(value);
}

/** The fragment GitHub gives a heading (the github-slugger rules). */
export function anchor(heading) {
  return `#${heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-')}`;
}

/** Plain code-unit comparison: the same order on every machine. */
function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Links

function siteUrl(ctx, path, params) {
  const url = new URL(path, ctx.base);
  if (url.origin !== ctx.base.origin) {
    throw new Error('A site path resolved outside the site');
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.href;
}

function reportUrl(ctx, startup, section) {
  return siteUrl(ctx, `${ctx.t.sitePrefix}${startup.reportPath}`, {
    ...UTM,
    utm_content: section,
  });
}

function libraryUrl(ctx, section, filters = {}) {
  return siteUrl(ctx, `${ctx.t.sitePrefix}/library`, {
    ...filters,
    ...UTM,
    utm_content: section,
  });
}

function homeUrl(ctx, section) {
  return siteUrl(ctx, ctx.t.sitePrefix || '/', {
    ...UTM,
    utm_content: section,
  });
}

function contactUrl(ctx, section) {
  return siteUrl(ctx, `${ctx.t.sitePrefix}/contact`, {
    ...UTM,
    utm_content: section,
  });
}

function logoUrl(ctx, logoPath) {
  return siteUrl(ctx, logoPath, {});
}

/** A shields.io static badge. */
function badgeUrl(label, message, color) {
  const part = (text) =>
    encodeURIComponent(String(text).replace(/-/g, '--').replace(/_/g, '__'));
  return new URL(
    `/badge/${part(label)}-${part(message)}-${color}`,
    'https://img.shields.io'
  ).href;
}

function xUrl(handle) {
  const url = new URL('https://x.com/');
  url.pathname = `/${handle}`;
  return url.href;
}

function link(text, href) {
  return `[${text}](${href})`;
}

// ---------------------------------------------------------------------------
// Tables

/**
 * Keeps a short, already escaped cell on one line. GitHub tables have no
 * column widths: the browser squeezes a column to its narrowest word and
 * wraps "≥ $100K" at the space, "$10K–30K" after the dash and "增长" between
 * the two characters. A no-break space and word joiners remove those breaks.
 */
export function noWrap(text) {
  return text
    .replace(/ /g, '&nbsp;')
    .replace(/([–—-])(?=\S)/g, '$1&#8288;')
    .replace(/(\p{Script=Han})(?=\p{Script=Han})/gu, '$1&#8288;');
}

/** Short labels that read badly when wrapped; long ones may wrap. */
const NO_WRAP_MAX = 12;

function table(head, align, rows) {
  const rule = align.map((a) => {
    if (a === 'right') return '--:';
    if (a === 'center') return ':-:';
    return '---';
  });
  return [head, rule, ...rows]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n');
}

function categoryLabel(ctx, category) {
  if (ctx.lang === 'en') return category.en;
  return ctx.lang === 'zh-TW' ? toTraditional(category.zh) : category.zh;
}

function startupCell(ctx, startup, href) {
  const name = link(escapeText(startup.name), href);
  if (!startup.logoPath) return name;
  const src = escapeAttr(logoUrl(ctx, startup.logoPath));
  return `<img src="${src}" width="16" height="16" alt=""> ${name}`;
}

function channelsCell(ctx, startup) {
  const names = startup.channels.map((channel) =>
    escapeText(
      ctx.lang === 'en'
        ? channel.en
        : ctx.lang === 'zh-TW'
          ? toTraditional(channel.zh)
          : channel.zh
    )
  );
  const text = names.join(' + ');
  if (startup.productHunt) return text ? `${text} 🚀` : '🚀';
  return text || EMPTY;
}

function builderCell(startup) {
  const { builder } = startup;
  if (!builder) return EMPTY;
  const handle = link(`@${escapeText(builder.handle)}`, xUrl(builder.handle));
  if (builder.followers === null) return handle;
  return `${handle} · ${formatFollowers(builder.followers)}`;
}

function answerCell(ctx, startup, href) {
  const action =
    startup.playsCount && startup.playsCount > 0
      ? ctx.t.plays(startup.playsCount)
      : ctx.t.readReport;
  const target = link(action, href);
  if (!startup.question) return target;
  const question =
    ctx.lang === 'en'
      ? startup.question.en
      : ctx.lang === 'zh-TW'
        ? toTraditional(startup.question.zh)
        : startup.question.zh;
  return `${escapeText(question)} → ${target}`;
}

/**
 * A table of startups. `lead` is the first column: a rank or the added date.
 * `categoryHref` turns the category cell into a link; without it the column
 * is left out (category pages).
 * @param {any} ctx
 * @param {any[]} startups
 * @param {{
 *   section: string,
 *   lead: 'rank' | 'added',
 *   categoryHref?: (key: string) => string,
 * }} options
 */
function startupTable(ctx, startups, { section, lead, categoryHref }) {
  const c = ctx.t.columns;
  const head = [lead === 'added' ? c.added : c.rank, c.startup];
  const align = [lead === 'added' ? 'left' : 'right', 'left'];
  if (ctx.revenueColumns) {
    head.push(c.mrr, c.growth);
    align.push('left', 'center');
  }
  if (categoryHref) {
    head.push(c.category);
    align.push('left');
  }
  head.push(c.builder, c.answers);
  align.push('left', 'left');
  // Headers are fixed strings; short ones ("增长", "MRR") never wrap.
  for (const [i, label] of head.entries()) {
    if ([...label].length <= NO_WRAP_MAX) head[i] = noWrap(label);
  }

  const rows = startups.map((startup, index) => {
    const href = reportUrl(ctx, startup, section);
    const cells = [
      lead === 'added' ? startup.addedAt : String(index + 1),
      startupCell(ctx, startup, href),
    ];
    if (ctx.revenueColumns) {
      cells.push(
        noWrap(MARKS.bands[startup.mrrBand] ?? EMPTY),
        MARKS.growth[startup.growth] ?? EMPTY
      );
    }
    if (categoryHref) {
      const label = startup.category
        ? categoryLabel(ctx, startup.category)
        : '';
      cells.push(
        startup.category
          ? link(
              [...label].length <= NO_WRAP_MAX
                ? noWrap(escapeText(label))
                : escapeText(label),
              categoryHref(startup.category.key)
            )
          : EMPTY
      );
    }
    cells.push(builderCell(startup), answerCell(ctx, startup, href));
    return cells;
  });
  return table(head, align, rows);
}

// ---------------------------------------------------------------------------
// Row selection

function byName(a, b) {
  return (
    compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
    compareText(a.slug, b.slug)
  );
}

/** The top table: export order (fresh MRR first), or by name when revenue is off. */
function topRows(ctx) {
  const rows = ctx.revenueColumns
    ? [...ctx.startups]
    : [...ctx.startups].sort(byName);
  return rows.slice(0, TOP_LIMIT);
}

function fastestRows(ctx) {
  return ctx.startups
    .filter((startup) => startup.growth === 'surging')
    .slice(0, FASTEST_LIMIT);
}

function recentRows(ctx) {
  return ctx.startups
    .map((startup, index) => ({ startup, index }))
    .filter(({ startup }) => startup.addedAt)
    .sort(
      (a, b) =>
        compareText(b.startup.addedAt, a.startup.addedAt) || a.index - b.index
    )
    .slice(0, RECENT_LIMIT)
    .map(({ startup }) => startup);
}

/** Categories that have rows, largest first, with their rows in table order. */
export function groupCategories(data) {
  const labels = new Map(data.categories.map((c) => [c.key, c]));
  const groups = new Map();
  const ordered = data.revenueColumns
    ? data.startups
    : [...data.startups].sort(byName);
  for (const startup of ordered) {
    if (!startup.category) continue;
    const { key } = startup.category;
    if (!groups.has(key)) {
      const label = labels.get(key) ?? startup.category;
      groups.set(key, { key, en: label.en, zh: label.zh, startups: [] });
    }
    groups.get(key).startups.push(startup);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.startups.length - a.startups.length ||
      compareText(a.en.toLowerCase(), b.en.toLowerCase()) ||
      compareText(a.key, b.key)
  );
}

// ---------------------------------------------------------------------------
// Pages

function langSwitch(ctx, fileFor) {
  return LANGS.map((lang) =>
    lang === ctx.lang
      ? `**${STRINGS[lang].languageName}**`
      : link(STRINGS[lang].languageName, fileFor(lang))
  ).join(' · ');
}

function readmeFile(lang) {
  return `README${STRINGS[lang].fileSuffix}.md`;
}

function categoryFile(key, lang) {
  return `${key}${STRINGS[lang].fileSuffix}.md`;
}

function dataAsOfText(ctx) {
  return ctx.dataAsOf ?? ctx.t.badges.unknownDate;
}

function badges(ctx) {
  const b = ctx.t.badges;
  const href = libraryUrl(ctx, 'badge');
  const items = [
    [b.startups, formatCount(ctx.total), BADGE_COLORS.startups],
    [b.dataAsOf, dataAsOfText(ctx), BADGE_COLORS.dataAsOf],
    [b.updated, b.weekly, BADGE_COLORS.updated],
  ];
  return items
    .map(
      ([label, message, color]) =>
        `[![${label}: ${message}](${badgeUrl(label, message, color)})](${href})`
    )
    .join(' ');
}

function shortcutsLine(ctx) {
  const items = ctx.t
    .shortcuts(ctx.revenueColumns)
    .map(([label, section, filters]) =>
      link(label, libraryUrl(ctx, section, filters))
    );
  return `**${ctx.t.shortcutsLabel}** ${items.join(" · ")}`;
}

function filterLine(ctx, section, filters) {
  return link(
    ctx.t.filterAll(formatCount(ctx.total), filters?.sort),
    libraryUrl(ctx, section, filters)
  );
}

function howToRead(ctx) {
  const h = ctx.t.howToRead;
  const parts = [
    table(h.columnsHead, ['left', 'left'], h.columns(ctx.revenueColumns)),
  ];
  if (ctx.revenueColumns) {
    parts.push(
      `### ${h.bandsTitle}`,
      table(
        h.bandsHead,
        ['left', 'left'],
        [
          ...MARKS.bandOrder.map((band) => [
            noWrap(MARKS.bands[band]),
            h.bands[band],
          ]),
          [EMPTY, h.unknown],
        ]
      ),
      `### ${h.growthTitle}`,
      table(
        h.growthHead,
        ['center', 'left'],
        [
          ...Object.keys(MARKS.growth).map((g) => [
            MARKS.growth[g],
            h.growth[g],
          ]),
          [EMPTY, h.unknown],
        ]
      )
    );
  }
  return parts;
}

function renderReadme(ctx, groups) {
  const t = ctx.t;
  const s = t.sections;
  const n = formatCount(ctx.total);
  const categoryHref = (key) => `categories/${categoryFile(key, ctx.lang)}`;

  const sections = [];
  const top = topRows(ctx);
  sections.push({
    title: ctx.revenueColumns ? s.top : s.topByName,
    body: [
      ctx.revenueColumns
        ? t.topNote(top.some((startup) => !startup.mrrBand))
        : t.topByNameNote,
      filterLine(ctx, 'top-100', ctx.revenueColumns ? { sort: 'mrr' } : {}),
      startupTable(ctx, top, {
        section: 'top-100',
        lead: 'rank',
        categoryHref,
      }),
      ctx.revenueColumns
        ? t.bottomCta.top(n, libraryUrl(ctx, 'top-100-bottom', { sort: 'mrr' }))
        : t.bottomCta.topByName(n, libraryUrl(ctx, 'top-100-bottom')),
    ],
  });
  if (ctx.revenueColumns) {
    const fastest = fastestRows(ctx);
    sections.push({
      title: s.fastest,
      body: fastest.length
        ? [
            t.fastestNote,
            filterLine(ctx, 'fastest-growing', { sort: 'mrr_growth' }),
            startupTable(ctx, fastest, {
              section: 'fastest-growing',
              lead: 'rank',
              categoryHref,
            }),
            t.bottomCta.fastest(
              n,
              libraryUrl(ctx, 'fastest-growing-bottom', { sort: 'mrr_growth' })
            ),
          ]
        : [t.fastestEmpty],
    });
  }
  const recent = recentRows(ctx);
  if (recent.length) {
    sections.push({
      title: s.recent,
      body: [
        filterLine(ctx, 'recently-added', { sort: 'recent' }),
        startupTable(ctx, recent, {
          section: 'recently-added',
          lead: 'added',
          categoryHref,
        }),
      ],
    });
  }
  if (groups.length) {
    sections.push({
      title: s.categories,
      body: [
        filterLine(ctx, 'by-category'),
        table(
          [t.columns.category, t.columns.startups],
          ['left', 'right'],
          groups.map((group) => [
            link(
              escapeText(categoryLabel(ctx, group)),
              categoryHref(group.key)
            ),
            formatCount(group.startups.length),
          ])
        ),
      ],
    });
  }
  sections.push({ title: s.howToRead, body: howToRead(ctx) });
  sections.push({
    title: s.faq,
    body: t
      .faq(contactUrl(ctx, 'faq'), ctx.revenueColumns)
      .flatMap(([question, answer]) => [`### ${question}`, answer]),
  });
  sections.push({
    title: s.license,
    body: [t.license(homeUrl(ctx, 'license'))],
  });

  const parts = [`# ${t.title}`];
  if (t.subtitle) parts.push(`**${t.subtitle}**`);
  parts.push(
    t.tagline(n, ctx.revenueColumns),
    langSwitch(ctx, readmeFile),
    badges(ctx),
    ...t.intro(ctx.revenueColumns, libraryUrl(ctx, 'intro')),
    shortcutsLine(ctx),
    `## ${t.contents}`,
    sections.map(({ title }) => `- ${link(title, anchor(title))}`).join('\n')
  );
  for (const { title, body } of sections) parts.push(`## ${title}`, ...body);
  parts.push(`<!-- rows: ${ctx.total} -->`);
  return `${parts.join('\n\n')}\n`;
}

function renderCategory(ctx, group) {
  const t = ctx.t;
  const label = escapeText(categoryLabel(ctx, group));
  const count = group.startups.length;
  const section = `category-${group.key}`;
  const readme = `../${readmeFile(ctx.lang)}`;
  const parts = [
    `# ${label}`,
    t.category.subtitle(formatCount(count), link(t.title, readme)),
    langSwitch(ctx, (lang) => categoryFile(group.key, lang)),
    link(
      t.filterCategory(formatCount(count), label),
      libraryUrl(ctx, section, {
        category: group.key,
        ...(ctx.revenueColumns ? { sort: 'mrr' } : {}),
      })
    ),
    startupTable(ctx, group.startups, { section, lead: 'rank' }),
    [
      link(t.category.howToRead, `${readme}${anchor(t.sections.howToRead)}`),
      link(t.category.back, `${readme}${anchor(t.sections.categories)}`),
    ].join(' · '),
    t.category.footer(dataAsOfText(ctx)),
  ];
  return `${parts.join('\n\n')}\n`;
}

/**
 * Renders every file for a validated export.
 * @returns {Map<string, string>} repository-relative path → content
 */
export function renderAll(data, { site = DEFAULT_SITE } = {}) {
  const base = new URL(site);
  const groups = groupCategories(data);
  const files = new Map();
  for (const lang of LANGS) {
    const ctx = {
      lang,
      t: STRINGS[lang],
      base: new URL(base.origin),
      total: data.startups.length,
      dataAsOf: data.dataAsOf,
      revenueColumns: data.revenueColumns,
      startups: data.startups,
    };
    files.set(readmeFile(lang), renderReadme(ctx, groups));
    for (const group of groups) {
      files.set(
        `categories/${categoryFile(group.key, lang)}`,
        renderCategory(ctx, group)
      );
    }
  }
  return files;
}
