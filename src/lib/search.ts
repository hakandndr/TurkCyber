/**
 * Turkish-aware text normalisation for search.
 *
 * Turkish casing is not the invariant casing: `I` lowercases to `ı` and `İ`
 * lowercases to `i`. Using the default `toLowerCase()` makes "İSTANBUL" and
 * "istanbul" fail to match, and "Ilk" and "ılk" match when they should not.
 *
 * Diacritics are then folded so a visitor who types "sifre" still finds
 * "şifre" — most people do not switch keyboard layouts to search.
 */

import type { ContentKind } from './seo';

const TR_UPPER_I_DOT = /İ/g; // İ
const TR_UPPER_I = /I/g; // I

export function turkishLower(value: string): string {
  return value.replace(TR_UPPER_I_DOT, 'i').replace(TR_UPPER_I, 'ı').toLowerCase();
}

const FOLD_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Lowercase with Turkish rules, then fold diacritics for loose matching. */
export function normalizeForSearch(value: string): string {
  const lowered = turkishLower(value);
  let out = '';
  for (const char of lowered) out += FOLD_MAP[char] ?? char;
  return out
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A searchable document.
 *
 * `kind` is the visitor-facing content type, and getting it wrong is not
 * cosmetic: this index used to label every non-guide as `haber`, so a myth
 * page — whose whole point is that it answers a claim — announced itself as
 * news in the result list.
 *
 * The `n` block holds the same fields pre-normalised at build time. Ranking
 * needs per-field matches, and re-folding Turkish text for every field of
 * every document on every keystroke is work that only has to happen once.
 */
export interface SearchDocument {
  slug: string;
  url: string;
  title: string;
  description: string;
  category: string;
  categoryName: string;
  tags: string[];
  kind: ContentKind;
  /** Short uppercase label shown on the result — REHBER, EFSANE, TEKNİK… */
  kindLabel: string;
  /** Pre-normalised fields, built once at build time. */
  n: {
    title: string;
    tags: string;
    category: string;
    summary: string;
    body: string;
  };
}

export interface SearchHit extends SearchDocument {
  score: number;
}

/**
 * Relevance weights.
 *
 * ── Why whole-query tiers come first ─────────────────────────────────────
 *
 * Ranking used to be per-term only, so searching "passkey nedir" scored a
 * guide whose body mentions both words the same as the guide actually titled
 * "Passkey nedir?". The three tiers below fix that by scoring the query as a
 * phrase first: an exact title match cannot be outranked by any accumulation
 * of incidental body hits, because the tier gaps exceed the maximum a
 * document can earn from per-field scoring.
 *
 * The stated priority is: exact title, then title-starts-with, then
 * title-contains, then tags and category, then the summary, then the body.
 */
const TITLE_EXACT = 100_000;
const TITLE_PREFIX = 20_000;
const TITLE_CONTAINS = 5_000;

const FIELD_WEIGHT = {
  title: 200,
  /** Additional, for a term at the very start of the title. */
  titleStart: 120,
  tags: 60,
  category: 40,
  summary: 12,
  body: 1,
} as const;

/**
 * Rank documents against a query.
 *
 * Every query term must appear somewhere (AND), which keeps a two-word search
 * from returning everything.
 */
export function searchDocuments(docs: SearchDocument[], rawQuery: string): SearchHit[] {
  const query = normalizeForSearch(rawQuery);
  if (query.length < 2) return [];
  const terms = query.split(' ').filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const { title, tags, category, summary, body } = doc.n;

    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const inTitle = title.includes(term);
      const inTags = tags.includes(term);
      const inCategory = category.includes(term);
      const inSummary = summary.includes(term);
      const inBody = body.includes(term);

      if (!inTitle && !inTags && !inCategory && !inSummary && !inBody) {
        matchedAll = false;
        break;
      }

      if (inTitle) {
        score += FIELD_WEIGHT.title;
        if (title.startsWith(term)) score += FIELD_WEIGHT.titleStart;
      }
      if (inTags) score += FIELD_WEIGHT.tags;
      if (inCategory) score += FIELD_WEIGHT.category;
      if (inSummary) score += FIELD_WEIGHT.summary;
      if (inBody) score += FIELD_WEIGHT.body;
    }

    if (!matchedAll) continue;

    // Whole-query tiers, applied after the per-field pass so they dominate it.
    if (title === query) score += TITLE_EXACT;
    else if (title.startsWith(query)) score += TITLE_PREFIX;
    else if (title.includes(query)) score += TITLE_CONTAINS;

    hits.push({ ...doc, score });
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'tr'));
}
