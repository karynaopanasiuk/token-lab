// Семантичні токени зі шкал і експорт CSS. Кольори рахує color.js, тут лише вибір кроків.
import {
  STEPS,
  generateScale,
  generateNeutralScale,
  normalizeHex,
  contrastRatio,
  wcagLevel,
} from './color.js';

export const TOKEN_NAMES = [
  'bg',
  'surface',
  'text',
  'text-muted',
  'border',
  'accent',
  'accent-hover',
  'on-accent',
  'danger',
  'success',
];

export const SCALE_NAMES = ['brand', 'neutral', 'danger', 'success'];

const LAST = STEPS.length - 1;
const WHITE = '#FFFFFF';

// danger і success не залежать від бренду.
const DANGER_SEED = '#DC2626';
const SUCCESS_SEED = '#16A34A';

// WCAG 2.2: звичайний текст 4.5:1 (1.4.3), елементи інтерфейсу 3:1 (1.4.11).
const TEXT_MIN = 4.5;
const UI_MIN = 3;

export const CONTRAST_PAIRS = [
  { id: 'text-bg', fg: 'text', bg: 'bg', label: 'Текст на фоні', min: TEXT_MIN },
  { id: 'muted-bg', fg: 'text-muted', bg: 'bg', label: 'Другорядний текст', min: TEXT_MIN },
  { id: 'text-surface', fg: 'text', bg: 'surface', label: 'Текст у картці', min: TEXT_MIN },
  { id: 'on-accent', fg: 'on-accent', bg: 'accent', label: 'Підпис кнопки', min: TEXT_MIN },
  { id: 'accent-bg', fg: 'accent', bg: 'bg', label: 'Кнопка на фоні', min: UI_MIN },
  { id: 'danger-surface', fg: 'danger', bg: 'surface', label: 'Помилка', min: TEXT_MIN },
  { id: 'success-surface', fg: 'success', bg: 'surface', label: 'Успіх', min: TEXT_MIN },
];

/**
 * Усе, що потрібно інтерфейсу: шкали, токени світлої і темної теми, крок бренду.
 * Токен це { ref: 'neutral-50' | 'white', hex }.
 */
export function buildTokens(input) {
  const hex = normalizeHex(input);
  if (!hex) throw new TypeError(`Невалідний hex: ${input}`);

  const scales = {
    brand: generateScale(hex),
    neutral: generateNeutralScale(hex),
    danger: generateScale(DANGER_SEED),
    success: generateScale(SUCCESS_SEED),
  };

  const pick = (name, index) => ({ ref: `${name}-${STEPS[index]}`, hex: scales[name][STEPS[index]] });
  const indexOf = (name, seed) => STEPS.findIndex((step) => scales[name][step] === seed);
  const white = { ref: 'white', hex: WHITE };

  // Перший крок від from у напрямку dir, що дає 4.5:1 на всіх фонах.
  const passingIndex = (name, from, dir, backgrounds) => {
    for (let i = from; i >= 0 && i <= LAST; i += dir) {
      const color = pick(name, i).hex;
      if (backgrounds.every((bg) => contrastRatio(color, bg.hex) >= TEXT_MIN)) return i;
    }
    return dir > 0 ? LAST : 0;
  };

  const neighbour = (index, dir) => (index + dir < 0 || index + dir > LAST ? index - dir : index + dir);

  // Підпис на акценті: білий або найтемніший нейтральний, що контрастніший.
  const onAccent = (accent) => {
    const dark = pick('neutral', LAST);
    return contrastRatio(WHITE, accent.hex) >= contrastRatio(dark.hex, accent.hex) ? white : dark;
  };

  // Hover на сусідньому кроці в бажаному напрямку. Якщо підпис на ньому втрачає 4.5:1,
  // беремо протилежний бік, а якщо не читається ніде, той, де контраст кращий.
  const hoverIndex = (index, preferred, label) => {
    const options = [neighbour(index, preferred), neighbour(index, -preferred)];
    const ratioAt = (i) => contrastRatio(label.hex, pick('brand', i).hex);
    return options.find((i) => ratioAt(i) >= TEXT_MIN) ?? options.reduce((a, b) => (ratioAt(b) > ratioAt(a) ? b : a));
  };

  const brandIndex = indexOf('brand', hex);
  const dangerIndex = indexOf('danger', DANGER_SEED);
  const successIndex = indexOf('success', SUCCESS_SEED);

  const lightBg = pick('neutral', 0);
  const lightAccent = pick('brand', brandIndex);
  const lightOnAccent = onAccent(lightAccent);
  const light = {
    bg: lightBg,
    surface: white,
    text: pick('neutral', LAST),
    'text-muted': pick('neutral', passingIndex('neutral', 4, 1, [lightBg, white])),
    border: pick('neutral', 2),
    accent: lightAccent,
    'accent-hover': pick('brand', hoverIndex(brandIndex, 1, lightOnAccent)),
    'on-accent': lightOnAccent,
    danger: pick('danger', passingIndex('danger', dangerIndex, 1, [lightBg, white])),
    success: pick('success', passingIndex('success', successIndex, 1, [lightBg, white])),
  };

  const darkBg = pick('neutral', LAST);
  const darkSurface = pick('neutral', LAST - 1);
  const darkAccentIndex = passingIndex('brand', brandIndex, -1, [darkBg]);
  const darkAccent = pick('brand', darkAccentIndex);
  const darkOnAccent = onAccent(darkAccent);
  const dark = {
    bg: darkBg,
    surface: darkSurface,
    text: pick('neutral', 0),
    'text-muted': pick('neutral', passingIndex('neutral', 6, -1, [darkBg, darkSurface])),
    border: pick('neutral', 8),
    accent: darkAccent,
    'accent-hover': pick('brand', hoverIndex(darkAccentIndex, -1, darkOnAccent)),
    'on-accent': darkOnAccent,
    danger: pick('danger', passingIndex('danger', dangerIndex, -1, [darkBg, darkSurface])),
    success: pick('success', passingIndex('success', successIndex, -1, [darkBg, darkSurface])),
  };

  return { hex, anchor: STEPS[brandIndex], scales, themes: { light, dark } };
}

/** Сім перевірок контрасту однієї теми: коефіцієнт, рівень WCAG, чи досягнуто мінімум пари. */
export function checkContrast(theme) {
  return CONTRAST_PAIRS.map(({ id, fg, bg, label, min }) => {
    const ratio = contrastRatio(theme[fg].hex, theme[bg].hex);
    return { id, label, fg, bg, min, ratio, level: wcagLevel(ratio), pass: ratio >= min };
  });
}

/** CSS variables: примітиви в :root, семантичні токени посилаються на них через var(). */
export function toCss({ hex, scales, themes }) {
  const value = (token) => (token.ref === 'white' ? WHITE.toLowerCase() : `var(--${token.ref})`);
  const semantic = (selector, theme) => [
    `${selector} {`,
    ...TOKEN_NAMES.map((name) => `  --${name}: ${value(theme[name])};`),
    '}',
  ];

  return [
    `/* Token Lab - ${hex.toLowerCase()} */`,
    ':root {',
    ...SCALE_NAMES.flatMap((name) =>
      STEPS.map((step) => `  --${name}-${step}: ${scales[name][step].toLowerCase()};`),
    ),
    '}',
    '',
    ...semantic(':root,\n[data-theme="light"]', themes.light),
    '',
    ...semantic('[data-theme="dark"]', themes.dark),
    '',
  ].join('\n');
}
