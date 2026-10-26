import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, contrastRatio } from '../public/color.js';
import {
  TOKEN_NAMES,
  SCALE_NAMES,
  CONTRAST_PAIRS,
  buildTokens,
  checkContrast,
  toCss,
} from '../public/tokens.js';

const REFERENCE_COLORS = ['#4F46E5', '#FACC15', '#0F766E', '#E4572E', '#FF0000', '#808080', '#000000', '#FFFFFF'];

function pseudoRandomHexes(count, seed) {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return `#${(state >>> 8).toString(16).padStart(6, '0').toUpperCase()}`;
  });
}

const SAMPLE = [...REFERENCE_COLORS, ...pseudoRandomHexes(300, 11)];
const ratio = (a, b) => contrastRatio(a.hex, b.hex);
const stepIndex = (token) => STEPS.indexOf(Number(token.ref.split('-')[1]));

describe('buildTokens', () => {
  test('усі токени є в обох темах і посилаються на реальні кроки шкал', () => {
    for (const input of SAMPLE.slice(0, 60)) {
      const { scales, themes } = buildTokens(input);
      for (const theme of Object.values(themes)) {
        assert.deepEqual(Object.keys(theme), TOKEN_NAMES);
        for (const name of TOKEN_NAMES) {
          const { ref, hex } = theme[name];
          if (ref === 'white') {
            assert.equal(hex, '#FFFFFF');
            continue;
          }
          const [scale, step] = ref.split('-');
          assert.ok(SCALE_NAMES.includes(scale) && STEPS.includes(Number(step)), `${input} ${name}: ${ref}`);
          assert.equal(hex, scales[scale][step], `${input} ${name}: ${ref}`);
        }
      }
    }
  });

  test('світлий accent це колір користувача без змін', () => {
    for (const input of SAMPLE) {
      const { hex, anchor, scales, themes } = buildTokens(input);
      assert.equal(themes.light.accent.hex, hex);
      assert.equal(scales.brand[anchor], hex);
    }
  });

  test('accent-hover це сусідній крок, на якому підпис кнопки лишається читабельним', () => {
    for (const input of SAMPLE) {
      const { scales, themes } = buildTokens(input);
      const hexAt = (index) => scales.brand[STEPS[index]];
      for (const [name, theme] of Object.entries(themes)) {
        const accent = stepIndex(theme.accent);
        const hover = stepIndex(theme['accent-hover']);
        const label = theme['on-accent'].hex;
        const neighbours = [accent - 1, accent + 1].filter((i) => i >= 0 && i < STEPS.length);
        const ratios = neighbours.map((i) => contrastRatio(label, hexAt(i)));

        assert.ok(neighbours.includes(hover), `${input} ${name}: hover не сусід`);

        const chosen = contrastRatio(label, theme['accent-hover'].hex);
        if (Math.max(...ratios) >= 4.5) assert.ok(chosen >= 4.5, `${input} ${name}: підпис на hover ${chosen.toFixed(2)}`);
        else assert.ok(chosen >= Math.max(...ratios) - 1e-9, `${input} ${name}`);

        // Бажаний напрямок: світла тема темніше, темна світліше, якщо там підпис читабельний.
        const preferred = name === 'light' ? accent + 1 : accent - 1;
        if (preferred >= 0 && preferred < STEPS.length && contrastRatio(label, hexAt(preferred)) >= 4.5) {
          assert.equal(hover, preferred, `${input} ${name}: hover не в бажаний бік`);
        }
      }
    }
  });

  test('теракота #E4572E: hover світлої теми не темнішає, бо підпис темний', () => {
    const { themes } = buildTokens('#E4572E');
    assert.equal(themes.light['on-accent'].ref, 'neutral-950');
    assert.ok(ratio(themes.light['on-accent'], themes.light['accent-hover']) >= 4.5);
  });

  test('on-accent: білий на #4F46E5, темний на жовтому #FACC15', () => {
    assert.equal(buildTokens('#4F46E5').themes.light['on-accent'].ref, 'white');
    assert.equal(buildTokens('#FACC15').themes.light['on-accent'].ref, 'neutral-950');
  });

  test('on-accent завжди контрастніший з двох варіантів', () => {
    for (const input of SAMPLE) {
      const { themes } = buildTokens(input);
      const darkest = themes.dark.bg; // neutral-950
      for (const theme of Object.values(themes)) {
        const chosen = ratio(theme['on-accent'], theme.accent);
        assert.ok(chosen >= contrastRatio('#FFFFFF', theme.accent.hex) - 1e-9, input);
        assert.ok(chosen >= ratio(darkest, theme.accent) - 1e-9, input);
      }
    }
  });

  test('текст і статусні кольори мають 4.5:1 на bg і surface в обох темах', () => {
    for (const input of SAMPLE) {
      const { themes } = buildTokens(input);
      for (const [name, theme] of Object.entries(themes)) {
        for (const fg of ['text', 'text-muted', 'danger', 'success']) {
          for (const bg of ['bg', 'surface']) {
            assert.ok(
              ratio(theme[fg], theme[bg]) >= 4.5,
              `${input} ${name}: ${fg} на ${bg} ${ratio(theme[fg], theme[bg]).toFixed(2)}`,
            );
          }
        }
      }
    }
  });

  test('темний accent має 4.5:1 на темному bg', () => {
    for (const input of SAMPLE) {
      const { themes } = buildTokens(input);
      assert.ok(ratio(themes.dark.accent, themes.dark.bg) >= 4.5, input);
    }
  });

  test('danger і success не залежать від бренду', () => {
    const a = buildTokens('#4F46E5');
    const b = buildTokens('#FACC15');
    assert.deepEqual(a.scales.danger, b.scales.danger);
    assert.deepEqual(a.scales.success, b.scales.success);
  });

  test('shorthand приймається, невалідний hex кидає TypeError', () => {
    assert.equal(buildTokens('#abc').hex, '#AABBCC');
    assert.throws(() => buildTokens('#GGGGGG'), TypeError);
    assert.throws(() => buildTokens(''), TypeError);
  });
});

describe('checkContrast', () => {
  test('сім пар, коефіцієнти збігаються з contrastRatio', () => {
    const { themes } = buildTokens('#4F46E5');
    const results = checkContrast(themes.light);
    assert.deepEqual(results.map((r) => r.id), CONTRAST_PAIRS.map((p) => p.id));
    for (const r of results) {
      assert.equal(r.ratio, contrastRatio(themes.light[r.fg].hex, themes.light[r.bg].hex));
      assert.equal(r.pass, r.ratio >= r.min);
    }
  });

  test('#4F46E5 проходить усі сім перевірок в обох темах', () => {
    const { themes } = buildTokens('#4F46E5');
    for (const theme of Object.values(themes)) {
      const failed = checkContrast(theme).filter((r) => !r.pass);
      assert.deepEqual(failed, []);
    }
  });

  test('жовтий #FACC15: підпис кнопки проходить, сам accent на світлому фоні ні', () => {
    const { themes } = buildTokens('#FACC15');
    const byId = Object.fromEntries(checkContrast(themes.light).map((r) => [r.id, r]));
    assert.equal(byId['on-accent'].pass, true);
    assert.equal(byId['accent-bg'].pass, false);
    assert.equal(byId['accent-bg'].level, 'Fail');
  });
});

describe('toCss', () => {
  const tokens = buildTokens('#4F46E5');
  const css = toCss(tokens);

  test('заголовок із hex бренду малими літерами', () => {
    assert.ok(css.startsWith('/* Token Lab - #4f46e5 */\n:root {\n'));
  });

  test('44 примітиви, hex малими літерами', () => {
    const primitives = [...css.matchAll(/^ {2}--((?:brand|neutral|danger|success)-\d+): (#[0-9a-f]{6});$/gm)];
    assert.equal(primitives.length, SCALE_NAMES.length * STEPS.length);
    for (const [, name, hex] of primitives) {
      const [scale, step] = name.split('-');
      assert.equal(hex, tokens.scales[scale][step].toLowerCase());
    }
    assert.ok(!/#[0-9a-f]*[A-F][0-9a-fA-F]*\b/.test(css));
  });

  test('семантичні токени є в обох темах і посилаються на визначені примітиви', () => {
    const defined = new Set([...css.matchAll(/^ {2}--([a-z]+-\d+):/gm)].map((m) => m[1]));
    for (const [, name] of css.matchAll(/var\(--([a-z]+-\d+)\)/g)) assert.ok(defined.has(name), name);

    const [, light, dark] = css.split(/\n\n/);
    assert.ok(light.startsWith(':root,\n[data-theme="light"] {'));
    assert.ok(dark.startsWith('[data-theme="dark"] {'));
    for (const name of TOKEN_NAMES) {
      assert.match(light, new RegExp(`^ {2}--${name}: `, 'm'));
      assert.match(dark, new RegExp(`^ {2}--${name}: `, 'm'));
    }
    assert.match(light, /--surface: #ffffff;/);
  });
});
