/**
 * Pure scoring for the interactive tools.
 *
 * No DOM, no storage, no network — which is what makes it testable and what
 * keeps a visitor's answers on their own device.
 */
import type { ResultBand, ToolDefinition, ToolResult } from './types';

/** Highest score obtainable, used to turn raw points into a percentage. */
export function maxScore(definition: ToolDefinition): number {
  return definition.questions.reduce((total, question) => {
    const best = Math.max(...question.options.map((option) => option.score));
    return total + Math.max(0, best);
  }, 0);
}

/**
 * Score a set of answers.
 *
 * `answers` maps question id → chosen option id. Unanswered questions score
 * zero rather than being skipped, so a partially completed tool cannot report
 * a flattering percentage.
 */
export function scoreAnswers(
  definition: ToolDefinition,
  answers: Record<string, string>,
): ToolResult {
  let score = 0;
  let correctCount = 0;

  for (const question of definition.questions) {
    const chosenId = answers[question.id];
    if (!chosenId) continue;
    const option = question.options.find((candidate) => candidate.id === chosenId);
    if (!option) continue;
    score += option.score;
    if (option.correct) correctCount += 1;
  }

  const max = maxScore(definition);
  const percent = max > 0 ? Math.round((score / max) * 100) : 0;

  return { score, max, percent, correctCount, band: bandFor(definition.bands, percent) };
}

/**
 * The band a percentage falls into.
 *
 * Bands are sorted here rather than trusting definition order, and the lowest
 * band is the fallback — a score below every threshold still gets advice
 * instead of an empty result panel.
 */
export function bandFor(bands: readonly ResultBand[], percent: number): ResultBand {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((band) => percent >= band.minPercent) ?? sorted[sorted.length - 1]!;
}
