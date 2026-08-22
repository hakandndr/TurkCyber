/**
 * Field sanitisation for values arriving from the network.
 *
 * Strips control characters that could forge structure downstream (log lines,
 * CSV exports, header values) and caps length so one request cannot write an
 * unbounded row.
 */
export const MAX_FIELD_LENGTH = 300;

/** C0 and C1 control characters, including CR, LF and TAB. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** The same set, but leaving LF intact so comment paragraphs survive. */
const CONTROL_CHARS_EXCEPT_LF = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

export function sanitizeField(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Sanitise but preserve intentional line breaks — used for comment bodies,
 * where paragraph structure is meaningful and is rendered as separate elements.
 */
export function sanitizeMultiline(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_EXCEPT_LF, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}
