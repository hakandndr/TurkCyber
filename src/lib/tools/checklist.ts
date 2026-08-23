/**
 * Checklist-shaped tools.
 *
 * A quiz asks what someone would do. A checklist asks what is actually
 * switched on, and turns the gaps into an ordered list of things to fix. The
 * two shapes need different scoring, so they get different modules rather than
 * one abstraction bent to cover both.
 *
 * ── What these tools never do ────────────────────────────────────────────
 *
 * 1. NEVER ASK FOR A CREDENTIAL. No password field, no "paste your recovery
 *    codes", no "which email do you use". A security tool that trains people
 *    to type their password into an unfamiliar page has done net harm even if
 *    it never transmits anything.
 *
 * 2. NO INVENTED PRECISION. The result is a band and an ordered list, not
 *    "hesabınız %87,4 güvende". A percentage implies a measurement, and
 *    nothing here measures anything — the visitor is self-reporting, and the
 *    checklist covers what is common, not everything that matters.
 *
 * 3. NOTHING LEAVES THE BROWSER. No storage, no analytics event, no network.
 *    Someone working through "is my account already compromised" must not
 *    have that answer recorded anywhere.
 */

/**
 * How much an item matters.
 *
 * Ordering the advice by real consequence is the whole value of the tool.
 * `critical` items are the ones whose absence is routinely the difference
 * between an account being taken over and not.
 */
export type Weight = 'critical' | 'important' | 'helpful';

export const WEIGHT_ORDER: Record<Weight, number> = {
  critical: 0,
  important: 1,
  helpful: 2,
};

export const WEIGHT_LABELS: Record<Weight, string> = {
  critical: 'Önce bunu',
  important: 'Sonra bunu',
  helpful: 'Vakit bulunca',
};

export interface ChecklistItem {
  id: string;
  /** The setting or habit, phrased so the visitor can verify it themselves. */
  label: string;
  /** Where to look, or what the setting actually does. */
  detail?: string;
  weight: Weight;
  /** What to do when it is not in place. Written as an instruction. */
  action: string;
  /** The guide that explains it, when there is one. */
  href?: string;
  /** Link text for `href`. */
  hrefLabel?: string;
}

export interface ChecklistGroup {
  id: string;
  title: string;
  items: readonly ChecklistItem[];
}

export interface ChecklistDefinition {
  id: string;
  title: string;
  description: string;
  groups: readonly ChecklistGroup[];
  /**
   * Shown with the result. Says out loud what the checklist does not cover,
   * so a clean result is not read as a guarantee.
   */
  disclaimer: string;
}

/**
 * The three outcomes.
 *
 * Deliberately derived from WHICH items are missing rather than from how
 * many. Twelve helpful items and one missing critical one is not a good
 * result, and any count-based score would say it was.
 */
export type Level = 'zayif' | 'orta' | 'iyi';

export const LEVELS: Record<Level, { label: string; accent: 'red' | 'amber' | 'green' }> = {
  zayif: { label: 'Zayıf halka var', accent: 'red' },
  orta: { label: 'Temel koruma var, eksikler kaldı', accent: 'amber' },
  iyi: { label: 'İyi durumda', accent: 'green' },
};

export interface ChecklistResult {
  total: number;
  checked: number;
  /** Unchecked items, most consequential first. Stable within a weight. */
  missing: ChecklistItem[];
  level: Level;
}

export function allItems(definition: ChecklistDefinition): ChecklistItem[] {
  return definition.groups.flatMap((group) => [...group.items]);
}

/**
 * Evaluate a set of ticks.
 *
 * `checked` is the set of item ids the visitor marked as already in place.
 * An unknown id is ignored rather than counted, so a stale bookmark or a
 * hand-edited URL cannot inflate the result.
 */
export function evaluateChecklist(
  definition: ChecklistDefinition,
  checked: ReadonlySet<string>,
): ChecklistResult {
  const items = allItems(definition);
  const known = new Set(items.map((item) => item.id));
  const ticked = [...checked].filter((id) => known.has(id));

  const missing = items
    .filter((item) => !checked.has(item.id))
    .sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight]);

  const level: Level = missing.some((item) => item.weight === 'critical')
    ? 'zayif'
    : missing.some((item) => item.weight === 'important')
      ? 'orta'
      : 'iyi';

  return { total: items.length, checked: ticked.length, missing, level };
}
