/**
 * Assertions against the built site.
 *
 * ── Two rules this file must keep ─────────────────────────────────────────
 *
 * 1. **Read only `TEST_DIST`, never `dist/`.** `tests/global-setup.ts` rebuilds
 *    `.test-dist/` from scratch on every run. `dist/` belongs to the developer
 *    and may be stale; asserting against it produced failures that had nothing
 *    to do with the current source (retired category ids in the sitemap and
 *    search index).
 *
 * 2. **No filesystem access at module scope.** Vitest evaluates a suite factory
 *    even when it is skipped, so a `readdirSync` at the top level throws during
 *    collection — before any guard applies, and before global setup's output
 *    can help. That is exactly how this suite failed with a bare
 *    `ENOENT ... scandir 'dist/rehberler'`. `describe.runIf` does NOT protect a
 *    top-level read. Every read below happens inside a test body or `beforeAll`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_IDS, CONTENT_AREAS, NAV } from '../src/config/site';
import { READY_TOOLS } from '../src/config/tools';
import { LEVELS, WEIGHT_ORDER, allItems, evaluateChecklist } from '../src/lib/tools/checklist';
import { HESAP_GUVENLIK_PUANI } from '../src/lib/tools/hesap-guvenlik-puani';
import { INSTAGRAM_GUVENLIK_TESTI } from '../src/lib/tools/instagram-guvenlik-testi';
import { HOME_TITLE, TITLE_MAX, documentTitle } from '../src/lib/seo';
import {
  normalizeForSearch,
  searchDocuments,
  turkishLower,
  type SearchDocument,
} from '../src/lib/search';
import { TEST_DIST } from './paths';

/** Read a file from the test build, failing with an actionable message. */
const read = (path: string): string => {
  const full = join(TEST_DIST, path);
  if (!existsSync(full)) {
    throw new Error(
      `${path} is missing from the test build (${TEST_DIST}). ` +
        'tests/global-setup.ts should have produced it — check the build output above.',
    );
  }
  return readFileSync(full, 'utf8');
};

/** Directory names under a build subdirectory. Called inside tests only. */
const dirsIn = (path: string): string[] => {
  const full = join(TEST_DIST, path);
  if (!existsSync(full)) {
    throw new Error(`${path} is missing from the test build (${TEST_DIST}).`);
  }
  return readdirSync(full, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
};

const guideSlugs = (): string[] => dirsIn('rehberler');

/** Every <loc> in the sitemap, as a path. */
const sitemapPaths = (): string[] =>
  [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]!).pathname,
  );

beforeAll(() => {
  // One clear failure if global setup did not run, instead of an ENOENT from
  // whichever test happened to touch the filesystem first.
  if (!existsSync(join(TEST_DIST, 'index.html'))) {
    throw new Error(
      `No test build found at ${TEST_DIST}. ` +
        'tests/global-setup.ts builds it; confirm globalSetup is registered in vitest.config.ts.',
    );
  }
});

describe('the test build itself', () => {
  it('is the suite own output, not the developer dist/', () => {
    // Guards the hermetic property directly: if someone repoints the tests at
    // dist/, this fails and says why.
    expect(TEST_DIST.endsWith('.test-dist')).toBe(true);
    expect(existsSync(join(TEST_DIST, 'index.html'))).toBe(true);
  });
});

describe('sitemap', () => {
  it('excludes every private and non-content route', () => {
    const paths = sitemapPaths();

    // Exact paths, not substrings: `/ara/` (the search page) must be absent
    // while `/araclar/` (the tools index) must be present, and a substring
    // check cannot tell those apart.
    expect(paths).not.toContain('/ara/');
    expect(paths).not.toContain('/search-index.json');

    for (const path of paths) {
      expect(path.startsWith('/boss'), path).toBe(false);
      expect(path.startsWith('/api'), path).toBe(false);
      expect(path.startsWith('/collect'), path).toBe(false);
    }
  });

  it('includes the tools index but not the search page', () => {
    const paths = sitemapPaths();
    expect(paths).toContain('/araclar/');
    expect(paths).not.toContain('/ara/');
  });

  it('lists the public pages and every category', () => {
    const paths = sitemapPaths();
    expect(paths).toContain('/');
    expect(paths).toContain('/rehberler/');
    expect(paths).toContain('/gizlilik/');
    for (const category of CATEGORIES) {
      expect(paths, category.id).toContain(`/konular/${category.id}/`);
    }
  });

  it('carries only current category ids', () => {
    // A stale build is how retired ids used to reach this assertion. The suite
    // builds its own output now, so any id here comes from the current config.
    for (const path of sitemapPaths().filter((p) => p.startsWith('/konular/'))) {
      const id = path.replace('/konular/', '').replace('/', '');
      if (id === '') continue;
      expect(CATEGORY_IDS, `retired category id in sitemap: ${id}`).toContain(id);
    }
  });

  it('contains no draft or review content', () => {
    expect(read('sitemap.xml')).not.toContain('ornek-haber-sablonu');
  });
});

describe('robots.txt', () => {
  it('disallows the private routes and points at the sitemap', () => {
    const robots = read('robots.txt');
    expect(robots).toContain('Disallow: /boss');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /collect');
    expect(robots).toContain('Sitemap: https://turkcyber.com/sitemap.xml');
  });

  it('does not block public content', () => {
    const robots = read('robots.txt');
    expect(robots).toContain('Allow: /');
    expect(robots).not.toMatch(/Disallow:\s*\/\s*$/m);
  });
});

describe('published guides', () => {
  it('built every published guide', () => {
    expect(guideSlugs().length).toBeGreaterThanOrEqual(8);
  });

  it('gives each guide the required metadata', () => {
    for (const slug of guideSlugs()) {
      const html = read(join('rehberler', slug, 'index.html'));
      expect(html, slug).toContain('<link rel="canonical"');
      expect(html, slug).toContain('property="og:title"');
      expect(html, slug).toContain('name="twitter:card"');
      expect(html, slug).toContain('application/ld+json');
      expect(html, slug).toMatch(/<meta name="description" content=".{40,}?"/);
      expect(html, slug).toContain('lang="tr"');
    }
  });

  it('never marks a published guide noindex', () => {
    for (const slug of guideSlugs()) {
      expect(read(join('rehberler', slug, 'index.html')), slug).not.toContain(
        'name="robots" content="noindex',
      );
    }
  });

  it('renders the comment form and its inline guidance', () => {
    const html = read(join('rehberler', guideSlugs()[0]!, 'index.html'));
    expect(html).toContain('id="yorumlar"');
    expect(html).toContain('Yorumunuzu yazın');
    // There is deliberately no separate comment-rules page.
    expect(html).not.toContain('/yorum-kurallari');
  });
});

describe('myth entries', () => {
  it('built every published myth with its verdict', () => {
    const slugs = dirsIn('efsane-mi-gercek-mi');
    expect(slugs.length).toBeGreaterThanOrEqual(5);

    for (const slug of slugs) {
      const html = read(join('efsane-mi-gercek-mi', slug, 'index.html'));
      expect(html, slug).toMatch(/verdict verdict-(red|green|amber)/);
    }
  });
});

describe('the draft publication gate', () => {
  // Regression guard. The gate used to read `import.meta.env.DEV`, which an
  // ambient NODE_ENV can flip: `NODE_ENV=test astro build` produced a
  // production build containing draft content. It must stay an explicit
  // opt-in that defaults to closed.
  it('does not depend on import.meta.env.DEV', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'content.ts'), 'utf8');
    expect(source).toContain("import.meta.env.SHOW_UNPUBLISHED === 'true'");

    // Only the explanatory comment may mention the old API; no code line may
    // read it. Comment lines are stripped before the check.
    const code = source
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toContain('import.meta.env.DEV');
  });

  it('keeps the opt-in flag in the development environment file only', () => {
    // .env.development is loaded by `astro dev`, never by `astro build`.
    const devEnv = readFileSync(join(process.cwd(), '.env.development'), 'utf8');
    expect(devEnv).toContain('SHOW_UNPUBLISHED=true');
    expect(existsSync(join(process.cwd(), '.env.production'))).toBe(false);
  });
});

describe('draft content', () => {
  it('does not publish the news template', () => {
    expect(existsSync(join(TEST_DIST, 'haberler', 'ornek-haber-sablonu'))).toBe(false);
  });

  /*
   * With no published news the section must be designed, not absent. A shelf
   * that silently disappears tells a returning visitor nothing, and the
   * alternative — inventing a news item to fill it — is forbidden outright.
   */
  it('shows a designed empty state on the news index', () => {
    const html = read(join('haberler', 'index.html'));
    expect(html).toContain('Henüz yayınlanmış güncel güvenlik haberi yok');
    expect(html).not.toContain('Haber Şablonu');
  });

  it('shows the same empty state on the homepage rather than dropping the section', () => {
    const html = read('index.html');
    expect(html).toContain('Güncel güvenlik haberleri');
    expect(html).toContain('Henüz yayınlanmış güncel güvenlik haberi yok');
  });
});

describe('grouped navigation', () => {
  it('keeps the header to four destinations plus search', () => {
    expect(NAV.length).toBe(4);
    expect(NAV.map((item) => item.href)).toEqual([
      '/icerikler/',
      '/teknik/',
      '/hakkinda/',
      '/iletisim/',
    ]);
  });

  /*
   * A parent label that only opens a menu is a dead end for keyboard, screen
   * reader and touch. The group must have a real page behind it.
   */
  it('gives the content group a real page of its own', () => {
    expect(existsSync(join(TEST_DIST, 'icerikler', 'index.html'))).toBe(true);
    expect(sitemapPaths()).toContain('/icerikler/');
  });

  it('links every content area from the hub', () => {
    const html = read(join('icerikler', 'index.html'));
    for (const area of CONTENT_AREAS) {
      expect(html, `${area.href} missing from the hub`).toContain(`href="${area.href}"`);
    }
  });

  it('exposes the group as a button with aria state, not a hover menu', () => {
    const html = read('index.html');
    expect(html).toContain('aria-controls="nav-group-icerikler"');
    expect(html).toMatch(/aria-expanded="false"/);
  });
});

describe('private routes are absent from the static build', () => {
  it('ships no /boss page', () => {
    expect(existsSync(join(TEST_DIST, 'boss'))).toBe(false);
  });

  it('never links /boss from public navigation', () => {
    for (const page of ['index.html', join('rehberler', 'index.html')]) {
      expect(read(page)).not.toContain('/boss');
    }
    expect(NAV.some((item) => item.href.includes('boss'))).toBe(false);
  });
});

describe('search index', () => {
  const documents = (): SearchDocument[] => JSON.parse(read('search-index.json'));

  it('contains only published content', () => {
    const docs = documents();
    expect(docs.length).toBeGreaterThanOrEqual(8);
    expect(docs.every((d) => d.slug !== 'ornek-haber-sablonu')).toBe(true);
  });

  it('gives every document a resolvable url and a current category', () => {
    for (const doc of documents()) {
      expect(doc.url).toMatch(
        /^\/(rehberler|haberler|efsane-mi-gercek-mi|teknik|araclar)\/[a-z0-9-]+\/$/,
      );
      // Catches a retired category id surviving in generated output. Tools
      // carry an empty category when they are not filed under one.
      if (doc.kind !== 'arac' || doc.category) {
        expect(CATEGORY_IDS, `retired category id in search index: ${doc.category}`).toContain(
          doc.category,
        );
      }
    }
  });

  /*
   * The content type used to be derived as "guides ? rehber : haber", so every
   * myth announced itself as HABER in the result list — the opposite of what
   * the page is. This pins the mapping to the URL, which cannot drift.
   */
  it('labels each document with the content type its url implies', () => {
    const EXPECTED: Record<string, string> = {
      rehberler: 'rehber',
      haberler: 'haber',
      'efsane-mi-gercek-mi': 'efsane',
      teknik: 'teknik',
      araclar: 'arac',
    };

    for (const doc of documents()) {
      const section = doc.url.split('/')[1]!;
      expect(doc.kind, `${doc.url} is labelled ${doc.kind}`).toBe(EXPECTED[section]);
      expect(doc.kindLabel.length).toBeGreaterThan(0);
    }
  });

  it('carries pre-normalised fields for every document', () => {
    for (const doc of documents()) {
      expect(doc.n.title, doc.url).toBe(normalizeForSearch(doc.title));
      // Normalisation folds Turkish characters away; anything left is a bug.
      expect(doc.n.title).toMatch(/^[a-z0-9 ]*$/);
    }
  });

  it('includes the shipped tools so they can be found by name', () => {
    const tools = documents().filter((doc) => doc.kind === 'arac');
    expect(tools.length).toBe(READY_TOOLS.length);

    for (const tool of READY_TOOLS) {
      expect(tools.some((doc) => doc.url === tool.href)).toBe(true);
    }
  });
});

describe('the technical lane', () => {
  it('publishes every technical entry under /teknik/', () => {
    const slugs = dirsIn('teknik');
    expect(slugs.length).toBeGreaterThanOrEqual(4);

    for (const slug of slugs) {
      expect(read(join('teknik', slug, 'index.html'))).toContain('İLERİ SEVİYE');
    }
  });

  it('is reachable from the navigation and listed in the sitemap', () => {
    expect(NAV.some((item) => item.href === '/teknik/')).toBe(true);
    expect(sitemapPaths()).toContain('/teknik/');
  });

  /*
   * This test checks that the article contains the actual nuance we want:
   * normal phishing usually needs a second step, while browser/device
   * vulnerabilities are real exceptions.
   *
   * We intentionally do NOT ban phrases such as "asla zarar veremez", because
   * the article may quote or explicitly reject that absolute claim.
   */
  it('explains link-clicking risk without categorical reassurance', () => {
    const html = read(join('teknik', 'link-tiklamak-tek-basina-ne-yapar', 'index.html'));

    expect(html).toContain('Yamanmamış bir açık');
    expect(html).toMatch(/neredeyse her zaman ikinci bir şey/i);
    expect(html).toMatch(/nadir[\s\S]{0,160}imkânsız/i);
    expect(html).toMatch(/yaygın iki cevap da yanlış/i);
    expect(html).toMatch(/tıklamak hiçbir şey yapmaz/i);
  });
});

describe('the tools registry', () => {
  it('builds a page for every shipped tool and lists it in the sitemap', () => {
    const paths = sitemapPaths();

    for (const tool of READY_TOOLS) {
      const slug = tool.href!.replace(/^\/araclar\/|\/$/g, '');
      expect(read(join('araclar', slug, 'index.html'))).toContain(tool.title);
      expect(paths, `${tool.href} missing from sitemap`).toContain(tool.href);
    }
  });

  it('never asks for a password and says so on the page', () => {
    for (const tool of READY_TOOLS) {
      const slug = tool.href!.replace(/^\/araclar\/|\/$/g, '');
      const html = read(join('araclar', slug, 'index.html'));

      expect(html, `${tool.href} has a password field`).not.toMatch(/type="password"/);
      expect(html).toMatch(/gönderilmez/);
    }
  });

  it('reports a band rather than a fabricated percentage', () => {
    const result = evaluateChecklist(HESAP_GUVENLIK_PUANI, new Set());
    expect(result.level).toBe('zayif');
    expect(Object.keys(LEVELS)).toContain(result.level);
    // No percentage anywhere in the result shape — that is the whole point.
    expect(Object.keys(result)).toEqual(['total', 'checked', 'missing', 'level']);
  });

  it('orders the advice by consequence, not by position on the page', () => {
    const result = evaluateChecklist(INSTAGRAM_GUVENLIK_TESTI, new Set());
    const weights = result.missing.map((item) => item.weight);
    const sorted = [...weights].sort((a, b) => WEIGHT_ORDER[a] - WEIGHT_ORDER[b]);
    expect(weights).toEqual(sorted);
  });

  it('reaches the best level only when nothing is missing', () => {
    const all = new Set(allItems(HESAP_GUVENLIK_PUANI).map((item) => item.id));
    expect(evaluateChecklist(HESAP_GUVENLIK_PUANI, all).level).toBe('iyi');

    // One critical gap outweighs everything else being in place.
    const items = allItems(HESAP_GUVENLIK_PUANI);
    const critical = items.find((item) => item.weight === 'critical')!;
    const allButOne = new Set(items.filter((i) => i.id !== critical.id).map((i) => i.id));
    expect(evaluateChecklist(HESAP_GUVENLIK_PUANI, allButOne).level).toBe('zayif');
  });

  it('ignores an id that is not in the definition', () => {
    const result = evaluateChecklist(HESAP_GUVENLIK_PUANI, new Set(['not-a-real-item']));
    expect(result.checked).toBe(0);
  });
});

describe('titles', () => {
  it('gives the homepage its own descriptive title', () => {
    expect(read('index.html')).toContain(`<title>${HOME_TITLE}</title>`);
  });

  it('says what kind of page a content result is', () => {
    const title = documentTitle({ title: 'Passkey nedir?', kind: 'rehber' });
    expect(title).toBe('Passkey nedir? · Rehber | TurkCyber');
  });

  it('drops the brand before it truncates a long title', () => {
    const long = 'Ç'.repeat(TITLE_MAX - 5);
    expect(documentTitle({ title: long, kind: 'rehber' })).toBe(long);
  });

  it('uses a frontmatter override verbatim', () => {
    expect(documentTitle({ title: 'Bir şey', kind: 'rehber', override: 'Elle yazıldı' })).toBe(
      'Elle yazıldı',
    );
  });
});

describe('structured data', () => {
  const ld = (path: string): Record<string, unknown>[] => {
    const html = read(path);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks.length, `no JSON-LD in ${path}`).toBeGreaterThan(0);

    return blocks.flatMap((block) => {
      const parsed = JSON.parse(block[1]!);
      return (parsed['@graph'] ?? [parsed]) as Record<string, unknown>[];
    });
  };

  it('emits a breadcrumb trail on an article', () => {
    const nodes = ld(join('rehberler', 'passkey-nedir', 'index.html'));
    const crumbs = nodes.find((node) => node['@type'] === 'BreadcrumbList');
    expect(crumbs).toBeDefined();

    const items = crumbs!.itemListElement as Array<{ position: number; item: string }>;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]!.item).toBe('https://turkcyber.com/');
    // Positions must be 1-based and contiguous or the markup is invalid.
    expect(items.map((i) => i.position)).toEqual(items.map((_, index) => index + 1));
  });

  it('reviews a myth as a claim rather than as an article', () => {
    const slug = dirsIn('efsane-mi-gercek-mi')[0]!;
    const nodes = ld(join('efsane-mi-gercek-mi', slug, 'index.html'));
    const review = nodes.find((node) => node['@type'] === 'ClaimReview');
    expect(review).toBeDefined();
    expect(review!.claimReviewed).toBeTruthy();
  });

  it('never invents a person as the author', () => {
    const nodes = ld(join('rehberler', 'passkey-nedir', 'index.html'));
    const article = nodes.find((node) => String(node['@type']).endsWith('Article'));
    expect((article!.author as { '@type': string })['@type']).toBe('Organization');
  });
});

describe('the privacy page', () => {
  const html = (): string => read(join('gizlilik', 'index.html'));

  it('states the retention window', () => {
    expect(html()).toContain('en fazla 90 gün');
  });

  /*
   * No law is being cited here. Claiming one would be a fabricated legal
   * assertion on a page whose entire value is that it is accurate.
   */
  it('never presents the retention window as a legal requirement', () => {
    expect(html()).not.toMatch(/kanun gereği/i);
    expect(html()).not.toMatch(/yasal zorunluluk/i);
  });

  it('still discloses that the full IP address is stored', () => {
    expect(html()).toMatch(/IP adresiniz/);
  });
});

describe('the contact form', () => {
  it('renders a Formspree form when the endpoint is configured', () => {
    const html = read(join('iletisim', 'index.html'));

    // Either a real form or the documented email fallback — never a form
    // pointing at a placeholder, which would discard messages silently.
    const hasForm = /action="https:\/\/formspree\.io\/f\/[A-Za-z0-9]+"/.test(html);
    const hasFallback = html.includes('mailto:admin@turkcyber.com');
    expect(hasForm || hasFallback).toBe(true);

    if (hasForm) {
      for (const field of ['name="name"', 'name="email"', 'name="subject"', 'name="message"']) {
        expect(html, field).toContain(field);
      }
      // Spam-resistance field must survive any edit to the form.
      expect(html).toContain('_gotcha');
    }
  });

  it('keeps the account-recovery boundary visible', () => {
    expect(read(join('iletisim', 'index.html'))).toContain('hesap kurtarma');
  });
});

describe('Turkish text handling', () => {
  it('lowercases with Turkish rules, not invariant rules', () => {
    // The dotted capital I lowercases to i; the dotless capital I to the
    // dotless lowercase form.
    expect(turkishLower('İSTANBUL')).toBe('istanbul');
    expect(turkishLower('ILIK')).toBe('ılık');
  });

  it('folds diacritics so an ASCII query still matches', () => {
    expect(normalizeForSearch('Şifre Güvenliği')).toBe('sifre guvenligi');
    expect(normalizeForSearch('İki Aşamalı Doğrulama')).toBe('iki asamali dogrulama');
  });

  /**
   * Build a search document the way the index builds one.
   *
   * Tests used to hand-write the whole shape, which meant every field change
   * broke six unrelated assertions and tempted the next person to weaken the
   * type instead of the fixture.
   */
  const doc = (fields: {
    slug: string;
    title: string;
    description?: string;
    tags?: string[];
    categoryName?: string;
    body?: string;
    kind?: SearchDocument['kind'];
  }): SearchDocument => ({
    slug: fields.slug,
    url: `/rehberler/${fields.slug}/`,
    title: fields.title,
    description: fields.description ?? '',
    category: 'sifreler-2fa',
    categoryName: fields.categoryName ?? '',
    tags: fields.tags ?? [],
    kind: fields.kind ?? 'rehber',
    kindLabel: 'REHBER',
    n: {
      title: normalizeForSearch(fields.title),
      tags: normalizeForSearch((fields.tags ?? []).join(' ')),
      category: normalizeForSearch(fields.categoryName ?? ''),
      summary: normalizeForSearch(fields.description ?? ''),
      body: normalizeForSearch(fields.body ?? ''),
    },
  });

  it('finds a guide typed without Turkish characters', () => {
    const docs = [
      doc({
        slug: 'sifre-yoneticisi-guvenli-mi',
        title: 'Şifre Yöneticisi Kullanmak Güvenli mi?',
        description: 'Şifre yöneticileri hakkında.',
        tags: ['şifre yöneticisi'],
        body: 'kasa ana şifre',
      }),
    ];

    expect(searchDocuments(docs, 'sifre').length).toBe(1);
    expect(searchDocuments(docs, 'ŞİFRE').length).toBe(1);
    expect(searchDocuments(docs, 'guvenli').length).toBe(1);
    expect(searchDocuments(docs, 'passkey').length).toBe(0);
  });

  it('requires every term to match, so two words do not return everything', () => {
    const docs = [doc({ slug: 'a', title: 'Şifre rehberi', body: 'şifre rehberi' })];
    expect(searchDocuments(docs, 'sifre').length).toBe(1);
    expect(searchDocuments(docs, 'sifre passkey').length).toBe(0);
  });

  /*
   * The stated priority is exact title, then title-starts-with, then
   * title-contains, then tags and category, then summary, then body. Each
   * assertion below pins one boundary of that order — a body-only match used
   * to be able to outrank an exact title by accumulating enough hits.
   */
  it('ranks an exact title match above every other kind of match', () => {
    const docs = [
      doc({ slug: 'body', title: 'Tamamen başka bir yazı', body: 'passkey passkey passkey' }),
      doc({ slug: 'tags', title: 'İlgisiz başlık', tags: ['passkey', 'passkey'] }),
      doc({ slug: 'contains', title: 'Bir passkey rehberi daha', body: 'passkey' }),
      doc({ slug: 'prefix', title: 'Passkey nedir ve neden önemlidir', body: 'passkey' }),
      doc({ slug: 'exact', title: 'Passkey' }),
    ];

    const order = searchDocuments(docs, 'passkey').map((hit) => hit.slug);
    expect(order).toEqual(['exact', 'prefix', 'contains', 'tags', 'body']);
  });

  it('ranks a tag match above a body-only match', () => {
    const docs = [
      doc({ slug: 'body', title: 'Bir yazı', body: 'kimlik avı kimlik avı kimlik avı' }),
      doc({ slug: 'tags', title: 'Başka bir yazı', tags: ['kimlik avı'] }),
    ];

    expect(searchDocuments(docs, 'kimlik avi').map((hit) => hit.slug)).toEqual(['tags', 'body']);
  });

  it('ranks a summary match above a body-only match', () => {
    const docs = [
      doc({ slug: 'body', title: 'Bir yazı', body: 'oturum çerezi' }),
      doc({ slug: 'summary', title: 'Başka bir yazı', description: 'oturum çerezi nedir' }),
    ];

    expect(searchDocuments(docs, 'oturum').map((hit) => hit.slug)).toEqual(['summary', 'body']);
  });

  it('matches on a category name, not only on the document body', () => {
    const docs = [doc({ slug: 'a', title: 'Bir yazı', categoryName: 'Hesap Güvenliği' })];
    expect(searchDocuments(docs, 'hesap').length).toBe(1);
  });

  it('ignores a query shorter than two characters', () => {
    expect(searchDocuments([], 'a')).toEqual([]);
    expect(searchDocuments([], '')).toEqual([]);
  });
});

describe('category configuration', () => {
  it('keeps ids unique and url-safe', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every category a Turkish name, description and question', () => {
    for (const category of CATEGORIES) {
      expect(category.name.length).toBeGreaterThan(3);
      expect(category.description.length).toBeGreaterThan(20);
      expect(category.question.length).toBeGreaterThan(8);
    }
  });
});
