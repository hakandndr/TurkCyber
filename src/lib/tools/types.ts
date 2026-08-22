/**
 * Shared types for the interactive security tools.
 *
 * ── Design constraints, deliberately narrow ───────────────────────────────
 *
 * 1. EVERYTHING RUNS IN THE BROWSER. No tool posts answers anywhere. No
 *    analytics event carries a result. A visitor working through "have I been
 *    phished" must never have that answer leave their device.
 *
 * 2. NO FRAMEWORK. Tools are plain TypeScript plus a small amount of DOM code.
 *    An interactive quiz does not justify shipping a runtime to every reader of
 *    every article.
 *
 * 3. LOGIC IS PURE AND SEPARATE. Scoring lives in these modules with no DOM
 *    access, so it is unit-tested like anything else. The Astro component is
 *    only a renderer.
 *
 * 4. NO PERSISTENCE BY DEFAULT. Nothing is written to storage unless a specific
 *    tool documents why, because a shared or borrowed device is exactly the
 *    situation many of these tools exist for.
 */

/** One answerable item. */
export interface ToolQuestion {
  id: string;
  /** The question or scenario, in plain Turkish. */
  prompt: string;
  /** Optional longer setup — e.g. the text of a suspicious message. */
  scenario?: string;
  options: ToolOption[];
  /** Shown after answering, whichever option was chosen. */
  explanation: string;
}

export interface ToolOption {
  id: string;
  label: string;
  /** Points contributed when chosen. Higher is better/safer. */
  score: number;
  /** Marks the option a security-aware reader should pick. */
  correct?: boolean;
}

/** A band of the final score, with the advice that belongs to it. */
export interface ResultBand {
  /** Inclusive lower bound as a percentage of the maximum. */
  minPercent: number;
  title: string;
  message: string;
  accent: 'green' | 'amber' | 'red';
}

export interface ToolDefinition {
  id: string;
  title: string;
  /** One sentence describing what the visitor will get out of it. */
  description: string;
  questions: ToolQuestion[];
  bands: ResultBand[];
}

export interface ToolResult {
  score: number;
  max: number;
  percent: number;
  correctCount: number;
  band: ResultBand;
}
