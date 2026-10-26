// Математика кольору: тональні шкали від hex і контраст WCAG.
// Чисті функції. На вході і на виході тільки hex, усередині OKLCH.

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const LAST = STEPS.length - 1;

// Ідеальні краї шкали бренду (світлість OKLab) і вікна, у яких вони можуть зсуватися,
// щоб вхідний колір став точно на свій крок, а всі проміжки лишилися однаковими.
const RAMP_TOP = 0.96;
const RAMP_BOTTOM = 0.2;
const TOP_RANGE = [0.92, 0.985];
const BOTTOM_RANGE = [0.14, 0.28];
const MIN_GAP = 0.05;

// Нейтральна шкала: фіксована світлість, відтінок бренду в малій дозі.
const NEUTRAL_TOP = 0.985;
const NEUTRAL_BOTTOM = 0.15;
const NEUTRAL_CHROMA_SHARE = 0.1;
const NEUTRAL_CHROMA_MAX = 0.02;

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#abc', 'AABBCC', ' #aabbcc ' -> '#AABBCC'. Невалідне -> null. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return `#${digits.toUpperCase()}`;
}

function requireHex(input) {
  const hex = normalizeHex(input);
  if (!hex) throw new TypeError(`Невалідний hex: ${input}`);
  return hex;
}

// --- sRGB <-> OKLCH (матриці Бйорна Оттосона) ---

const toLinear = (byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (x) => {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  return c * 255;
};

function hexToLinearRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}

function linearRgbToHex(rgb) {
  const bytes = rgb.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    return Math.round(fromLinear(clamped)).toString(16).padStart(2, '0');
  });
  return `#${bytes.join('').toUpperCase()}`;
}

function hexToOklch(hex) {
  const [r, g, b] = hexToLinearRgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  return {
    L,
    // У сірого відтінок не визначений, шум у a/b не повинен давати chroma.
    C: C < 1e-4 ? 0 : C,
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

function oklchToLinearRgb(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

// Найбільший chroma, що вміщається в sRGB при заданих світлості і відтінку.
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Колір поза sRGB не обрізаємо по каналах (це гне відтінок), а зменшуємо chroma.
function oklchToHex(L, C, h) {
  return linearRgbToHex(oklchToLinearRgb(L, Math.min(C, maxChroma(L, h)), h));
}

// --- шкали ---

// Світлість 11 кроків з однаковим проміжком, де крок k дорівнює L0 точно.
// Серед усіх допустимих k беремо той, при якому краї шкали найближчі до ідеальних.
function fitLightnessRamp(L0) {
  let best = null;
  for (let k = 0; k <= LAST; k++) {
    let lo = MIN_GAP;
    let hi = Infinity;
    if (k > 0) {
      lo = Math.max(lo, (TOP_RANGE[0] - L0) / k);
      hi = Math.min(hi, (TOP_RANGE[1] - L0) / k);
    }
    if (k < LAST) {
      lo = Math.max(lo, (L0 - BOTTOM_RANGE[1]) / (LAST - k));
      hi = Math.min(hi, (L0 - BOTTOM_RANGE[0]) / (LAST - k));
    }
    if (lo > hi) continue;

    // Проміжок, що найменше зсуває обидва краї від ідеальних (метод найменших квадратів).
    const ideal =
      (k * (RAMP_TOP - L0) + (LAST - k) * (L0 - RAMP_BOTTOM)) / (k * k + (LAST - k) ** 2);
    const gap = Math.min(hi, Math.max(lo, ideal));
    const top = L0 + k * gap;
    const bottom = top - LAST * gap;
    const cost = (top - RAMP_TOP) ** 2 + (bottom - RAMP_BOTTOM) ** 2;
    if (!best || cost < best.cost) best = { k, gap, top, cost };
  }
  return STEPS.map((_, i) => (i === best.k ? L0 : best.top - i * best.gap));
}

// 0 на чорному і білому, 1 на L = 0.5: світлі й темні кроки менш насичені.
const taper = (L) => (4 * L * (1 - L)) ** 1.5;

/**
 * Шкала бренду 50…950 від hex. Вхідний колір стоїть у шкалі без змін,
 * проміжки за світлістю однакові, усі кроки в межах sRGB.
 * @returns {Record<number, string>} крок -> hex
 */
export function generateScale(input) {
  const hex = requireHex(input);
  const { L: L0, C: C0, h } = hexToOklch(hex);
  const levels = fitLightnessRamp(L0);
  const anchor = levels.indexOf(L0);
  const peak = C0 / Math.max(taper(L0), 0.05);

  return Object.fromEntries(
    STEPS.map((step, i) => [
      step,
      i === anchor ? hex : oklchToHex(levels[i], Math.min(C0, peak * taper(levels[i])), h),
    ]),
  );
}

/**
 * Нейтральна шкала 50…950 з легким відтінком бренду.
 * @returns {Record<number, string>} крок -> hex
 */
export function generateNeutralScale(input) {
  const { C, h } = hexToOklch(requireHex(input));
  const chroma = Math.min(NEUTRAL_CHROMA_MAX, C * NEUTRAL_CHROMA_SHARE);
  const gap = (NEUTRAL_TOP - NEUTRAL_BOTTOM) / LAST;

  return Object.fromEntries(STEPS.map((step, i) => [step, oklchToHex(NEUTRAL_TOP - i * gap, chroma, h)]));
}

// --- контраст WCAG 2.x ---

function relativeLuminance(hex) {
  const [r, g, b] = hexToLinearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Коефіцієнт контрасту від 1 до 21, порядок аргументів неважливий. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(requireHex(a));
  const lb = relativeLuminance(requireHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 'AAA' | 'AA' | 'AA Large' | 'Fail'. Без округлення: 4.499 це ще не AA. */
export function wcagLevel(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}
