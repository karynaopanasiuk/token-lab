// UI: стан, рендер, події. Математика кольору в color.js, токени в tokens.js.
import { normalizeHex, formatOklch, STEPS } from './color.js';
import { buildTokens, checkContrast, toCss, TOKEN_NAMES } from './tokens.js';

const PRESETS = [
  { name: 'Індиго', hex: '#4F46E5' },
  { name: 'Жовтий', hex: '#FACC15' },
  { name: 'Бірюза', hex: '#0F766E' },
  { name: 'Теракота', hex: '#E4572E' },
];

const HEX_ERROR = 'Потрібно 3 або 6 символів: цифри 0-9 і літери A-F.';
const TOAST_MS = 1600;

const $ = (selector) => document.querySelector(selector);

const el = {
  box: $('#hexbox'),
  input: $('#hex-input'),
  picker: $('#hex-picker'),
  chip: $('#hex-chip'),
  error: $('#hex-error'),
  presets: $('#presets'),
  metaAnchor: $('#meta-anchor'),
  metaOklch: $('#meta-oklch'),
  metaOnAccent: $('#meta-on-accent'),
  brandScale: $('#brand-scale'),
  neutralScale: $('#neutral-scale'),
  tokensBody: $('#tokens-body'),
  light: $('#cmp-light'),
  dark: $('#cmp-dark'),
  css: $('#css-code'),
  copyCss: $('#copy-css'),
  share: $('#share'),
  theme: $('#theme-toggle'),
  toast: $('#toast'),
};

const THEME_KEY = 'token-lab-theme';

const state = { hex: PRESETS[0].hex, css: '' };

// --- рендер ---

function swatches(scale, anchor) {
  return STEPS.map((step) => {
    const hex = scale[step];
    const mine = step === anchor ? '<span class="swatch__badge">твій</span>' : '';
    return `<button type="button" class="swatch" data-copy="${hex}" aria-label="${step === anchor ? 'твій ' : ''}${step} ${hex.slice(1)}, копіювати hex">
      <span class="swatch__chip" style="--swatch: ${hex}">${mine}</span>
      <span class="swatch__step">${step}</span>
      <span class="swatch__hex">${hex.slice(1)}</span>
    </button>`;
  }).join('');
}

function tokenCell(token, label) {
  return `<td data-label="${label}"><div class="tokens__cell">
    <span class="tokens__chip" style="--swatch: ${token.hex}"></span>
    <span class="tokens__ref">${token.ref}</span>
    <span class="tokens__hex">${token.hex}</span>
  </div></td>`;
}

function tokenRows({ light, dark }) {
  return TOKEN_NAMES.map(
    (name) => `<tr>
      <td class="tokens__name">${name}</td>
      ${tokenCell(light[name], 'Світла')}
      ${tokenCell(dark[name], 'Темна')}
    </tr>`,
  ).join('');
}

// Тон бейджа: зелений, якщо пара досягла свого мінімуму, жовтий для тексту на рівні AA Large, червоний для Fail.
const tone = (result) => (result.level === 'Fail' ? 'fail' : result.pass ? 'ok' : 'warn');
const badge = (result, text) => `<span class="badge badge--${tone(result)}">${text}</span>`;
const note = (result) => badge(result, `${result.level} ${result.ratio.toFixed(1)}`);

function renderCompare(root, title, theme) {
  const results = checkContrast(theme);
  const byId = Object.fromEntries(results.map((result) => [result.id, result]));
  const passed = results.filter((result) => result.pass).length;

  root.style.cssText = TOKEN_NAMES.map((name) => `--pv-${name}: ${theme[name].hex}`).join('; ');
  root.innerHTML = `
    <div class="cmp__head">
      <h3 class="cmp__title">${title}</h3>
      <span class="cmp__count">${passed}/${results.length} пройдено</span>
    </div>
    <div class="pv" role="img" aria-label="Приклад картки, поля і кнопок з токенами цієї теми">
      <div class="pv-card">
        <div class="pv-line pv-line--split">
          <span class="pv-muted">Підписка</span>
          <span class="pv-status"><span class="pv-dot"></span>Активна ${note(byId['success-surface'])}</span>
        </div>
        <div class="pv-line"><span class="pv-title">Pro для дизайнерів</span>${note(byId['text-surface'])}</div>
        <p class="pv-desc">Безлімітні палітри, експорт у Figma і спільний доступ для команди.</p>
        <div class="pv-field">
          <span class="pv-label">Email</span>
          <span class="pv-input">yourmail.gmail.com</span>
        </div>
        <div class="pv-line"><span class="pv-error">Бракує @ в адресі</span>${note(byId['danger-surface'])}</div>
        <div class="pv-actions">
          <span class="pv-btn pv-btn--primary">Оформити</span>
          <span class="pv-btn pv-btn--primary pv-btn--hover">Наведення</span>
          <span class="pv-btn pv-btn--outline">Пізніше</span>
          ${note(byId['on-accent'])}
        </div>
      </div>
      <div class="pv-foot"><span class="pv-muted">Оновлено 2 хв тому</span>${note(byId['muted-bg'])}</div>
    </div>
    <ul class="pairs">
      ${results
        .map(
          (result) => `<li class="pair" style="--chip-bg: var(--pv-${result.bg}); --chip-fg: var(--pv-${result.fg})">
            <span class="pair__chip" aria-hidden="true">Aa</span>
            <span class="pair__name">${result.label} <span class="pair__ref">· ${result.fg} / ${result.bg}</span></span>
            <span class="pair__result">
              <span class="pair__ratio">${result.ratio.toFixed(2)}:1</span>
              ${badge(result, result.level)}
            </span>
          </li>`,
        )
        .join('')}
    </ul>`;
}

function render() {
  const tokens = buildTokens(state.hex);

  el.chip.style.background = state.hex;
  el.picker.value = state.hex.toLowerCase();
  for (const button of el.presets.children) {
    button.setAttribute('aria-pressed', String(button.dataset.hex === state.hex));
  }

  el.metaAnchor.textContent = `brand-${tokens.anchor}`;
  el.metaOklch.textContent = formatOklch(state.hex);
  el.metaOnAccent.textContent = `on-accent ${tokens.themes.light['on-accent'].ref === 'white' ? 'white' : 'dark'}`;

  el.brandScale.innerHTML = swatches(tokens.scales.brand, tokens.anchor);
  el.neutralScale.innerHTML = swatches(tokens.scales.neutral);
  el.tokensBody.innerHTML = tokenRows(tokens.themes);
  renderCompare(el.light, 'Світла тема', tokens.themes.light);
  renderCompare(el.dark, 'Темна тема', tokens.themes.dark);

  state.css = toCss(tokens);
  el.css.textContent = state.css;
}

// --- поле hex ---

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = false;
  el.box.dataset.invalid = 'true';
  el.input.setAttribute('aria-invalid', 'true');
}

function clearError() {
  el.error.hidden = true;
  el.box.dataset.invalid = 'false';
  el.input.setAttribute('aria-invalid', 'false');
}

// Адресу /p/:id скидаємо на /, щойно колір змінився: інакше можна скопіювати посилання на стару палітру.
function resetUrl() {
  if (location.pathname !== '/') history.replaceState(null, '', '/');
}

// keepUrl: палітру відкрито за посиланням, адреса лишається.
function setHex(hex, { keepUrl = false } = {}) {
  clearError();
  el.input.value = hex.slice(1);
  if (hex !== state.hex || !el.brandScale.children.length) {
    state.hex = hex;
    render();
    if (!keepUrl) resetUrl();
  }
}

// Поки користувач друкує: 6 символів застосовуємо одразу, символ не з hex або більше шести
// символів одразу помилка, неповний ввід (4-5 символів) мовчки чекає, а 3 символи
// приймаємо на blur або Enter.
function onInput() {
  const text = el.input.value.replace(/^#/, '').replace(/\s/g, '').toUpperCase();
  if (el.input.value !== text) el.input.value = text;

  if (/[^0-9A-F]/.test(text) || text.length > 6) return showError(HEX_ERROR);
  if (text.length === 6) return setHex(`#${text}`);
  clearError();
}

function commit() {
  const text = el.input.value;
  if (!text) return setHex(state.hex);
  const hex = normalizeHex(text);
  if (hex) setHex(hex);
  else showError(HEX_ERROR);
}

el.input.addEventListener('input', onInput);
// Виділяємо все при фокусі: нове значення замінює старе, а не дописується в кінець.
el.input.addEventListener('focus', () => setTimeout(() => el.input.select(), 0));
el.input.addEventListener('blur', commit);
el.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') commit();
});
el.picker.addEventListener('input', () => setHex(normalizeHex(el.picker.value)));

for (const { name, hex } of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset';
  button.dataset.hex = hex;
  button.innerHTML = `<span class="preset__dot" style="background: ${hex}"></span>${name}`;
  button.addEventListener('click', () => setHex(hex));
  el.presets.append(button);
}

// --- копіювання і тост ---

let toastTimer;

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), TOAST_MS);
}

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position: fixed; opacity: 0';
  document.body.append(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

async function copyText(text) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = legacyCopy(text);
  }
  showToast(ok ? 'Скопійовано' : 'Не вдалося скопіювати');
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-copy]');
  if (target) copyText(target.dataset.copy);
});

// --- тема інтерфейсу ---

// Кнопка підписана тим, на що перемкне: у темній темі «Світла», у світлій «Темна».
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toLight = theme === 'dark';
  const label = toLight ? 'Світла' : 'Темна';
  el.theme.textContent = label;
  // Доступна назва починається з видимого тексту (WCAG 2.5.3 Label in Name).
  el.theme.setAttribute('aria-label', `${label}, перемкнути тему`);
}

el.theme.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Приватний режим: тема просто не збережеться.
  }
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

el.copyCss.addEventListener('click', () => copyText(state.css));

// --- поділитися ---

const PALETTE_PATH = /^\/p\/([0-9a-z]{4,12})\/?$/;

async function savePalette(hex) {
  const response = await fetch('/api/palettes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hex }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Копіює текст, який стане відомий після запиту. Safari дозволяє писати в буфер лише в межах
// жесту кліку, тому в ClipboardItem передаємо проміс, а не чекаємо відповіді. Не кидає помилок.
async function copyEventually(textPromise) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      const blob = textPromise.then((text) => new Blob([text], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    }
  } catch {
    // Пробуємо звичайний шлях нижче.
  }
  try {
    const text = await textPromise;
    if (!navigator.clipboard?.writeText) return legacyCopy(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function share() {
  el.share.disabled = true;
  el.share.setAttribute('aria-busy', 'true');

  const saved = savePalette(state.hex);
  const copied = copyEventually(saved.then(({ url }) => url));
  try {
    const { id } = await saved;
    history.replaceState(null, '', `/p/${id}`);
    showToast((await copied) ? 'Посилання скопійовано' : 'Не вдалося скопіювати, посилання в адресному рядку');
  } catch {
    showToast('Не вдалося зберегти палітру');
  } finally {
    el.share.disabled = false;
    el.share.removeAttribute('aria-busy');
  }
}

el.share.addEventListener('click', share);

// Повертає hex збереженої палітри або null (з тостом про причину).
async function loadSharedPalette(id) {
  try {
    const response = await fetch(`/api/palettes/${id}`);
    if (response.status === 404) {
      showToast('Палітру не знайдено');
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { hex } = await response.json();
    return normalizeHex(hex);
  } catch {
    showToast('Не вдалося завантажити палітру');
    return null;
  }
}

async function start() {
  const id = PALETTE_PATH.exec(location.pathname)?.[1];
  const shared = id ? await loadSharedPalette(id) : null;
  setHex(shared ?? state.hex, { keepUrl: Boolean(shared) });
  if (id && !shared) resetUrl();
}

start();
