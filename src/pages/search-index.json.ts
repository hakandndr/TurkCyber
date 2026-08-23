/**
 * Build-time search index.
 *
 * Generated as a static JSON file so search costs no server request and keeps
 * working if the Worker is unavailable. Bodies are truncated: the index is for
 * finding a page, not for reading it.
 *
 * Fields are pre-normalised here rather than in the browser because ranking
 * needs per-field matches and the Turkish folding only has to happen once.
 */
import type { APIRoute } from 'astro';
import { getAllArticles, articlePath } from '../lib/content';
import { getCategory } from '../config/site';
import { READY_TOOLS } from '../config/tools';
import { normalizeForSearch, type SearchDocument } from '../lib/search';
import { CONTENT_KINDS, kindOfCollection } from '../lib/seo';

const EXCERPT_LENGTH = 600;

const stripMarkup = (body: string): string =>
  body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>[\]()!-]/g, ' ')
    .slice(0, EXCERPT_LENGTH);

export const GET: APIRoute = async () => {
  const articles = await getAllArticles();

  const fromArticles: SearchDocument[] = articles
    .filter((entry) => entry.data.status === 'published')
    .map((entry) => {
      const category = getCategory(entry.data.category);
      const kind = kindOfCollection(entry.collection);
      // The myth verdict line is the answer the reader is looking for, so it
      // belongs in the summary tier rather than buried in the body excerpt.
      const verdictLine = entry.collection === 'myths' ? entry.data.verdictLine : '';

      return {
        slug: entry.id,
        url: articlePath(entry),
        title: entry.data.title,
        description: entry.data.description,
        category: entry.data.category,
        categoryName: category?.name ?? '',
        tags: entry.data.tags,
        kind,
        kindLabel: CONTENT_KINDS[kind].badge,
        n: {
          title: normalizeForSearch(entry.data.title),
          tags: normalizeForSearch(entry.data.tags.join(' ')),
          category: normalizeForSearch(category?.name ?? ''),
          summary: normalizeForSearch(
            [entry.data.description, entry.data.summary ?? '', verdictLine].join(' '),
          ),
          body: normalizeForSearch(stripMarkup(entry.body ?? '')),
        },
      };
    });

  // Tools are pages a visitor can land on, so they are searchable like
  // anything else. Only shipped ones — a `planned` tool has no URL.
  const fromTools: SearchDocument[] = READY_TOOLS.map((tool) => {
    const category = tool.category ? getCategory(tool.category) : undefined;
    return {
      slug: tool.id,
      url: tool.href ?? '/araclar/',
      title: tool.title,
      description: tool.description,
      category: tool.category ?? '',
      categoryName: category?.name ?? '',
      tags: [...(tool.tags ?? [])],
      kind: 'arac' as const,
      kindLabel: CONTENT_KINDS.arac.badge,
      n: {
        title: normalizeForSearch(tool.title),
        tags: normalizeForSearch((tool.tags ?? []).join(' ')),
        category: normalizeForSearch(category?.name ?? ''),
        summary: normalizeForSearch(tool.description),
        body: '',
      },
    };
  });

  return new Response(JSON.stringify([...fromArticles, ...fromTools]), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=600',
    },
  });
};
