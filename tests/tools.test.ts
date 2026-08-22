/**
 * Interactive tool scoring.
 *
 * The logic is pure by design — no DOM, no storage, no network — which is both
 * what makes it testable here and what keeps a visitor's answers on their own
 * device.
 */
import { describe, expect, it } from 'vitest';
import { bandFor, maxScore, scoreAnswers } from '../src/lib/tools/scoring';
import { BU_MESAJ_SAHTE_MI } from '../src/lib/tools/bu-mesaj-sahte-mi';
import type { ToolDefinition } from '../src/lib/tools/types';

const TOY: ToolDefinition = {
  id: 'toy',
  title: 'Toy',
  description: 'Fixture',
  questions: [
    {
      id: 'q1',
      prompt: 'A?',
      explanation: 'because',
      options: [
        { id: 'good', label: 'good', score: 2, correct: true },
        { id: 'bad', label: 'bad', score: 0 },
      ],
    },
    {
      id: 'q2',
      prompt: 'B?',
      explanation: 'because',
      options: [
        { id: 'good', label: 'good', score: 2, correct: true },
        { id: 'half', label: 'half', score: 1 },
      ],
    },
  ],
  bands: [
    { minPercent: 0, title: 'low', message: 'm', accent: 'red' },
    { minPercent: 50, title: 'mid', message: 'm', accent: 'amber' },
    { minPercent: 100, title: 'high', message: 'm', accent: 'green' },
  ],
};

describe('maxScore', () => {
  it('sums the best option of each question', () => {
    expect(maxScore(TOY)).toBe(4);
  });
});

describe('scoreAnswers', () => {
  it('scores a perfect run', () => {
    const result = scoreAnswers(TOY, { q1: 'good', q2: 'good' });
    expect(result.score).toBe(4);
    expect(result.percent).toBe(100);
    expect(result.correctCount).toBe(2);
    expect(result.band.title).toBe('high');
  });

  it('counts unanswered questions as zero rather than skipping them', () => {
    // A half-finished quiz must not report a flattering percentage.
    const result = scoreAnswers(TOY, { q1: 'good' });
    expect(result.score).toBe(2);
    expect(result.percent).toBe(50);
    expect(result.correctCount).toBe(1);
  });

  it('ignores an unknown option id instead of throwing', () => {
    const result = scoreAnswers(TOY, { q1: 'nonsense', q2: 'good' });
    expect(result.score).toBe(2);
    expect(result.correctCount).toBe(1);
  });

  it('handles an entirely empty answer set', () => {
    const result = scoreAnswers(TOY, {});
    expect(result.score).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.band.title).toBe('low');
  });

  it('separates points from correctness', () => {
    // `half` scores but is not the security-aware answer.
    const result = scoreAnswers(TOY, { q2: 'half' });
    expect(result.score).toBe(1);
    expect(result.correctCount).toBe(0);
  });
});

describe('bandFor', () => {
  it('picks the highest band at or below the score, at the boundaries', () => {
    expect(bandFor(TOY.bands, 0).title).toBe('low');
    expect(bandFor(TOY.bands, 49).title).toBe('low');
    expect(bandFor(TOY.bands, 50).title).toBe('mid');
    expect(bandFor(TOY.bands, 99).title).toBe('mid');
    expect(bandFor(TOY.bands, 100).title).toBe('high');
  });

  it('does not depend on the order bands are declared in', () => {
    const shuffled = [TOY.bands[2]!, TOY.bands[0]!, TOY.bands[1]!];
    expect(bandFor(shuffled, 60).title).toBe('mid');
  });
});

describe('the shipped quiz', () => {
  it('gives every question exactly one security-aware answer', () => {
    for (const question of BU_MESAJ_SAHTE_MI.questions) {
      const correct = question.options.filter((option) => option.correct);
      expect(correct, question.id).toHaveLength(1);
    }
  });

  it('gives every question an explanation and unique option ids', () => {
    for (const question of BU_MESAJ_SAHTE_MI.questions) {
      expect(question.explanation.length, question.id).toBeGreaterThan(40);
      const ids = question.options.map((option) => option.id);
      expect(new Set(ids).size, question.id).toBe(ids.length);
    }
  });

  it('uses unique question ids', () => {
    const ids = BU_MESAJ_SAHTE_MI.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers a legitimate message too, not only fraudulent ones', () => {
    // A quiz whose answer is always "fake" teaches suspicion, not judgement.
    const hasLegitimateScenario = BU_MESAJ_SAHTE_MI.questions.some((question) =>
      question.options.some(
        (option) => option.correct && /güvenilir|kontrol ederim|oturum/i.test(option.label),
      ),
    );
    expect(hasLegitimateScenario).toBe(true);
  });

  it('always reaches a band, including a zero score', () => {
    const zero = scoreAnswers(BU_MESAJ_SAHTE_MI, {});
    expect(zero.band).toBeDefined();
    expect(zero.band.accent).toBe('red');

    const perfect = Object.fromEntries(
      BU_MESAJ_SAHTE_MI.questions.map((q) => [q.id, q.options.find((o) => o.correct)!.id]),
    );
    expect(scoreAnswers(BU_MESAJ_SAHTE_MI, perfect).band.accent).toBe('green');
  });
});
