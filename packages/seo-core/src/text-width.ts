/**
 * Rendered-text width estimation.
 *
 * APPROXIMATION HONESTLY DOCUMENTED: this is a static per-character table
 * for an Arial/Roboto-like sans-serif at a given font size. Real rendered
 * width depends on the actual font file, letter-spacing, font smoothing and
 * OS differences — treat every estimate as ±10-15%. Google's own title/
 * description truncation limits are commonly quoted at ~580 px (title,
 * ~20 px font) and ~920 px desktop / ~680 px mobile (description, ~14 px
 * font); those public constants are what we compare against.
 *
 * Character widths are expressed as fractions of the font size (em). The
 * table covers the common ASCII ranges; unknown characters fall back to the
 * lowercase average.
 */

const NARROW = new Set(['i', 'l', 'j', 'I', '|', '.', ',', '!', ';', "'"]);
const WIDE = new Set(['m', 'w', 'M', 'W', '@']);
const UPPERCASE = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'X',
  'Y',
  'Z',
]);
const DIGIT = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const SPACE = new Set([' ']);
const MEDIUM = new Set([
  'a',
  'b',
  'c',
  'd',
  'e',
  'g',
  'h',
  'k',
  'n',
  'o',
  'p',
  'q',
  's',
  'u',
  'v',
  'x',
  'y',
  'z',
  '#',
  '$',
  '%',
  '&',
  '(',
  ')',
  '+',
  '-',
  '/',
  '?',
  '"',
  '*',
  '<',
  '>',
  '=',
  '[',
  ']',
  '{',
  '}',
  '_',
  '~',
  'F',
  'G',
  'K',
  'L',
  'P',
  'R',
  'S',
  'T',
  'V',
  'X',
  'Z',
]);
const EMOJI_RANGE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const DEFAULT_EM = 0.52;
const NARROW_EM = 0.26;
const WIDE_EM = 0.88;
const UPPERCASE_EM = 0.68;
const DIGIT_EM = 0.56;
const SPACE_EM = 0.28;
const MEDIUM_EM = 0.6;
const EMOJI_EM = 1.2;

/** Static per-character width lookup (em fraction of the font size). */
export function charWidthEm(char: string): number {
  if (EMOJI_RANGE.test(char)) return EMOJI_EM;
  if (NARROW.has(char)) return NARROW_EM;
  if (SPACE.has(char)) return SPACE_EM;
  if (WIDE.has(char)) return WIDE_EM;
  if (DIGIT.has(char)) return DIGIT_EM;
  if (UPPERCASE.has(char)) return UPPERCASE_EM;
  if (MEDIUM.has(char)) return MEDIUM_EM;
  return DEFAULT_EM;
}

/**
 * Estimate the rendered pixel width of `text` at `fontSizePx` in an
 * Arial/Roboto-like sans-serif. Pure and deterministic.
 */
export function estimateTextWidth(text: string, fontSizePx: number): number {
  let totalEm = 0;
  for (const char of text) totalEm += charWidthEm(char);
  return Math.round(totalEm * fontSizePx);
}

/** Title font size used by search engines (approx. — see module doc). */
export const TITLE_FONT_SIZE_PX = 20;
/** Description font size (desktop, approx.). */
export const DESCRIPTION_FONT_SIZE_PX = 14;
/** Title pixel budget before truncation (approx.). */
export const TITLE_PIXEL_LIMIT_PX = 580;
/** Description pixel budget on desktop (approx.). */
export const DESCRIPTION_PIXEL_LIMIT_DESKTOP_PX = 920;
/** Description pixel budget on mobile (approx.). */
export const DESCRIPTION_PIXEL_LIMIT_MOBILE_PX = 680;
