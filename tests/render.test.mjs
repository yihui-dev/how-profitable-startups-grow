import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  anchor,
  escapeText,
  formatFollowers,
  noWrap,
  renderAll,
} from '../scripts/render.mjs';
import {
  checkRowGuard,
  ExportError,
  readRowsMarker,
  validateExport,
} from '../scripts/update.mjs';

const FIXTURE = fileURLToPath(
  new URL('./fixtures/export.sample.json', import.meta.url)
);
const UPDATE = fileURLToPath(new URL('../scripts/update.mjs', import.meta.url));
const UTM = {
  utm_source: 'github',
  utm_medium: 'readme',
  utm_campaign: 'how-profitable-startups-grow',
};

function fixture() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'));
}

function render(raw = fixture(), options) {
  return renderAll(validateExport(raw).data, options);
}

function withRows(raw, startups) {
  return { ...raw, startups, total: startups.length };
}

/** Splits a Markdown table row on pipes that are not backslash-escaped. */
function cells(line) {
  const parts = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') {
      current += line[i] + (line[i + 1] ?? '');
      i++;
    } else if (line[i] === '|') {
      parts.push(current);
      current = '';
    } else {
      current += line[i];
    }
  }
  parts.push(current);
  return parts.slice(1, -1).map((cell) => cell.trim());
}

/** Every table in a Markdown document, as arrays of rows of cells. */
function tables(markdown) {
  const found = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('|')) {
      if (!current) {
        current = [];
        found.push(current);
      }
      current.push(cells(line));
    } else {
      current = null;
    }
  }
  return found;
}

/** The table that follows a heading. */
function tableAfter(markdown, heading) {
  const start = markdown.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  return tables(markdown.slice(start))[0];
}

function links(markdown) {
  return [...markdown.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hpsg-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runUpdate(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [UPDATE, ...args],
      { env: { PATH: process.env.PATH, ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout, stderr });
      }
    );
  });
}

// ---------------------------------------------------------------------------
// The fixture

test('the fixture covers every band, growth bucket and null case', () => {
  const { startups } = fixture();
  const values = (key) => new Set(startups.map((s) => s[key]));
  for (const band of [
    'lt10k',
    '10k-30k',
    '30k-50k',
    '50k-100k',
    'gte100k',
    null,
  ]) {
    assert.ok(values('mrrBand').has(band), `band ${band}`);
  }
  for (const growth of ['surging', 'up', 'flat', 'down', null]) {
    assert.ok(values('growth').has(growth), `growth ${growth}`);
  }
  assert.deepEqual(values('productHunt'), new Set([true, false]));
  for (const key of [
    'builder',
    'question',
    'playsCount',
    'addedAt',
    'category',
    'logoPath',
    'domain',
  ]) {
    assert.ok(values(key).has(null), `${key} null`);
  }
  assert.ok(startups.some((s) => s.name.includes('|')));
  assert.ok(startups.some((s) => s.builder?.followers === null));
  assert.ok(startups.some((s) => s.builder?.role === 'official'));
  assert.ok(
    startups.every(
      (s) => s.domain === null || s.domain.endsWith('.example.com')
    )
  );
});

// ---------------------------------------------------------------------------
// Rendering

test('renders the same bytes every time', () => {
  const first = render();
  const second = render();
  assert.deepEqual([...first.keys()], [...second.keys()]);
  for (const [path, content] of first) assert.equal(second.get(path), content);
});

test('renders both READMEs and a file per category and language', () => {
  const files = render();
  assert.deepEqual([...files.keys()].sort(), [
    'README.md',
    'README.zh-CN.md',
    'README.zh-TW.md',
    'categories/ai-tools.md',
    'categories/ai-tools.zh-CN.md',
    'categories/ai-tools.zh-TW.md',
    'categories/developer-tools.md',
    'categories/developer-tools.zh-CN.md',
    'categories/developer-tools.zh-TW.md',
    'categories/marketing.md',
    'categories/marketing.zh-CN.md',
    'categories/marketing.zh-TW.md',
    'categories/productivity.md',
    'categories/productivity.zh-CN.md',
    'categories/productivity.zh-TW.md',
  ]);
  for (const content of files.values()) {
    assert.ok(content.endsWith('\n') && !content.endsWith('\n\n'));
  }
});

test('every table row has as many cells as its header', () => {
  for (const [path, content] of render()) {
    for (const table of tables(content)) {
      for (const row of table) {
        assert.equal(
          row.length,
          table[0].length,
          `${path}: ${row.join(' | ')}`
        );
      }
    }
  }
});

/** A cell as the reader sees it: no-wrap entities back to plain text. */
const visible = (cell) => cell.replace(/&nbsp;/g, ' ').replace(/&#8288;/g, '');

test('short cells and headers never wrap', () => {
  const files = render();
  const en = tableAfter(files.get('README.md'), '## Top 100 by revenue');
  const zh = tableAfter(files.get('README.zh-CN.md'), '## 收入最高的 100 家');
  // The space after ≥ / < and the dash inside a band were the break points.
  assert.deepEqual(
    [...new Set(en.slice(2).map((r) => r[2]))].sort(),
    [
      '$10K–&#8288;30K',
      '$30K–&#8288;50K',
      '$50K–&#8288;100K',
      '&lt;&nbsp;$10K',
      '≥&nbsp;$100K',
      '—',
    ].sort()
  );
  // Chinese headers wrapped between characters ("增 / 长").
  assert.equal(zh[0][3], '增&#8288;长');
  assert.equal(en[0][5], 'Builder');
  assert.equal(en[0][6], 'How it grows?');
  assert.equal(noWrap('E-commerce'), 'E-&#8288;commerce');
  assert.equal(noWrap('—'), '—');
});

test('the top table keeps the export order with bands and growth marks', () => {
  const readme = render().get('README.md');
  const table = tableAfter(readme, '## Top 100 by revenue');
  assert.deepEqual(table[0].map(visible), [
    '#',
    'Startup',
    'MRR',
    'Growth',
    'Category',
    'Builder',
    'How it grows?',
  ]);
  const rows = table.slice(2);
  assert.equal(rows.length, 12);
  assert.deepEqual(
    rows.map((r) => r[0]),
    rows.map((_, i) => String(i + 1))
  );
  assert.deepEqual(
    rows.slice(0, 8).map((r) => visible(r[2])),
    [
      '≥ $100K',
      '$50K–100K',
      '$30K–50K',
      '$10K–30K',
      '$10K–30K',
      '&lt; $10K',
      '&lt; $10K',
      '&lt; $10K',
    ]
  );
  assert.deepEqual(
    rows.slice(0, 9).map((r) => r[3]),
    ['▲', '▲▲', '▲▲', '→', '▼', '▲', '—', '▲▲', '—']
  );

  const first = rows[0];
  assert.match(
    first[1],
    /^<img src="https:\/\/bizpeel\.com\/media\/[^"]+" width="16" height="16" alt=""> \[Lumenforge\]\(https:\/\/bizpeel\.com\/project\/lumenforge\?/
  );
  assert.equal(visible(first[4]), '[AI tools](categories/ai-tools.md)');
  assert.equal(first[5], '[@fixture\\_ana](https://x.com/fixture_ana) · 12K');
  assert.match(
    first[6],
    /^How did .*\? → \[See 7 growth plays\]\(https:\/\/bizpeel\.com\/project\/lumenforge\?/
  );

  const byName = Object.fromEntries(
    rows.map((r) => [
      r[1].replace(/^<img [^>]+> /, '').match(/^\[(.*?)\]\(/)[1],
      r,
    ])
  );
  assert.equal(
    byName.Crumbly[1].startsWith('[Crumbly]('),
    true,
    'no logo, no img'
  );
  assert.equal(byName.Crumbly[5], '—');
  assert.match(byName.Crumbly[6], /^\[Read the report\]\(/);
  assert.match(byName.Fernlog[6], /\[See 1 growth play\]\(/);
  assert.equal(
    byName.Fernlog[5],
    '[@fixture\\_cleo](https://x.com/fixture_cleo)'
  );
  assert.equal(byName.Driftdesk[4], '—');
  assert.match(byName.Snapgrid[6], /^\[See 3 growth plays\]\(/);
  assert.equal(
    byName.Snapgrid[5],
    '[@fixture\\_ben](https://x.com/fixture_ben) · 1.2M'
  );
});

test('a name with a pipe stays in one cell', () => {
  const readme = render().get('README.md');
  assert.ok(readme.includes('[Parcel \\| Pine]('));
  assert.ok(!readme.includes('Parcel | Pine'));
});

test('fastest growing lists only surging rows; recently added is newest first', () => {
  const readme = render().get('README.md');
  const fastest = tableAfter(readme, '## Fastest growing').slice(2);
  assert.deepEqual(
    fastest.map((r) => r[3]),
    ['▲▲', '▲▲', '▲▲']
  );
  assert.match(fastest[0][1], /\[Parcel \\\| Pine\]/);

  const recent = tableAfter(readme, '## Recently added');
  assert.equal(recent[0][0], 'Added');
  const dates = recent.slice(2).map((r) => r[0]);
  assert.equal(dates.length, 11, 'rows without addedAt are left out');
  assert.deepEqual(dates, [...dates].sort().reverse());
  // Fernlog and Quillmint share a date; the export order breaks the tie.
  assert.match(recent[3][1], /\[Fernlog\]/);
  assert.match(recent[4][1], /\[Quillmint\]/);
});

test('the category index links to each category file with its count', () => {
  const readme = render().get('README.md');
  const index = tableAfter(readme, '## By category').slice(2);
  assert.deepEqual(index, [
    ['[AI tools](categories/ai-tools.md)', '3'],
    ['[Developer tools](categories/developer-tools.md)', '3'],
    ['[Productivity](categories/productivity.md)', '3'],
    ['[Marketing](categories/marketing.md)', '2'],
  ]);
  const zh = tableAfter(render().get('README.zh-CN.md'), '## 按分类').slice(2);
  assert.deepEqual(zh[0], ['[AI 工具](categories/ai-tools.zh-CN.md)', '3']);
});

test('category files hold the full table for that category without a category column', () => {
  const files = render();
  const en = files.get('categories/developer-tools.md');
  assert.match(en, /^# Developer tools\n/);
  const table = tables(en)[0];
  assert.ok(!table[0].includes('Category'));
  assert.equal(table.length - 2, 3);
  assert.ok(en.includes('[简体中文](developer-tools.zh-CN.md)'));
  assert.ok(en.includes('(../README.md#how-to-read-the-tables)'));
  assert.ok(en.includes('category=developer-tools'));
  for (const url of links(en).filter((u) => u.includes('/project/'))) {
    assert.equal(
      new URL(url).searchParams.get('utm_content'),
      'category-developer-tools'
    );
  }

  const zh = files.get('categories/developer-tools.zh-CN.md');
  assert.ok(zh.includes('[English](developer-tools.md)'));
  assert.ok(
    links(zh)
      .filter((u) => u.includes('/project/'))
      .every((u) => u.startsWith('https://bizpeel.com/zh/project/'))
  );
});

test('report links carry the UTM parameters and Chinese pages link to /zh', () => {
  const files = render();
  for (const [path, content] of files) {
    const zh = path.endsWith('.zh-CN.md') || path.endsWith('.zh-TW.md');
    const reports = links(content).filter((u) => u.includes('/project/'));
    assert.ok(reports.length > 0, path);
    for (const href of reports) {
      const url = new URL(href);
      assert.equal(url.origin, 'https://bizpeel.com');
      assert.match(
        url.pathname,
        zh ? /^\/zh\/project\/[a-z0-9-]+$/ : /^\/project\/[a-z0-9-]+$/
      );
      for (const [key, value] of Object.entries(UTM)) {
        assert.equal(url.searchParams.get(key), value, `${path} ${href}`);
      }
      assert.ok(url.searchParams.get('utm_content'));
    }
    for (const href of links(content).filter((u) =>
      u.startsWith('https://bizpeel.com')
    )) {
      const url = new URL(href);
      if (url.pathname.startsWith('/media/')) continue;
      assert.equal(url.searchParams.get('utm_source'), 'github', href);
      assert.equal(url.pathname.startsWith('/zh'), zh, href);
    }
  }
  const readme = files.get('README.md');
  const sections = new Set(
    links(readme)
      .filter((u) => u.includes('/project/'))
      .map((u) => new URL(u).searchParams.get('utm_content'))
  );
  assert.deepEqual(
    sections,
    new Set(['top-100', 'fastest-growing', 'recently-added'])
  );
});

test('--site changes the base of every site link', () => {
  const readme = render(fixture(), {
    site: 'https://staging.example.com/',
  }).get('README.md');
  assert.ok(!readme.includes('https://bizpeel.com'));
  assert.ok(readme.includes('https://staging.example.com/project/lumenforge?'));
  assert.ok(readme.includes('<img src="https://staging.example.com/media/'));
});

test('the README opens with the title, tagline, badges and contents', () => {
  const readme = render().get('README.md');
  assert.match(
    readme,
    /^# How Profitable Startups Grow\n\n12 startups with their revenue band/
  );
  assert.ok(readme.includes('**English** · [简体中文](README.zh-CN.md)'));
  const badges = readme.match(
    /\[!\[[^\]]+\]\(https:\/\/img\.shields\.io\/badge\/[^)]+\)\]\(https:\/\/bizpeel\.com\/library\?[^)]+\)/g
  );
  assert.equal(badges.length, 3);
  assert.ok(readme.includes('data%20as%20of-2026--11--02'));
  assert.ok(readme.trimEnd().endsWith('<!-- rows: 12 -->'));

  const zh = render().get('README.zh-CN.md');
  assert.match(
    zh,
    /^# How Profitable Startups Grow\n\n\*\*盈利创业公司是怎么增长的\*\*\n/
  );
  assert.ok(zh.includes('[English](README.md) · **简体中文**'));
  assert.ok(zh.trimEnd().endsWith('<!-- rows: 12 -->'));
});

test('every contents entry points at a heading in the same file', () => {
  for (const path of ['README.md', 'README.zh-CN.md', 'README.zh-TW.md']) {
    const content = render().get(path);
    const contents = content.slice(
      content.indexOf('\n## '),
      content.indexOf('\n## ', content.indexOf('\n## ') + 1)
    );
    const entries = [...contents.matchAll(/^- \[(.+)\]\((#.+)\)$/gm)];
    assert.ok(entries.length >= 6, path);
    for (const [, title, href] of entries) {
      assert.equal(href, anchor(title));
      assert.ok(content.includes(`\n## ${title}\n`), `${path}: ${title}`);
    }
  }
  assert.equal(anchor('Top 100 by revenue'), '#top-100-by-revenue');
  assert.equal(anchor('收入最高的 100 家'), '#收入最高的-100-家');
});

test('the revenue kill switch drops the MRR and Growth columns and ranks by name', () => {
  const raw = fixture();
  raw.revenueColumns = false;
  const files = render(raw);
  const readme = files.get('README.md');
  assert.ok(!readme.includes('## Top 100 by revenue'));
  assert.ok(!readme.includes('## Fastest growing'));
  assert.ok(!readme.includes('### Revenue bands'));
  assert.ok(!readme.includes('only as a band'));
  assert.ok(!files.get('README.zh-CN.md').includes('只显示区间'));
  const table = tableAfter(readme, '## Startups A to Z');
  assert.deepEqual(table[0].map(visible), [
    '#',
    'Startup',
    'Category',
    'Builder',
    'How it grows?',
  ]);
  const names = table
    .slice(2)
    .map((r) => r[1].replace(/^<img [^>]+> /, '').match(/^\[(.*?)\]\(/)[1]);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
  );
  for (const [path, content] of files) {
    assert.ok(
      !/\$\d/.test(content.replace(/\\\$/g, '')),
      `${path} shows a band`
    );
    assert.ok(!/[▲▼]/.test(content), `${path} shows growth`);
    for (const t of tables(content)) assert.ok(!t[0].includes('MRR'));
  }
  const category = tables(files.get('categories/ai-tools.md'))[0];
  assert.deepEqual(category[0].map(visible), [
    '#',
    'Startup',
    'Builder',
    'How it grows?',
  ]);
});

test('the export bands and growth are ignored when the kill switch is on', () => {
  const raw = fixture();
  raw.revenueColumns = false;
  const { data } = validateExport(raw);
  assert.ok(
    data.startups.every((s) => s.mrrBand === null && s.growth === null)
  );
});

test('fastest growing says so when nothing is surging', () => {
  const raw = fixture();
  for (const s of raw.startups) if (s.growth === 'surging') s.growth = 'up';
  const readme = render(raw).get('README.md');
  const section = readme.slice(
    readme.indexOf('## Fastest growing'),
    readme.indexOf('## Recently added')
  );
  assert.equal(tables(section).length, 0);
  assert.match(section, /No startup grew/);
});

// ---------------------------------------------------------------------------
// Escaping and formatting

test('escapes table-breaking and HTML-sensitive characters', () => {
  assert.equal(escapeText('a | b'), 'a \\| b');
  assert.equal(
    escapeText('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
  assert.equal(
    escapeText('line one\nline two\r\nthree'),
    'line one line two three'
  );
  assert.equal(
    escapeText('[x](https://example.com)'),
    '\\[x\\](https://example.com)'
  );
  assert.equal(
    escapeText('*bold* _it_ `code` ~s~ $5'),
    '\\*bold\\* \\_it\\_ \\`code\\` \\~s\\~ \\$5'
  );
  assert.equal(escapeText('A & B'), 'A &amp; B');
  assert.equal(escapeText('back\\slash'), 'back\\\\slash');
  assert.equal(escapeText('a\u0000b\u202Ec\u0007'), 'abc');
  assert.equal(escapeText('  spaced\t\tout  '), 'spaced out');
});

test('hostile data cannot break a row or inject HTML', () => {
  const raw = fixture();
  raw.startups[0].name =
    'Evil <img src=x onerror=alert(1)> | ]](https://example.com)\nrow';
  raw.startups[0].question = {
    en: 'What | happens\n| 1 | <b>next</b>?',
    zh: '然后呢 | <i>？</i>',
  };
  raw.startups[0].channels = [{ en: 'A|B', zh: 'A|B', icons: [] }];
  raw.startups[0].category.en = 'AI | tools <x>';
  raw.categories[0].en = 'AI | tools <x>';
  const files = render(raw);
  for (const [path, content] of files) {
    assert.ok(
      !/<(?!img src="https:\/\/bizpeel\.com\/media\/[^"]+" width="16" height="16" alt="">)(?!!--)/.test(
        content
      ),
      `${path} has raw HTML`
    );
    for (const table of tables(content)) {
      for (const row of table) assert.equal(row.length, table[0].length, path);
    }
  }
});

test('formats followers as 530, 12K, 1.2M', () => {
  assert.equal(formatFollowers(0), '0');
  assert.equal(formatFollowers(95), '95');
  assert.equal(formatFollowers(534), '530');
  assert.equal(formatFollowers(999), '1K');
  assert.equal(formatFollowers(1234), '1.2K');
  assert.equal(formatFollowers(12345), '12K');
  assert.equal(formatFollowers(125000), '130K');
  assert.equal(formatFollowers(1_200_000), '1.2M');
  assert.equal(formatFollowers(12_000_000), '12M');
});

// ---------------------------------------------------------------------------
// Validation

test('validation rejects a wrong version or shape', () => {
  const cases = [
    (raw) => {
      raw.version = 2;
    },
    (raw) => {
      raw.startups = 'nope';
    },
    (raw) => {
      raw.total = 99;
    },
    (raw) => {
      raw.revenueColumns = 'yes';
    },
    (raw) => {
      raw.startups[0].mrrBand = '1m-plus';
    },
    (raw) => {
      raw.startups[0].growth = 'rocket';
    },
    (raw) => {
      raw.startups[0].productHunt = 'true';
    },
    (raw) => {
      raw.startups[0].reportPath = 'https://evil.example.com/x';
    },
    (raw) => {
      raw.startups[0].reportPath = '//evil.example.com/x';
    },
    (raw) => {
      raw.startups[0].category.key = '../../.github/workflows/x';
    },
    (raw) => {
      raw.startups[1].slug = raw.startups[0].slug;
    },
    (raw) => {
      raw.startups[0].addedAt = 'yesterday';
    },
    (raw) => {
      raw.startups[0].builder.platform = 'instagram';
    },
    (raw) => {
      raw.startups[0].playsCount = -1;
    },
  ];
  for (const mutate of cases) {
    const raw = fixture();
    mutate(raw);
    assert.throws(() => validateExport(raw), ExportError, mutate.toString());
  }
});

test('drops fields outside the contract and questions that name money', () => {
  const raw = fixture();
  raw.unexpectedTopField = 'top-level-value-not-for-render';
  raw.startups[0].unexpectedField = 'row-value-not-for-render';
  raw.startups[1].question = {
    en: 'How did it reach 10K users?',
    zh: '如何做到一万用户？',
  };
  raw.startups[3].question = { en: 'Is it worth $5?', zh: '值得吗？' };
  raw.startups[4].question = { en: 'Why so fast?', zh: '为什么能做到 3 万？' };
  const { data, warnings } = validateExport(raw);
  assert.equal(data.startups[1].question, null);
  assert.equal(data.startups[3].question, null);
  assert.equal(data.startups[4].question, null);
  assert.ok(warnings.some((w) => w.includes('export.unexpectedTopField')));
  assert.ok(warnings.some((w) => w.includes('startups[].unexpectedField')));
  assert.ok(warnings.every((w) => !w.includes('not-for-render')));
  for (const content of renderAll(data).values()) {
    assert.ok(!content.includes('not-for-render'));
    assert.ok(!content.includes('10K users'));
  }
});

test('questions and channel names with a figure or a link in them are left out', () => {
  const leaking = [
    'Worth $1,000?',
    'How did 5k users find it?',
    '如何做到 2万 用户？',
    'Why ¥ pricing?',
    '为什么定价 ￥99？',
    'Why did churn fall 30%?',
    'Where do 6,077 monthly visits come from?',
    'How did it reach 1000 users?',
    'How did it grow 10x?',
    'Which 96 top-10 rankings matter?',
    'How did 9+ channels add up?',
    'Why does https://evil.example/x rank?',
    'Is www.evil.example worth it?',
    'Why email founder@evil.example?',
    'Why did revenue double to three thousand?',
    '收入为什么增长了三倍？',
    'How did it hit 5MM ARR?',
    'Charging 9 euros a month',
    'Why did revenue halve after the relaunch?',
    '改版后收入减半，问题出在哪？',
    'Where do more than half its visits come from?',
    '一半以上的访问是从哪来的？',
    'Why does one page capture nearly a third of organic search traffic?',
    'Why do visitors average over 5 minutes per session?',
    '为什么人均单次访问停留能超过5分钟？',
    'With only 2 ranking US keywords, where do users come from?',
    '美国只有 2 个关键词有排名，用户从哪来？',
  ];
  for (const text of leaking) {
    const raw = fixture();
    raw.startups[0].question = { en: text, zh: '为什么？' };
    raw.startups[1].question = { en: 'Why?', zh: text };
    raw.startups[0].channels = [{ en: `SEO (${text})`, zh: 'SEO', icons: [] }];
    const { data, warnings } = validateExport(raw);
    assert.equal(data.startups[0].question, null, text);
    assert.equal(data.startups[1].question, null, text);
    assert.deepEqual(data.startups[0].channels, [], text);
    assert.ok(
      warnings.every((w) => !w.includes(text)),
      text
    );
    for (const content of renderAll(data).values()) {
      assert.ok(!content.includes(text), text);
    }
  }

  const raw = fixture();
  raw.startups[0].question = {
    en: 'Which 3 channels mattered most in 2025?',
    zh: '2025 年最重要的 3 个渠道是哪些？',
  };
  assert.deepEqual(
    validateExport(raw).data.startups[0].question,
    raw.startups[0].question
  );
});

test('the top table says how rows without a current band are ordered', () => {
  const readme = render().get('README.md');
  const top = readme.slice(readme.indexOf('## Top 100 by revenue'));
  assert.ok(
    top.startsWith(
      '## Top 100 by revenue\n\nHighest MRR first. Startups without current revenue data follow by name'
    )
  );
  const raw = fixture();
  const banded = raw.startups.filter((startup) => startup.mrrBand);
  const only = render(withRows(raw, banded)).get('README.zh-CN.md');
  assert.ok(only.includes('按 MRR 从高到低排列。'));
  assert.ok(!only.includes('没有最新收入数据的公司'));
});

test('the FAQ sends suggestions to the contact page', () => {
  const files = render();
  assert.ok(
    files.get('README.md').includes('(https://bizpeel.com/contact?utm_source=')
  );
  assert.ok(
    files
      .get('README.zh-CN.md')
      .includes('(https://bizpeel.com/zh/contact?utm_source=')
  );
});

test('an invalid handle or logo path is left out with a warning', () => {
  const raw = fixture();
  raw.startups[0].builder.handle = 'not a handle/../x';
  raw.startups[1].logoPath = 'javascript:alert(1)';
  const { data, warnings } = validateExport(raw);
  assert.equal(data.startups[0].builder, null);
  assert.equal(data.startups[1].logoPath, null);
  assert.equal(warnings.length, 2);
});

// ---------------------------------------------------------------------------
// Row-count guard

test('the row guard refuses an empty export or a drop of more than 20%', () => {
  assert.equal(readRowsMarker('x\n<!-- rows: 250 -->\n'), 250);
  assert.equal(readRowsMarker('# placeholder'), null);
  assert.equal(readRowsMarker(null), null);
  assert.throws(() => checkRowGuard(0, null), ExportError);
  assert.throws(() => checkRowGuard(0, 10), ExportError);
  assert.throws(() => checkRowGuard(79, 100), ExportError);
  assert.doesNotThrow(() => checkRowGuard(80, 100));
  assert.doesNotThrow(() => checkRowGuard(5, null));
  assert.doesNotThrow(() => checkRowGuard(300, 100));
});

// ---------------------------------------------------------------------------
// The CLI

test('update writes the files, then nothing when the export is unchanged', async (t) => {
  const dir = tempDir(t);
  const outputs = join(dir, 'github-output.txt');
  const out = join(dir, 'repo');
  const first = await runUpdate(['--input', FIXTURE, '--out', out], {
    GITHUB_OUTPUT: outputs,
  });
  assert.equal(first.code, 0, first.stdout);
  assert.equal(readdirSync(join(out, 'categories')).length, 12);
  assert.equal(
    readFileSync(join(out, 'README.md'), 'utf8'),
    render().get('README.md')
  );
  assert.match(
    readFileSync(outputs, 'utf8'),
    /^rows=12\ndata_as_of=2026-11-02\nchanged=true\n$/
  );

  const second = await runUpdate(['--input', FIXTURE, '--out', out], {
    GITHUB_OUTPUT: outputs,
  });
  assert.equal(second.code, 0);
  assert.ok(!second.stdout.includes('Wrote'));
  assert.match(second.stdout, /0 written, 0 removed, 15 unchanged/);
  assert.match(readFileSync(outputs, 'utf8'), /changed=false\n$/);
});

test('update removes category files that no longer have startups', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'categories'));
  writeFileSync(join(dir, 'categories', 'retired.md'), 'old');
  writeFileSync(join(dir, 'categories', 'retired.zh-CN.md'), 'old');
  writeFileSync(join(dir, 'categories', 'notes.txt'), 'kept');
  const result = await runUpdate(['--input', FIXTURE, '--out', dir]);
  assert.equal(result.code, 0);
  assert.ok(!existsSync(join(dir, 'categories', 'retired.md')));
  assert.ok(!existsSync(join(dir, 'categories', 'retired.zh-CN.md')));
  assert.ok(existsSync(join(dir, 'categories', 'notes.txt')));
});

test('update is a no-op warning without a URL and token', async (t) => {
  const dir = tempDir(t);
  for (const env of [
    {},
    { BIZPEEL_EXPORT_URL: 'https://example.com/x' },
    { BIZPEEL_EXPORT_TOKEN: 't' },
  ]) {
    const result = await runUpdate(['--out', dir], env);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^::warning::/);
    assert.deepEqual(readdirSync(dir), []);
  }
});

test('update refuses a shrunken export and leaves the tables untouched', async (t) => {
  const dir = tempDir(t);
  const placeholder = '# How Profitable Startups Grow\n\n<!-- rows: 16 -->\n';
  writeFileSync(join(dir, 'README.md'), placeholder);
  const result = await runUpdate(['--input', FIXTURE, '--out', dir]);
  assert.equal(result.code, 1);
  assert.match(
    result.stdout,
    // `%` is escaped for the workflow command (GitHub shows it as `%`).
    /::error::The export has 12 startups, more than 20%25 fewer than the 16/
  );
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), placeholder);
  assert.deepEqual(readdirSync(dir), ['README.md']);

  const empty = join(dir, 'empty.json');
  writeFileSync(
    empty,
    JSON.stringify(withRows({ ...fixture(), dataAsOf: null }, []))
  );
  const emptyResult = await runUpdate(['--input', empty, '--out', dir]);
  assert.equal(emptyResult.code, 1);
  assert.match(emptyResult.stdout, /::error::The export has no startups/);
});

test('update escapes export data in workflow annotations', async (t) => {
  const dir = tempDir(t);
  const raw = fixture();
  raw.startups[0].slug = 'evil\n::error::injected%0A';
  raw.startups[0].logoPath = 'not-a-site-path';
  const input = join(dir, 'export.json');
  writeFileSync(input, JSON.stringify(raw));
  const result = await runUpdate(['--input', input, '--out', dir]);
  assert.equal(result.code, 0);
  const lines = result.stdout.split('\n');
  assert.ok(lines.every((line) => !line.startsWith('::error::')));
  assert.ok(
    lines.includes(
      '::warning::evil%0A::error::injected%250A: logo path is not site-relative; logo left out'
    )
  );
});

test('update rejects an invalid export without writing', async (t) => {
  const dir = tempDir(t);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ ...fixture(), version: 2 }));
  const out = join(dir, 'out');
  const result = await runUpdate(['--input', bad, '--out', out]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /::error::Unsupported export version/);
  assert.ok(!existsSync(out));
});

test('update fetches with the bearer token and never prints the URL or token', async (t) => {
  const token = 'tok-3f9a1c-never-print-me';
  const body = readFileSync(FIXTURE, 'utf8');
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ path: req.url, auth: req.headers.authorization });
    if (req.url === '/redirect') {
      // Followed, this would succeed: the target serves the export.
      res.writeHead(302, { location: '/after-redirect' }).end();
    } else if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end('{"error":"unauthorized"}');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
    }
  });
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (
    server.address()
  );
  const base = `http://127.0.0.1:${port}`;
  const secretPath = '/hidden-export-path-for-test';
  const dir = tempDir(t);

  const ok = await runUpdate(['--out', dir], {
    BIZPEEL_EXPORT_URL: `${base}${secretPath}`,
    BIZPEEL_EXPORT_TOKEN: token,
  });
  assert.equal(ok.code, 0, ok.stdout);
  assert.equal(seen[0].auth, `Bearer ${token}`);
  assert.ok(existsSync(join(dir, 'README.md')));

  const denied = await runUpdate(['--out', join(dir, 'denied')], {
    BIZPEEL_EXPORT_URL: `${base}${secretPath}`,
    BIZPEEL_EXPORT_TOKEN: 'wrong-token-also-secret',
  });
  assert.equal(denied.code, 1);
  assert.match(denied.stdout, /HTTP 401/);

  const redirected = await runUpdate(['--out', join(dir, 'redirected')], {
    BIZPEEL_EXPORT_URL: `${base}/redirect`,
    BIZPEEL_EXPORT_TOKEN: token,
  });
  assert.equal(redirected.code, 1);
  assert.equal(seen.length, 3, 'the redirect is not followed');
  assert.equal(seen[2].path, '/redirect');

  const insecure = await runUpdate(['--out', join(dir, 'insecure')], {
    BIZPEEL_EXPORT_URL: 'http://export.example.com/x',
    BIZPEEL_EXPORT_TOKEN: token,
  });
  assert.equal(insecure.code, 1);
  assert.match(insecure.stdout, /must be an https URL/);

  for (const run of [ok, denied, redirected, insecure]) {
    const output = run.stdout + run.stderr;
    for (const secret of [
      token,
      'wrong-token-also-secret',
      secretPath,
      base,
      'export.example.com',
    ]) {
      assert.ok(!output.includes(secret), `output leaked ${secret}`);
    }
  }
  assert.ok(!existsSync(join(dir, 'denied')));
  assert.ok(!existsSync(join(dir, 'redirected')));
});
