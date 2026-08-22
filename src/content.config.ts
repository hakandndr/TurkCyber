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

export const collections = { guides, news };
