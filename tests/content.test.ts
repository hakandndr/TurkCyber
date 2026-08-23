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
import { CATEGORIES, CATEGORY_IDS, NAV } from '../src/config/site';
import { normalizeForSearch, searchDocuments, turkishLower } from '../src/lib/search';
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

  it('shows the empty state on the news index', () => {
    expect(read(join('haberler', 'index.html'))).toContain('Henüz haber yayınlanmadı');
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
  const documents = (): Array<{ slug: string; url: string; category: string }> =>
    JSON.parse(read('search-index.json'));

  it('contains only published content', () => {
    const docs = documents();
    expect(docs.length).toBeGreaterThanOrEqual(8);
    expect(docs.every((d) => d.slug !== 'ornek-haber-sablonu')).toBe(true);
  });

  it('gives every document a resolvable url and a current category', () => {
    for (const doc of documents()) {
      expect(doc.url).toMatch(/^\/(rehberler|haberler|efsane-mi-gercek-mi)\/[a-z0-9-]+\/$/);
      // Catches a retired category id surviving in generated output.
      expect(CATEGORY_IDS, `retired category id in search index: ${doc.category}`).toContain(
        doc.category,
      );
    }
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

  it('finds a guide typed without Turkish characters', () => {
    const docs = [
      {
        slug: 'sifre-yoneticisi-guvenli-mi',
        url: '/rehberler/sifre-yoneticisi-guvenli-mi/',
        title: 'Şifre Yöneticisi Kullanmak Güvenli mi?',
        description: 'Şifre yöneticileri hakkında.',
        category: 'sifreler-2fa',
        categoryName: 'Şifreler, Passkeys & 2FA',
        tags: ['şifre yöneticisi'],
        kind: 'rehber' as const,
        haystack: normalizeForSearch('Şifre Yöneticisi Kullanmak Güvenli mi? kasa ana şifre'),
      },
    ];

    expect(searchDocuments(docs, 'sifre').length).toBe(1);
    expect(searchDocuments(docs, 'ŞİFRE').length).toBe(1);
    expect(searchDocuments(docs, 'guvenli').length).toBe(1);
    expect(searchDocuments(docs, 'passkey').length).toBe(0);
  });

  it('requires every term to match, so two words do not return everything', () => {
    const docs = [
      {
        slug: 'a',
        url: '/rehberler/a/',
        title: 'Şifre rehberi',
        description: '',
        category: 'sifreler-2fa',
        categoryName: '',
        tags: [],
        kind: 'rehber' as const,
        haystack: normalizeForSearch('şifre rehberi'),
      },
    ];
    expect(searchDocuments(docs, 'sifre').length).toBe(1);
    expect(searchDocuments(docs, 'sifre passkey').length).toBe(0);
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
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every category a Turkish name, description and question', () => {
    for (const category of CATEGORIES) {
      expect(category.name.length).toBeGreaterThan(3);
      expect(category.description.length).toBeGreaterThan(20);
      expect(category.question.length).toBeGreaterThan(8);
    }
  });
});
