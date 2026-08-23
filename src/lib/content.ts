/**
 * Content access helpers.
 *
 * Publication is a build input: only `status: published` entries reach a
 * production build. Draft and review entries are previewable while authoring.
 *
 * ── The draft gate is deliberately fail-safe ──────────────────────────────
 *
 * This used to read `import.meta.env.DEV`, which is derived from Vite's mode
 * and can be flipped by an ambient NODE_ENV. Running `NODE_ENV=test astro
 * build` produced a production build containing draft content — a real leak,
 * found when the test suite started building the site itself.
 *
 * The gate is now a single explicit opt-in that defaults to CLOSED. Anything
 * ambiguous — an unusual NODE_ENV, a CI runner's defaults, a future tool that
 * sets mode differently — results in drafts being hidden, never published.
 *
 * `SHOW_UNPUBLISHED=true` lives in `.env.development`, which Astro loads for
 * `astro dev` and not for `astro build`. It is not a secret and is committed.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Guide = CollectionEntry<'guides'>;
export type NewsItem = CollectionEntry<'news'>;
export type Myth = CollectionEntry<'myths'>;
export type Technical = CollectionEntry<'technical'>;
export type Article = Guide | NewsItem | Myth | Technical;

/** Opt-in, string-compared. Any other value keeps unpublished content hidden. */
export const SHOW_UNPUBLISHED: boolean = import.meta.env.SHOW_UNPUBLISHED === 'true';

const isVisible = (entry: Article): boolean =>
  entry.data.status === 'published' || SHOW_UNPUBLISHED;

const byNewest = (a: Article, b: Article): number =>
  b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

export async function getGuides(): Promise<Guide[]> {
  return (await getCollection('guides')).filter(isVisible).sort(byNewest);
}

export async function getNews(): Promise<NewsItem[]> {
  return (await getCollection('news')).filter(isVisible).sort(byNewest);
}

export async function getMyths(): Promise<Myth[]> {
  return (await getCollection('myths')).filter(isVisible).sort(byNewest);
}

export async function getTechnical(): Promise<Technical[]> {
  return (await getCollection('technical')).filter(isVisible).sort(byNewest);
}

export async function getAllArticles(): Promise<Article[]> {
  const [guides, news, myths, technical] = await Promise.all([
    getGuides(),
    getNews(),
    getMyths(),
    getTechnical(),
  ]);
  return [...guides, ...news, ...myths, ...technical].sort(byNewest);
}

/** Verdict labels and the accent each maps to. Never colour alone. */
export const VERDICTS = {
  efsane: { label: 'Efsane', accent: 'red' },
  gercek: { label: 'Gerçek', accent: 'green' },
  kismen: { label: 'Kısmen doğru', accent: 'amber' },
} as const;

export type Verdict = keyof typeof VERDICTS;

export async function getFeaturedGuides(limit = 3): Promise<Guide[]> {
  const guides = await getGuides();
  const featured = guides.filter((g) => g.data.featured);
  // Fall back to newest rather than rendering an empty shelf.
  return (
    featured.length >= limit ? featured : [...featured, ...guides.filter((g) => !g.data.featured)]
  ).slice(0, limit);
}

/** The canonical public URL path for an entry. */
const COLLECTION_BASE: Record<string, string> = {
  guides: 'rehberler',
  news: 'haberler',
  myths: 'efsane-mi-gercek-mi',
  technical: 'teknik',
};

export function articlePath(entry: Article): string {
  return `/${COLLECTION_BASE[entry.collection] ?? 'rehberler'}/${entry.id}/`;
}

/**
 * Related guides: same category first, then most recent, excluding self.
 * Deterministic so the build output does not churn between runs.
 */
export function relatedGuides(current: Article, all: Guide[], limit = 3): Guide[] {
  const others = all.filter((g) => g.id !== current.id);
  const sameCategory = others.filter((g) => g.data.category === current.data.category);
  const rest = others.filter((g) => g.data.category !== current.data.category);
  return [...sameCategory, ...rest].slice(0, limit);
}

/** `22 Ağustos 2026` */
const TR_DATE = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatTurkishDate(date: Date): string {
  return TR_DATE.format(date);
}
