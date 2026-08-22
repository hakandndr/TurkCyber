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

export interface SearchDocument {
  slug: string;
  url: string;
  title: string;
  description: string;
  category: string;
  categoryName: string;
  tags: string[];
  kind: 'rehber' | 'haber';
  /** Pre-normalised haystack, built once at build time. */
  haystack: string;
}

export interface SearchHit extends SearchDocument {
  score: number;
}

/**
 * Rank documents against a query.
 *
 * Every query term must appear somewhere (AND), which keeps a two-word search
 * from returning everything. Field weighting favours titles, then tags, then
 * the body excerpt.
 */
export function searchDocuments(docs: SearchDocument[], rawQuery: string): SearchHit[] {
  const query = normalizeForSearch(rawQuery);
  if (query.length < 2) return [];
  const terms = query.split(' ').filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const title = normalizeForSearch(doc.title);
    const tags = normalizeForSearch(doc.tags.join(' '));

    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const inTitle = title.includes(term);
      const inTags = tags.includes(term);
      const inBody = doc.haystack.includes(term);

      if (!inTitle && !inTags && !inBody) {
        matchedAll = false;
        break;
      }
      if (inTitle) score += title.startsWith(term) ? 12 : 8;
      if (inTags) score += 4;
      if (inBody) score += 1;
    }

    if (matchedAll) hits.push({ ...doc, score });
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'tr'));
}
