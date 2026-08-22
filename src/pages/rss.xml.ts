/**
 * RSS feed of published content, newest first.
 * Only `status: published` entries appear — getAllArticles is filtered again
 * here because a dev build deliberately includes drafts.
 */
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { articlePath, getAllArticles } from '../lib/content';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const articles = (await getAllArticles()).filter((a) => a.data.status === 'published');

  const items = articles
    .map((entry) => {
      const url = new URL(articlePath(entry), SITE.url).href;
      return `    <item>
      <title>${escapeXml(entry.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(entry.data.description)}</description>
      <pubDate>${entry.data.publishedAt.toUTCString()}</pubDate>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE.name)}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>tr-TR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
