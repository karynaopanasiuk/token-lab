import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS,
  normalizeHex,
  generateScale,
  generateNeutralScale,
  formatOklch,
  contrastRatio,
  wcagLevel,
} from '../public/color.js';

// Вимірювання шкал: свій OKLab, не залежить від реалізації в color.js.
const toLinear = (byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function oklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

const hueDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const isHex = (value) => /^#[0-9A-F]{6}$/.test(value);

// Допуски: hex 8-біт округлює світлість приблизно на 0.002, на практиці до 0.004.
const GAP_TOLERANCE = 0.006;
const BRAND_HUE_TOLERANCE = 6;
const NEUTRAL_HUE_TOLERANCE = 15;

function pseudoRandomHexes(count, seed) {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return `#${(state >>> 8).toString(16).padStart(6, '0').toUpperCase()}`;
  });
}

function assertEvenDescending(scale, label) {
  const lightness = STEPS.map((step) => oklch(scale[step]).L);
  const gaps = lightness.slice(1).map((value, i) => lightness[i] - value);
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  for (const gap of gaps) {
    assert.ok(gap > 0, `${label}: світлість має спадати, проміжки ${gaps.map((g) => g.toFixed(3))}`);
    assert.ok(
      Math.abs(gap - mean) <= GAP_TOLERANCE,
      `${label}: нерівномірний проміжок ${gap.toFixed(4)} при середньому ${mean.toFixed(4)}`,
    );
  }
}

const REFERENCE_COLORS = ['#4F46E5', '#FACC15', '#FF0000', '#00FF00', '#0000FF', '#00FFFF', '#FFFF00', '#808080', '#000000', '#FFFFFF'];

describe('вимірювач OKLab у тестах', () => {
  test('збігається з опублікованими значеннями', () => {
    const red = oklch('#FF0000');
    assert.ok(Math.abs(red.L - 0.62796) < 1e-4 && Math.abs(red.C - 0.25768) < 1e-4);
    assert.ok(Math.abs(oklch('#00FF00').L - 0.86644) < 1e-4);
    assert.ok(Math.abs(oklch('#0000FF').L - 0.45201) < 1e-4);
    assert.equal(oklch('#FFFFFF').L.toFixed(5), '1.00000');
    assert.equal(oklch('#000000').L, 0);
  });
});

describe('normalizeHex', () => {
  test('приймає 3 і 6 символів, з решіткою і без, будь-який регістр', () => {
    assert.equal(normalizeHex('#4f46e5'), '#4F46E5');
    assert.equal(normalizeHex('4F46E5'), '#4F46E5');
    assert.equal(normalizeHex('  #abc '), '#AABBCC');
    assert.equal(normalizeHex('fa0'), '#FFAA00');
  });

  test('невалідне повертає null', () => {
    for (const bad of ['', '#', '#12', '#12345', '#1234567', '#GGGGGG', '#12345G', '#ff00ff00', '#4F46E5;', 'red']) {
      assert.equal(normalizeHex(bad), null, JSON.stringify(bad));
    }
    for (const bad of [null, undefined, 123, {}]) assert.equal(normalizeHex(bad), null);
  });
});

describe('formatOklch', () => {
  test('збігається з незалежним вимірюванням', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(100, 7)]) {
      const { L, C, h } = oklch(input);
      const expected = `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;
      if (C > 1e-4) assert.equal(formatOklch(input), expected, input);
    }
  });

  test('чорний, білий і сірий без відтінку: chroma 0, hue 0', () => {
    assert.equal(formatOklch('#000000'), 'oklch(0.0% 0.000 0.0)');
    assert.equal(formatOklch('#FFFFFF'), 'oklch(100.0% 0.000 0.0)');
    assert.match(formatOklch('#808080'), /^oklch\(\d+\.\d% 0\.000 0\.0\)$/);
  });

  test('shorthand і регістр не мають значення, невалідний hex кидає TypeError', () => {
    assert.equal(formatOklch('#abc'), formatOklch('#AABBCC'));
    assert.throws(() => formatOklch('nope'), TypeError);
  });
});

describe('contrastRatio', () => {
  test('білий на чорному = 21, у будь-якому порядку', () => {
    assert.ok(Math.abs(contrastRatio('#FFFFFF', '#000000') - 21) < 1e-9);
    assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-9);
  });

  test('#767676 на білому = 4.54', () => {
    assert.equal(contrastRatio('#767676', '#FFFFFF').toFixed(2), '4.54');
    assert.equal(contrastRatio('#FFFFFF', '#767676').toFixed(2), '4.54');
  });

  test('однакові кольори = 1, shorthand і регістр не мають значення', () => {
    assert.equal(contrastRatio('#4F46E5', '#4f46e5'), 1);
    assert.equal(contrastRatio('#fff', '#000000'), contrastRatio('#FFFFFF', '#000'));
  });

  test('невалідний hex кидає TypeError', () => {
    assert.throws(() => contrastRatio('#GGG', '#FFFFFF'), TypeError);
    assert.throws(() => contrastRatio('#FFFFFF', ''), TypeError);
  });
});

describe('wcagLevel', () => {
  test('межі рівнів', () => {
    assert.equal(wcagLevel(21), 'AAA');
    assert.equal(wcagLevel(7), 'AAA');
    assert.equal(wcagLevel(6.99), 'AA');
    assert.equal(wcagLevel(4.5), 'AA');
    assert.equal(wcagLevel(4.499), 'AA Large');
    assert.equal(wcagLevel(3), 'AA Large');
    assert.equal(wcagLevel(2.99), 'Fail');
    assert.equal(wcagLevel(1), 'Fail');
  });

  test('на реальних парах', () => {
    assert.equal(wcagLevel(contrastRatio('#000000', '#FFFFFF')), 'AAA');
    assert.equal(wcagLevel(contrastRatio('#767676', '#FFFFFF')), 'AA');
    assert.equal(wcagLevel(contrastRatio('#777777', '#FFFFFF')), 'AA Large');
    assert.equal(wcagLevel(contrastRatio('#AAAAAA', '#FFFFFF')), 'Fail');
  });
});

describe('generateScale', () => {
  test('11 кроків 50…950, усе валідний hex', () => {
    const scale = generateScale('#4F46E5');
    assert.deepEqual(Object.keys(scale), STEPS.map(String));
    for (const step of STEPS) assert.ok(isHex(scale[step]), `${step}: ${scale[step]}`);
  });

  test('вхідний колір стоїть у шкалі без змін', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(200, 1)]) {
      assert.ok(Object.values(generateScale(input)).includes(input), `${input} загубився у шкалі`);
    }
    assert.ok(Object.values(generateScale('#4f46e5')).includes('#4F46E5'));
    assert.ok(Object.values(generateScale('#a0c')).includes('#AA00CC'));
  });

  test('орієнтири: #4F46E5 на 600, світлий жовтий #FACC15 на початку шкали', () => {
    assert.equal(generateScale('#4F46E5')[600], '#4F46E5');
    assert.equal(generateScale('#FACC15')[100], '#FACC15');
  });

  test('вхідний колір стоїть не далі ніж на крок від свого місця в ідеальній шкалі', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(300, 2)]) {
      const scale = generateScale(input);
      const anchor = STEPS.findIndex((step) => scale[step] === input);
      const ideal = Math.min(10, Math.max(0, (0.96 - oklch(input).L) / 0.076));
      assert.ok(Math.abs(anchor - ideal) <= 1, `${input}: крок ${STEPS[anchor]}, очікувано біля ${ideal.toFixed(2)}`);
    }
  });

  test('світлість спадає з однаковим проміжком між усіма сусідніми кроками', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(300, 3)]) {
      assertEvenDescending(generateScale(input), input);
    }
  });

  test('сірі від #000000 до #FFFFFF дають сірі шкали', () => {
    for (let v = 0; v < 256; v++) {
      const gray = `#${v.toString(16).padStart(2, '0').repeat(3)}`.toUpperCase();
      const scale = generateScale(gray);
      for (const step of STEPS) {
        const [r, g, b] = [1, 3, 5].map((i) => scale[step].slice(i, i + 2));
        assert.ok(r === g && g === b, `${gray}@${step}: ${scale[step]}`);
      }
      assertEvenDescending(scale, gray);
    }
  });

  test('усі кроки в межах sRGB: відтінок не гнеться і насиченість не росте', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(300, 4)]) {
      const base = oklch(input);
      const scale = generateScale(input);
      for (const step of STEPS) {
        const color = oklch(scale[step]);
        assert.ok(color.C <= base.C + 0.01, `${input}@${step}: chroma ${color.C.toFixed(3)} вища за ${base.C.toFixed(3)}`);
        if (base.C > 0.04 && color.C > 0.03) {
          assert.ok(
            hueDistance(color.h, base.h) <= BRAND_HUE_TOLERANCE,
            `${input}@${step}: відтінок ${color.h.toFixed(1)} замість ${base.h.toFixed(1)}`,
          );
        }
      }
    }
  });

  test('невалідний hex кидає TypeError', () => {
    assert.throws(() => generateScale('#GGGGGG'), TypeError);
    assert.throws(() => generateScale(''), TypeError);
    assert.throws(() => generateScale(undefined), TypeError);
  });
});

describe('generateNeutralScale', () => {
  test('11 кроків, світлість спадає з однаковим проміжком', () => {
    for (const input of [...REFERENCE_COLORS, ...pseudoRandomHexes(100, 5)]) {
      const scale = generateNeutralScale(input);
      assert.deepEqual(Object.keys(scale), STEPS.map(String));
      for (const step of STEPS) assert.ok(isHex(scale[step]));
      assertEvenDescending(scale, input);
    }
  });

  test('відтінок бренду легкий: chroma мала, відтінок збігається', () => {
    for (const input of ['#4F46E5', '#FACC15', '#FF0000', '#00A86B', ...pseudoRandomHexes(100, 6)]) {
      const base = oklch(input);
      const scale = generateNeutralScale(input);
      for (const step of STEPS) {
        const color = oklch(scale[step]);
        assert.ok(color.C <= 0.03, `${input}@${step}: chroma ${color.C.toFixed(3)}`);
        if (base.C > 0.1 && step >= 200 && step <= 800) {
          assert.ok(
            hueDistance(color.h, base.h) <= NEUTRAL_HUE_TOLERANCE,
            `${input}@${step}: відтінок ${color.h.toFixed(1)} замість ${base.h.toFixed(1)}`,
          );
        }
      }
    }
  });

  test('сірий бренд дає чистий сірий нейтраль', () => {
    for (const step of STEPS) {
      const hex = generateNeutralScale('#808080')[step];
      assert.equal(hex.slice(1, 3), hex.slice(3, 5));
      assert.equal(hex.slice(3, 5), hex.slice(5, 7));
    }
  });

  test('невалідний hex кидає TypeError', () => {
    assert.throws(() => generateNeutralScale('nope'), TypeError);
  });
});
