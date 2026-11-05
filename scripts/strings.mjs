// Every piece of text the tables and pages show, in English and Chinese.
//
// Values passed into these functions are already escaped for Markdown by
// render.mjs, so the strings here may contain Markdown but never raw data.

/** @typedef {'en' | 'zh-CN' | 'zh-TW'} Lang */

/** @type {Lang[]} */
export const LANGS = ['en', 'zh-CN', 'zh-TW'];

const BAND_ORDER = ['lt10k', '10k-30k', '30k-50k', '50k-100k', 'gte100k'];

/** Band labels. `<` is written as an entity so it never opens an HTML tag. */
const BAND_LABELS = {
  lt10k: '&lt; $10K',
  '10k-30k': '$10K–30K',
  '30k-50k': '$30K–50K',
  '50k-100k': '$50K–100K',
  gte100k: '≥ $100K',
};

const GROWTH_MARKS = {
  surging: '▲▲',
  up: '▲',
  flat: '→',
  down: '▼',
};

/** Shared by both languages: the same marks, a different explanation. */
export const MARKS = {
  bands: BAND_LABELS,
  bandOrder: BAND_ORDER,
  growth: GROWTH_MARKS,
};

export const STRINGS = {
  en: {
    languageName: 'English',
    /** File suffix before `.md`: README.md, categories/<key>.md. */
    fileSuffix: '',
    /** Prefix for site pages in this language. */
    sitePrefix: '',
    title: 'How Profitable Startups Grow',
    subtitle: null,
    tagline: (n, revenueColumns) =>
      revenueColumns
        ? `${n} startups with their revenue band, 30-day trend and builder — and a full growth report on each, updated weekly`
        : `${n} startups with their builder and growth breakdown — and a full growth report on each, updated weekly`,
    badges: {
      startups: 'startups',
      dataAsOf: 'data as of',
      updated: 'updated',
      weekly: 'weekly',
      unknownDate: 'n/a',
    },
    intro: (revenueColumns, link) => [
      revenueColumns
        ? 'Each row shows how much a startup makes (as a revenue band), whether it is growing, who builds it and how it gets customers.'
        : 'Each row shows who builds a startup and how it gets customers.',
      `The step-by-step playbook, the numbers and the evidence are in each startup’s full report on BizPeel — [free to preview](${link}).`,
    ],
    shortcutsLabel: "Browse by business model & growth pattern:",
    shortcuts: (revenueColumns) => [
      ...(revenueColumns
        ? [
            [
              "🔥 Low-traffic, high-revenue",
              "shortcut-low-traffic",
              { minMrr: "10000", maxVisits: "10000", sort: "mrr" },
            ],
            [
              "📈 Surging 30d growth",
              "shortcut-high-growth",
              { minGrowth: "20", sort: "mrr_growth" },
            ],
          ]
        : []),
      [
        "🎯 Freemium conversion",
        "shortcut-freemium",
        { billing: "freemium", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🏢 B2B & SMB software",
        "shortcut-b2b",
        { customer: "smb", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🛠️ Developer tools & APIs",
        "shortcut-devtools",
        { customer: "developers", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🌱 Bootstrapped & profitable",
        "shortcut-bootstrapped",
        { funding: "bootstrapped", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
    ],
    bottomCta: {
      top: (n, link) =>
        `> **Showing the top 100 only.** [Filter and sort all ${n} startups by category, revenue band and growth on BizPeel →](${link})`,
      topByName: (n, link) =>
        `> **Showing the first 100 only.** [Filter and sort all ${n} startups by category and business model on BizPeel →](${link})`,
      fastest: (n, link) =>
        `> **Want to see more momentum?** [Browse all ${n} startups sorted by 30-day MRR growth on BizPeel →](${link})`,
    },
    contents: 'Contents',
    sections: {
      top: 'Top 100 by revenue',
      topByName: 'Startups A to Z',
      fastest: 'Fastest growing',
      recent: 'Recently added',
      categories: 'By category',
      howToRead: 'How to read the tables',
      faq: 'FAQ',
      license: 'License',
    },
    /** The library link above a table, named after the order it opens in. */
    filterAll: (n, sort) =>
      ({
        mrr: `Sort all ${n} startups by MRR on BizPeel →`,
        mrr_growth: `Sort all ${n} startups by MRR growth on BizPeel →`,
        recent: `Sort all ${n} startups by date added on BizPeel →`,
      })[sort] ?? `Filter and sort all ${n} startups on BizPeel →`,
    filterCategory: (n, category) =>
      `Filter and sort all ${n} ${category} startups on BizPeel →`,
    fastestNote:
      'Startups whose MRR grew 20% or more over the last 30 days, highest revenue first.',
    fastestEmpty:
      'No startup grew its MRR by 20% or more over the last 30 days in this update.',
    topByNameNote: 'The first 100 startups by name.',
    topNote: (unbanded) =>
      unbanded
        ? 'Highest MRR first. Startups without current revenue data follow by name, marked —.'
        : 'Highest MRR first.',
    columns: {
      rank: '#',
      added: 'Added',
      startup: 'Startup',
      mrr: 'MRR',
      growth: 'Growth',
      category: 'Category',
      channels: 'Grows via',
      builder: 'Builder',
      answers: 'How it grows?',
      startups: 'Startups',
    },
    plays: (n) => `See ${n} growth ${n === 1 ? 'play' : 'plays'}`,
    readReport: 'Read the report',
    howToRead: {
      columnsHead: ['Column', 'What it shows'],
      columns: (revenueColumns) => [
        ...(revenueColumns
          ? [
              [
                'MRR',
                'Monthly recurring revenue as a band, compiled from publicly shared data online',
              ],
              ['Growth', 'How MRR changed over the last 30 days'],
            ]
          : []),
        [
          'Builder',
          'The founder’s X account, or the startup’s official account when there is no founder account; followers rounded',
        ],
        [
          'How it grows?',
          'A key growth question the full report answers, and how many growth plays it breaks down',
        ],
      ],
      bandsTitle: 'Revenue bands (MRR per month)',
      bandsHead: ['Band', 'Range'],
      bands: {
        lt10k: 'under 10,000 USD',
        '10k-30k': '10,000–29,999 USD',
        '30k-50k': '30,000–49,999 USD',
        '50k-100k': '50,000–99,999 USD',
        gte100k: '100,000 USD or more',
      },
      growthTitle: 'Growth (MRR change over the last 30 days)',
      growthHead: ['Mark', 'Change'],
      growth: {
        surging: '+20% or more',
        up: '+5% to +20%',
        flat: '−5% to +5%',
        down: 'down more than 5%',
      },
      unknown: 'unknown or stale',
    },
    faq: (contactLink, revenueColumns) => [
      [
        'Where does the data come from?',
        `${revenueColumns ? 'Revenue data is compiled from publicly shared information online and shown here only as a band. ' : ''}Builders and growth questions come from BizPeel’s research on publicly shared sources, and each full report cites its sources.`,
      ],
      [
        'How often is it updated?',
        'Every Monday. The “data as of” badge shows the date of the newest revenue data in the tables.',
      ],
      [
        'How do I get a startup listed?',
        `Every startup with a published report on BizPeel appears here from the next weekly update. To suggest a startup, [contact BizPeel](${contactLink}).`,
      ],
      [
        'Why no exact numbers?',
        'The tables are a map of where to look. Exact MRR, growth and traffic, with the evidence behind them, are in each startup’s report on BizPeel, where every figure carries its source and date.',
      ],
    ],
    license: (homeLink) =>
      `The code in this repository is under the [MIT License](LICENSE). The content of the tables is © BizPeel and may be linked to or quoted with attribution to [BizPeel](${homeLink}).`,
    category: {
      subtitle: (n, title) =>
        `${n} ${n === '1' ? 'startup' : 'startups'} in this category, from ${title}, updated weekly`,
      back: 'All categories',
      howToRead: 'How to read the table',
      footer: (dataAsOf) =>
        `Data as of ${dataAsOf}. Table content © BizPeel, free to link to or quote with attribution. Code under the [MIT License](../LICENSE).`,
    },
  },

  'zh-CN': {
    languageName: '简体中文',
    fileSuffix: '.zh-CN',
    sitePrefix: '/zh',
    title: 'How Profitable Startups Grow',
    subtitle: '盈利创业公司是怎么增长的',
    tagline: (n, revenueColumns) =>
      revenueColumns
        ? `${n} 家创业公司的收入区间、30 天趋势和背后的创始人，每家都附一份完整获客增长报告，每周更新`
        : `${n} 家创业公司背后的创始人和获客增长拆解，每家都附一份完整增长报告，每周更新`,
    badges: {
      startups: '创业公司',
      dataAsOf: '数据截至',
      updated: '更新',
      weekly: '每周',
      unknownDate: '暂无',
    },
    intro: (revenueColumns, link) => [
      revenueColumns
        ? '每一行告诉你：这家公司赚多少（收入区间）、是否在增长、由谁在做，以及它是如何获客增长的。'
        : '每一行告诉你：这家公司由谁在做，以及它是如何获客增长的。',
      `一步步的增长打法、具体数字和证据，都在 BizPeel 上每家公司的完整报告里——[可免费预览](${link})。`,
    ],
    shortcutsLabel: "按商业模式与增长特征筛选：",
    shortcuts: (revenueColumns) => [
      ...(revenueColumns
        ? [
            [
              "🔥 低流量高变现",
              "shortcut-low-traffic",
              { minMrr: "10000", maxVisits: "10000", sort: "mrr" },
            ],
            [
              "📈 30 天高增长",
              "shortcut-high-growth",
              { minGrowth: "20", sort: "mrr_growth" },
            ],
          ]
        : []),
      [
        "🎯 免费增值（Freemium）",
        "shortcut-freemium",
        { billing: "freemium", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🏢 中小企业 B2B",
        "shortcut-b2b",
        { customer: "smb", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🛠️ 开发者工具与 API",
        "shortcut-devtools",
        { customer: "developers", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🌱 自筹盈利（Bootstrapped）",
        "shortcut-bootstrapped",
        { funding: "bootstrapped", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
    ],
    bottomCta: {
      top: (n, link) =>
        `> **这里只展示了前 100 家。**[在 BizPeel 按赛道、收入区间、增长趋势免费筛选全部 ${n} 家创业公司 →](${link})`,
      topByName: (n, link) =>
        `> **这里只展示了前 100 家。**[在 BizPeel 按赛道与商业模式免费筛选全部 ${n} 家创业公司 →](${link})`,
      fastest: (n, link) =>
        `> **想看更多增长势头？**[在 BizPeel 按 30 天 MRR 涨幅查看全部 ${n} 家创业公司 →](${link})`,
    },
    contents: '目录',
    sections: {
      top: '收入最高的 100 家',
      topByName: '按名称排列',
      fastest: '增长最快',
      recent: '最近收录',
      categories: '按分类',
      howToRead: '怎么读这些表',
      faq: '常见问题',
      license: '许可',
    },
    filterAll: (n, sort) =>
      ({
        mrr: `在 BizPeel 上按 MRR 排序全部 ${n} 家创业公司 →`,
        mrr_growth: `在 BizPeel 上按 MRR 增长排序全部 ${n} 家创业公司 →`,
        recent: `在 BizPeel 上按收录时间排序全部 ${n} 家创业公司 →`,
      })[sort] ?? `在 BizPeel 上筛选、排序全部 ${n} 家创业公司 →`,
    filterCategory: (n, category) =>
      `在 BizPeel 上筛选、排序全部 ${n} 家「${category}」创业公司 →`,
    fastestNote: '最近 30 天 MRR 增长 20% 以上的创业公司，按收入从高到低排列。',
    fastestEmpty: '本次更新中，没有创业公司在最近 30 天里 MRR 增长 20% 以上。',
    topByNameNote: '按名称排列的前 100 家创业公司。',
    topNote: (unbanded) =>
      unbanded
        ? '按 MRR 从高到低排列；没有最新收入数据的公司按名称排在后面，标为 —。'
        : '按 MRR 从高到低排列。',
    columns: {
      rank: '#',
      added: '收录日期',
      startup: '创业公司',
      mrr: 'MRR',
      growth: '增长',
      category: '分类',
      channels: '增长渠道',
      builder: '创始人',
      answers: '如何获客增长？',
      startups: '创业公司数',
    },
    plays: (n) => `查看 ${n} 个增长打法`,
    readReport: '阅读报告',
    howToRead: {
      columnsHead: ['列', '含义'],
      columns: (revenueColumns) => [
        ...(revenueColumns
          ? [
              [
                'MRR',
                '月经常性收入，整理自网上公开分享资料，按区间显示',
              ],
              ['增长', '最近 30 天的 MRR 变化'],
            ]
          : []),
        ['创始人', '创始人的 X 账号；没有创始人账号时为官方账号。粉丝数为约数'],
        ['如何获客增长？', '完整报告解答的核心获客增长问题，以及拆解了多少个增长打法'],
      ],
      bandsTitle: '收入区间（每月 MRR）',
      bandsHead: ['区间', '范围'],
      bands: {
        lt10k: '低于 10,000 美元',
        '10k-30k': '10,000–29,999 美元',
        '30k-50k': '30,000–49,999 美元',
        '50k-100k': '50,000–99,999 美元',
        gte100k: '100,000 美元及以上',
      },
      growthTitle: '增长（最近 30 天的 MRR 变化）',
      growthHead: ['标记', '变化'],
      growth: {
        surging: '增长 20% 及以上',
        up: '增长 5% 到 20%',
        flat: '−5% 到 +5% 之间',
        down: '下降超过 5%',
      },
      unknown: '未知或数据已过期',
    },
    faq: (contactLink, revenueColumns) => [
      [
        '数据从哪里来？',
        `${revenueColumns ? '收入数据整理自网上公开分享资料，这里只显示区间。' : ''}创始人和增长问题来自 BizPeel 对网上公开分享资料的研究整理，完整报告里每一项都注明了来源。`,
      ],
      [
        '多久更新一次？',
        '每周一更新。“数据截至”徽章显示表中最新收入数据的日期。',
      ],
      [
        '怎样让一家创业公司上榜？',
        `BizPeel 上每家已发布报告的创业公司，都会在下一次每周更新时出现在这里。想推荐一家公司，请[联系 BizPeel](${contactLink})。`,
      ],
      [
        '为什么没有具体数字？',
        '这些表是一张告诉你去哪里看的地图。具体的 MRR、增长率、流量和背后的证据都在 BizPeel 的报告里，每个数字都标注了来源和日期。',
      ],
    ],
    license: (homeLink) =>
      `本仓库的代码采用 [MIT 许可证](LICENSE)。表格内容 © BizPeel，注明出处（[BizPeel](${homeLink})）即可链接或引用。`,
    category: {
      subtitle: (n, title) =>
        `本分类下 ${n} 家创业公司，来自 ${title}，每周更新`,
      back: '全部分类',
      howToRead: '怎么读这张表',
      footer: (dataAsOf) =>
        `数据截至 ${dataAsOf}。表格内容 © BizPeel，注明出处即可链接或引用。代码采用 [MIT 许可证](../LICENSE)。`,
    },
  },

  'zh-TW': {
    languageName: '繁體中文',
    fileSuffix: '.zh-TW',
    sitePrefix: '/zh',
    title: 'How Profitable Startups Grow',
    subtitle: '盈利創業公司是怎麼增長的',
    tagline: (n, revenueColumns) =>
      revenueColumns
        ? `${n} 家創業公司的收入區間、30 天趨勢和背後的創始人，每家都附一份完整獲客增長報告，每週更新`
        : `${n} 家創業公司背後的創始人和增長拆解，每家都附一份完整獲客增長報告，每週更新`,
    badges: {
      startups: '創業公司',
      dataAsOf: '數據截至',
      updated: '更新',
      weekly: '每週',
      unknownDate: '暫無',
    },
    intro: (revenueColumns, link) => [
      revenueColumns
        ? '每一行告訴你：這家公司賺多少（收入區間）、是否在增長、由誰在做，以及它是如何獲客增長的。'
        : '每一行告訴你：這家公司由誰在做，以及它是如何獲客增長的。',
      `一步步的增長打法、具體數字和證據，都在 BizPeel 上每家公司的完整報告裡——[可免費預覽](${link})。`,
    ],
    shortcutsLabel: "按商業模式與增長特徵篩選：",
    shortcuts: (revenueColumns) => [
      ...(revenueColumns
        ? [
            [
              "🔥 低流量高變現",
              "shortcut-low-traffic",
              { minMrr: "10000", maxVisits: "10000", sort: "mrr" },
            ],
            [
              "📈 30 天高增長",
              "shortcut-high-growth",
              { minGrowth: "20", sort: "mrr_growth" },
            ],
          ]
        : []),
      [
        "🎯 免費增值（Freemium）",
        "shortcut-freemium",
        { billing: "freemium", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🏢 中小企業 B2B",
        "shortcut-b2b",
        { customer: "smb", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🛠️ 開發者工具與 API",
        "shortcut-devtools",
        { customer: "developers", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
      [
        "🌱 自籌盈利（Bootstrapped）",
        "shortcut-bootstrapped",
        { funding: "bootstrapped", ...(revenueColumns ? { sort: "mrr" } : {}) },
      ],
    ],
    bottomCta: {
      top: (n, link) =>
        `> **這裡只展示了前 100 家。**[在 BizPeel 按賽道、收入區間、增長趨勢免費篩選全部 ${n} 家創業公司 →](${link})`,
      topByName: (n, link) =>
        `> **這裡只展示了前 100 家。**[在 BizPeel 按賽道與商業模式免費篩選全部 ${n} 家創業公司 →](${link})`,
      fastest: (n, link) =>
        `> **想看更多增長勢頭？**[在 BizPeel 按 30 天 MRR 漲幅查看全部 ${n} 家創業公司 →](${link})`,
    },
    contents: '目錄',
    sections: {
      top: '收入最高的 100 家',
      topByName: '按名稱排列',
      fastest: '增長最快',
      recent: '最近收錄',
      categories: '按分類',
      howToRead: '怎麼讀這些表',
      faq: '常見問題',
      license: '許可',
    },
    filterAll: (n, sort) =>
      ({
        mrr: `在 BizPeel 上按 MRR 排序全部 ${n} 家創業公司 →`,
        mrr_growth: `在 BizPeel 上按 MRR 增長排序全部 ${n} 家創業公司 →`,
        recent: `在 BizPeel 上按收錄時間排序全部 ${n} 家創業公司 →`,
      })[sort] ?? `在 BizPeel 上篩選、排序全部 ${n} 家創業公司 →`,
    filterCategory: (n, category) =>
      `在 BizPeel 上篩選、排序全部 ${n} 家「${category}」創業公司 →`,
    fastestNote: '最近 30 天 MRR 增長 20% 以上的創業公司，按收入從高到低排列。',
    fastestEmpty: '本次更新中，沒有創業公司在最近 30 天裡 MRR 增長 20% 以上。',
    topByNameNote: '按名稱排列的前 100 家創業公司。',
    topNote: (unbanded) =>
      unbanded
        ? '按 MRR 從高到低排列；沒有最新收入數據的公司按名稱排在後面，標為 —。'
        : '按 MRR 從高到低排列。',
    columns: {
      rank: '#',
      added: '收錄日期',
      startup: '創業公司',
      mrr: 'MRR',
      growth: '增長',
      category: '分類',
      channels: '增長渠道',
      builder: '創始人',
      answers: '如何獲客增長？',
      startups: '創業公司數',
    },
    plays: (n) => `查看 ${n} 個增長打法`,
    readReport: '閱讀報告',
    howToRead: {
      columnsHead: ['列', '含義'],
      columns: (revenueColumns) => [
        ...(revenueColumns
          ? [
              [
                'MRR',
                '月經常性收入，整理自網上公開分享資料，按區間顯示',
              ],
              ['增長', '最近 30 天的 MRR 變化'],
            ]
          : []),
        ['創始人', '創始人的 X 帳號；沒有創始人帳號時為官方帳號。粉絲數為約數'],
        ['如何獲客增長？', '完整報告解答的核心獲客增長問題，以及拆解了多少個增長打法'],
      ],
      bandsTitle: '收入區間（每月 MRR）',
      bandsHead: ['區間', '範圍'],
      bands: {
        lt10k: '低於 10,000 美元',
        '10k-30k': '10,000–29,999 美元',
        '30k-50k': '30,000–49,999 美元',
        '50k-100k': '50,000–99,999 美元',
        gte100k: '100,000 美元及以上',
      },
      growthTitle: '增長（最近 30 天的 MRR 變化）',
      growthHead: ['標記', '變化'],
      growth: {
        surging: '增長 20% 及以上',
        up: '增長 5% 到 20%',
        flat: '−5% 到 +5% 之間',
        down: '下降超過 5%',
      },
      unknown: '未知或數據已過期',
    },
    faq: (contactLink, revenueColumns) => [
      [
        '數據從哪裡來？',
        `${revenueColumns ? '收入數據整理自網上公開分享資料，這裡只顯示區間。' : ''}創始人和增長問題來自 BizPeel 對網上公開分享資料的研究整理，完整報告裡每一項都註明了來源。`,
      ],
      [
        '多久更新一次？',
        '每週一更新。“數據截至”徽章顯示表中最新收入數據的日期。',
      ],
      [
        '怎樣讓一家創業公司上榜？',
        `BizPeel 上每家已發布報告的創業公司，都會在下一次每週更新時出現在這裡。想推薦一家公司，請[聯繫 BizPeel](${contactLink})。`,
      ],
      [
        '為什麼沒有具體數字？',
        '這些表是一張告訴你去哪裡看的地圖。具體的 MRR、增長率、流量和背後的證據都在 BizPeel 的報告裡，每個數字都標註了來源和日期。',
      ],
    ],
    license: (homeLink) =>
      `本倉庫的代碼採用 [MIT 許可證](LICENSE)。表格內容 © BizPeel，註明出處（[BizPeel](${homeLink})）即可連結或引用。`,
    category: {
      subtitle: (n, title) =>
        `本分類下 ${n} 家創業公司，來自 ${title}，每週更新`,
      back: '全部分類',
      howToRead: '怎麼讀這張表',
      footer: (dataAsOf) =>
        `數據截至 ${dataAsOf}。表格內容 © BizPeel，註明出處即可連結或引用。代碼採用 [MIT 許可證](../LICENSE)。`,
    },
  },
};
