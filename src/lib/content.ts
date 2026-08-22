/**
 * Content access helpers.
 *
 * Publication is a build input: only `status: published` entries reach a
 * production build. Draft and review entries stay visible during `astro dev`
 * so work in progress can be previewed without a separate environment.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Guide = CollectionEntry<'guides'>;
export type NewsItem = CollectionEntry<'news'>;
export type Article = Guide | NewsItem;

const isVisible = (entry: Article): boolean =>
  entry.data.status === 'published' || import.meta.env.DEV;

const byNewest = (a: Article, b: Article): number =>
  b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

export async function getGuides(): Promise<Guide[]> {
  return (await getCollection('guides')).filter(isVisible).sort(byNewest);
}

export async function getNews(): Promise<NewsItem[]> {
  return (await getCollection('news')).filter(isVisible).sort(byNewest);
}

export async function getAllArticles(): Promise<Article[]> {
  const [guides, news] = await Promise.all([getGuides(), getNews()]);
  return [...guides, ...news].sort(byNewest);
}

export async function getFeaturedGuides(limit = 3): Promise<Guide[]> {
  const guides = await getGuides();
  const featured = guides.filter((g) => g.data.featured);
  // Fall back to newest rather than rendering an empty shelf.
  return (
    featured.length >= limit ? featured : [...featured, ...guides.filter((g) => !g.data.featured)]
  ).slice(0, limit);
}

/** The canonical public URL path for an entry. */
export function articlePath(entry: Article): string {
  const base = entry.collection === 'guides' ? 'rehberler' : 'haberler';
  return `/${base}/${entry.id}/`;
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
