import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS } from './config/site';

/**
 * Content schema.
 *
 * Git is the authoritative content store — there is no database CMS and no
 * browser editor that could bypass it. Invalid frontmatter fails the build
 * rather than silently rendering something wrong.
 */

const baseSchema = z.object({
  title: z.string().min(8).max(120),
  /** Meta description and card summary. */
  description: z.string().min(40).max(200),
  category: z.enum(CATEGORY_IDS),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  /**
   * Only `published` reaches the production site. `draft` and `review` are
   * visible in development so work in progress can be previewed.
   */
  status: z.enum(['draft', 'review', 'published']).default('draft'),
  featured: z.boolean().default(false),
  author: z.string().default('TurkCyber'),
  /** Short Turkish "Kısaca" summary shown above the article body. */
  summary: z.string().min(40).max(400).optional(),
  tags: z.array(z.string().min(2).max(30)).max(8).default([]),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(200).optional(),
  heroImage: z.string().optional(),
  /**
   * Set when the guide depends on a third-party interface that changes.
   * Rendered as a visible "son kontrol" note so a stale guide is honest about
   * being stale rather than quietly wrong.
   */
  uiVerifiedAt: z.coerce.date().optional(),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
  schema: baseSchema.extend({
    difficulty: z.enum(['baslangic', 'orta', 'ileri']).default('baslangic'),
    /** Minutes. Author-supplied so it can reflect the steps, not just words. */
    readingTime: z.number().int().min(1).max(60),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/news' }),
  schema: baseSchema.extend({
    /** Where the development was reported. News must be attributable. */
    sourceName: z.string().min(2).max(80),
    sourceUrl: z.string().url(),
  }),
});

/**
 * "Efsane mi, gerçek mi?" — short myth-busting entries.
 *
 * A separate collection rather than a guide category, because the shape of the
 * content is genuinely different: the title IS the claim as people actually say
 * it, and every entry carries a verdict. That lets the listing surface answer
 * the question before the visitor clicks, which a guide card cannot do.
 */
const myths = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/myths' }),
  schema: baseSchema.omit({ title: true }).extend({
    /** The claim, written the way someone would say it out loud. */
    title: z.string().min(8).max(140),
    /**
     * The answer, given before the reader clicks.
     *
     * `kismen` exists because most security myths are not cleanly false —
     * they are true in a narrow case and wrong as a general rule. Forcing
     * those into `efsane` would make the site inaccurate.
     */
    verdict: z.enum(['efsane', 'gercek', 'kismen']),
    /** One-line answer shown under the verdict badge. */
    verdictLine: z.string().min(20).max(160),
  }),
});

export const collections = { guides, news, myths };
