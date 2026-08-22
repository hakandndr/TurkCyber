/**
 * Assertions against the built site.
 *
 * These run over `dist/`, so they verify what actually ships rather than what
 * the source intends. Run `pnpm build` before `pnpm test`; CI does both.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_IDS, NAV } from '../src/config/site';
import { normalizeForSearch, searchDocuments, turkishLower } from '../src/lib/search';

const DIST = join(process.cwd(), 'dist');
const built = existsSync(DIST);

const read = (path: string): string => readFileSync(join(DIST, path), 'utf8');

describe.runIf(built)('sitemap', () => {
  it('excludes every private and non-content route', () => {
    const sitemap = read('sitemap.xml');
    for (const forbidden of ['/boss', '/api', '/collect', '/ara', 'search-index']) {
      expect(sitemap).not.toContain(forbidden);
    }
  });

  it('lists the public pages and every category', () => {
    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain('https://turkcyber.com/');
    expect(sitemap).toContain('/rehberler/');
    expect(sitemap).toContain('/gizlilik/');
    for (const category of CATEGORIES) {
      expect(sitemap).toContain(`/konular/${category.id}/`);
    }
  });

  it('contains no draft or review content', () => {
    expect(read('sitemap.xml')).not.toContain('ornek-haber-sablonu');
  });
});

describe.runIf(built)('robots.txt', () => {
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

describe.runIf(built)('published guides', () => {
  const guideDir = join(DIST, 'rehberler');
  const slugs = readdirSync(guideDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('built every published guide', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(8);
  });

  it('gives each guide the required metadata', () => {
    for (const slug of slugs) {
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
    for (const slug of slugs) {
      expect(read(join('rehberler', slug, 'index.html')), slug).not.toContain(
        'name="robots" content="noindex',
      );
    }
  });

  it('renders the comment form and its inline guidance', () => {
    const html = read(join('rehberler', slugs[0]!, 'index.html'));
    expect(html).toContain('id="yorumlar"');
    expect(html).toContain('Yorumunuzu yazın');
    // There is deliberately no separate comment-rules page.
    expect(html).not.toContain('/yorum-kurallari');
  });
});

describe.runIf(built)('draft content', () => {
  it('does not publish the news template', () => {
    expect(existsSync(join(DIST, 'haberler', 'ornek-haber-sablonu'))).toBe(false);
  });

  it('shows the empty state on the news index', () => {
    expect(read(join('haberler', 'index.html'))).toContain('Henüz haber yayınlanmadı');
  });
});

describe.runIf(built)('private routes are absent from the static build', () => {
  it('ships no /boss page', () => {
    expect(existsSync(join(DIST, 'boss'))).toBe(false);
  });

  it('never links /boss from public navigation', () => {
    for (const page of ['index.html', join('rehberler', 'index.html')]) {
      expect(read(page)).not.toContain('/boss');
    }
    expect(NAV.some((item) => item.href.includes('boss'))).toBe(false);
  });
});

describe.runIf(built)('search index', () => {
  const documents = JSON.parse(read('search-index.json'));

  it('contains only published content', () => {
    expect(documents.length).toBeGreaterThanOrEqual(8);
    expect(documents.every((d: { slug: string }) => d.slug !== 'ornek-haber-sablonu')).toBe(true);
  });

  it('gives every document a resolvable url and a known category', () => {
    for (const doc of documents) {
      expect(doc.url).toMatch(/^\/(rehberler|haberler)\/[a-z0-9-]+\/$/);
      expect(CATEGORY_IDS).toContain(doc.category);
    }
  });
});

describe('Turkish text handling', () => {
  it('lowercases with Turkish rules, not invariant rules', () => {
    // The dotted capital İ lowercases to i; the dotless capital I to ı.
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
        category: 'sifreler-passkeys',
        categoryName: 'Şifreler & Passkeys',
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
        category: 'sifreler-passkeys',
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

  it('gives every category a Turkish name and description', () => {
    for (const category of CATEGORIES) {
      expect(category.name.length).toBeGreaterThan(3);
      expect(category.description.length).toBeGreaterThan(20);
    }
  });
});
