/**
 * Build-time search index.
 *
 * Generated as a static JSON file so search costs no server request and keeps
 * working if the Worker is unavailable. Bodies are truncated: the index is for
 * finding a guide, not for reading it.
 */
import type { APIRoute } from 'astro';
import { getAllArticles, articlePath } from '../lib/content';
import { getCategory } from '../config/site';
import { normalizeForSearch, type SearchDocument } from '../lib/search';

const EXCERPT_LENGTH = 600;

export const GET: APIRoute = async () => {
  const articles = await getAllArticles();

  const documents: SearchDocument[] = articles
    .filter((entry) => entry.data.status === 'published')
    .map((entry) => {
      const category = getCategory(entry.data.category);
      const excerpt = (entry.body ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#*_>[\]()!-]/g, ' ')
        .slice(0, EXCERPT_LENGTH);

      return {
        slug: entry.id,
        url: articlePath(entry),
        title: entry.data.title,
        description: entry.data.description,
        category: entry.data.category,
        categoryName: category?.name ?? '',
        tags: entry.data.tags,
        kind: entry.collection === 'guides' ? ('rehber' as const) : ('haber' as const),
        haystack: normalizeForSearch(
          [entry.data.title, entry.data.description, entry.data.tags.join(' '), excerpt].join(' '),
        ),
      };
    });

  return new Response(JSON.stringify(documents), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
};
