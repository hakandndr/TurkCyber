/**
 * Titles, descriptions and structured data.
 *
 * ── Why this is one module ───────────────────────────────────────────────
 *
 * Every page used to build its own `<title>` by handing BaseLayout a bare
 * name, which produced `Rehberler — TurkCyber` for a listing and
 * `Passkey nedir? — TurkCyber` for an article: nothing in the title said what
 * kind of page a search result was. Search engines and readers both use that
 * signal, and it is the one part of a result a reader sees before deciding.
 *
 * Titles are therefore assembled here, from the content type, so the shape is
 * consistent and testable rather than remembered.
 *
 * ── Honesty constraints ──────────────────────────────────────────────────
 *
 * Structured data is a place where sites invent things: author credentials,
 * organisation awards, review scores, `datePublished` values that flatter.
 * None of that is generated here. Every field below is either a literal from
 * `SITE`, or a value that came from validated frontmatter. There is no
 * `author.jobTitle`, no `knowsAbout`, no `sameAs` list of profiles that may
 * not exist, and no `aggregateRating` — the site has no ratings.
 */
import { SITE } from '../config/site';

export type ContentKind = 'rehber' | 'efsane' | 'haber' | 'teknik' | 'arac';

export interface ContentKindMeta {
  /** Short uppercase token used on cards and in search results. */
  badge: string;
  /** Sentence-case descriptor used inside `<title>`. */
  descriptor: string;
  /** Section name, for breadcrumbs and listing headings. */
  section: string;
  /** The listing page this kind lives under. */
  basePath: string;
}

/**
 * The five content types a visitor can land on.
 *
 * `efsane` is a genuinely separate type rather than a guide category: the
 * title is the claim and the page answers it before the click. Labelling it
 * HABER — which the search index did until this pass — told the reader the
 * opposite of what the page is.
 */
export const CONTENT_KINDS: Record<ContentKind, ContentKindMeta> = {
  rehber: {
    badge: 'REHBER',
    descriptor: 'Rehber',
    section: 'Rehberler',
    basePath: '/rehberler/',
  },
  efsane: {
    badge: 'EFSANE',
    descriptor: 'Efsane mi, gerçek mi?',
    section: 'Efsane mi, gerçek mi?',
    basePath: '/efsane-mi-gercek-mi/',
  },
  haber: {
    badge: 'HABER',
    descriptor: 'Haber',
    section: 'Haberler',
    basePath: '/haberler/',
  },
  teknik: {
    badge: 'TEKNİK',
    descriptor: 'Nasıl çalışıyor?',
    section: 'Teknik Derinlik',
    basePath: '/teknik/',
  },
  arac: {
    badge: 'ARAÇ',
    descriptor: 'Araç',
    section: 'Araçlar',
    basePath: '/araclar/',
  },
};

const COLLECTION_KIND: Record<string, ContentKind> = {
  guides: 'rehber',
  myths: 'efsane',
  news: 'haber',
  technical: 'teknik',
};

export function kindOfCollection(collection: string): ContentKind {
  return COLLECTION_KIND[collection] ?? 'rehber';
}

/**
 * The homepage title. Longer than the per-page budget on purpose: it is the
 * one query where the site name alone is not enough to say what the site is.
 */
export const HOME_TITLE =
  'TurkCyber | Dijital Güvenlik, Dolandırıcılık ve Hesap Güvenliği Rehberleri';

/**
 * Practical `<title>` budget.
 *
 * Google truncates on rendered pixel width, not characters, so no number is
 * exact. 65 is a conservative stand-in that keeps most Turkish titles whole,
 * and the degradation below is ordered so the page's own name survives last.
 */
export const TITLE_MAX = 65;

export interface TitleInput {
  /** The page's own name. */
  title: string;
  /** Content type, when the page is a piece of content. */
  kind?: ContentKind;
  /** Frontmatter `seoTitle`. Used verbatim — an author override is final. */
  override?: string;
}

/**
 * Assemble a `<title>`.
 *
 * Degrades in this order, stopping at the first thing that fits:
 *   1. `Title · Descriptor | TurkCyber`
 *   2. `Title | TurkCyber`
 *   3. `Title`
 *
 * The site name is dropped before the title is truncated, because a cut-off
 * title is unreadable while a missing brand suffix merely costs a little
 * recognition.
 */
export function documentTitle({ title, kind, override }: TitleInput): string {
  const trimmed = title.trim();
  if (override && override.trim()) return override.trim();

  if (kind) {
    const withKind = `${trimmed} · ${CONTENT_KINDS[kind].descriptor} | ${SITE.name}`;
    if (withKind.length <= TITLE_MAX) return withKind;
  }

  const withBrand = `${trimmed} | ${SITE.name}`;
  if (withBrand.length <= TITLE_MAX) return withBrand;

  return trimmed;
}

/**
 * Fall back to the site description rather than shipping an empty one, and
 * never generate a description from the body — a truncated first paragraph
 * makes a worse snippet than a written summary.
 */
export function metaDescription(description?: string, override?: string): string {
  const chosen = (override ?? '').trim() || (description ?? '').trim();
  return chosen || SITE.description;
}

const absolute = (path: string): string => new URL(path, SITE.url).href;

export interface Crumb {
  name: string;
  path: string;
}

/**
 * BreadcrumbList.
 *
 * The trail must match the visible breadcrumb on the page. Structured data
 * that disagrees with the page is a markup violation, not a clever trick.
 */
export function breadcrumbLd(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export interface ArticleLdInput {
  headline: string;
  description: string;
  path: string;
  publishedAt: Date;
  updatedAt?: Date;
  /** Frontmatter author. Defaults to the publication itself. */
  author?: string;
  section?: string;
  tags?: readonly string[];
  image?: string;
}

/**
 * Article.
 *
 * `author` is emitted as an Organization when it is the publication's own
 * name — which is the default — because claiming a Person with no verifiable
 * identity behind it is exactly the kind of invented credential this site
 * does not publish.
 */
export function articleLd(input: ArticleLdInput): Record<string, unknown> {
  const isHouseByline = !input.author || input.author === SITE.name;
  return {
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    inLanguage: SITE.htmlLang,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(input.path) },
    datePublished: input.publishedAt.toISOString(),
    dateModified: (input.updatedAt ?? input.publishedAt).toISOString(),
    author: isHouseByline
      ? { '@type': 'Organization', name: SITE.name, url: SITE.url }
      : { '@type': 'Person', name: input.author },
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    ...(input.section ? { articleSection: input.section } : {}),
    ...(input.tags && input.tags.length ? { keywords: [...input.tags].join(', ') } : {}),
    ...(input.image ? { image: absolute(input.image) } : {}),
  };
}

export function collectionPageLd(name: string, path: string, description: string) {
  return {
    '@type': 'CollectionPage',
    name,
    description,
    inLanguage: SITE.htmlLang,
    url: absolute(path),
  };
}

export function websiteLd(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    inLanguage: SITE.htmlLang,
    description: SITE.description,
    publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  };
}

/** Wrap one or more nodes into a single `@graph` document. */
export function ldGraph(...nodes: Array<Record<string, unknown>>): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
