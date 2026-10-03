/* ETNX HYPERLINK — client-side only */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const urlEl = $('#url'), field = $('#field'), gen = $('#gen'), statusEl = $('#status');
const loadingScreen = $('#loadingScreen'), loadingMessage = $('#loadingMessage');
const loadingProgress = $('#loadingProgress'), loadingProvider = $('#loadingProvider');
const state = { style: null, busy: false, last: '', shortener: 'abreai' };

// 👇 Edite aqui o texto exibido (parte [texto] do markdown) para cada estilo.
const LINK_TEXT = {
  'Profile':       'https//www.roblox.com/pt/users/11706195143/profile',
  'Private Servs': 'https//www.roblox.com/share?code=c01dac8cf53e9548a42cc63319540394&type=Server',
  'Group':         'https//www.roblox.com/pt/communities/437292628156/',
};
const LS = { pref: 'etnx_prefs' };

/* ---------- Storage (safe) ---------- */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------- Helpers ---------- */
const enc = encodeURIComponent;

/* ---------- Encurtador: Abre.ai ---------- */
class ServiceError extends Error {}
const TIMEOUT = 9000;
const isShort = s => typeof s === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(s.trim());
const fixProto = s => { s = String(s || '').trim(); return s && !/^https?:\/\//i.test(s) ? 'https://' + s : s; };

async function timedFetch(url, opts = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer' });
    return await r.text();
  } finally { clearTimeout(t); }
}

// Tenta as rotas em ordem (direta -> proxy CORS) até uma devolver URL curta válida
async function runRoutes(routes) {
  let last;
  for (const route of routes) {
    try { const s = await route(); if (isShort(s)) return s.trim(); }
    catch (e) { if (e instanceof ServiceError) throw e; last = e; }
  }
  throw last || new Error('falha');
}

const SHORTENERS = {
  abreai: { name: 'Abre.ai', run: async u => {
    const api = 'https://abre.ai/_/generate';
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url_translation: { url: u } }) };
    const parse = t => {
      let d; try { d = JSON.parse(t); } catch { throw new Error('resposta inválida'); }
      const s = d?.data?.attributes?.shortenedUrl || d?.data?.attributes?.shortened_url;
      if (!s) throw new Error('resposta inválida');
      return fixProto(s);
    };
    return runRoutes([
      async () => parse(await timedFetch(api, opts)),
      async () => parse(await timedFetch(`https://corsproxy.io/?url=${enc(api)}`, opts)),
    ]); } },
};

/* ---------- URL validation ---------- */
const normalize = v => { v = v.trim(); return v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? 'https://' + v : v; };
const isValid = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname); } catch { return false; } };

function refresh() {
  const v = normalize(urlEl.value), ok = isValid(v);
  field.classList.toggle('ok', !!urlEl.value && ok);
  field.classList.toggle('bad', !!urlEl.value && !ok);
  gen.disabled = state.busy || !(ok && state.style && state.shortener);
}
urlEl.addEventListener('input', refresh);
urlEl.addEventListener('blur', () => { if (urlEl.value) { urlEl.value = normalize(urlEl.value); refresh(); } });
$('#paste').addEventListener('click', async () => {
  try { urlEl.value = normalize(await navigator.clipboard.readText()); refresh(); }
  catch { urlEl.focus(); setStatus('Permita o acesso à área de transferência ou cole com Ctrl+V.'); }
});

/* ---------- Style cards ---------- */
document.querySelectorAll('.style').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.style').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
  b.classList.add('on'); b.setAttribute('aria-checked', 'true');
  state.style = b.dataset.style; save(LS.pref, { ...load(LS.pref, {}), style: state.style }); refresh();
}));

/* ---------- Dropdown customizado (encurtador) ---------- */
const ddWrap = $('#shortenerDropdown'), ddBtn = $('#shortenerBtn'), ddMenu = $('#shortenerMenu'), ddLabel = $('#shortenerLabel');

function selectShortener(value, persist = true) {
  const item = ddMenu.querySelector(`li[data-value="${value}"]`);
  if (!item) return;
  ddMenu.querySelectorAll('li').forEach(li => { li.classList.remove('active'); li.setAttribute('aria-selected', 'false'); });
  item.classList.add('active'); item.setAttribute('aria-selected', 'true');
  ddLabel.textContent = item.childNodes[0].textContent.trim();
  state.shortener = value;
  if (persist) save(LS.pref, { ...load(LS.pref, {}), shortener: value });
  refresh();
}
function openDropdown(open) {
  ddWrap.classList.toggle('open', open);
  ddMenu.classList.toggle('hidden', !open);
  ddBtn.setAttribute('aria-expanded', String(open));
}
ddBtn.addEventListener('click', () => openDropdown(ddMenu.classList.contains('hidden')));
ddMenu.addEventListener('click', e => {
  const li = e.target.closest('li[data-value]');
  if (li) { selectShortener(li.dataset.value); openDropdown(false); }
});
document.addEventListener('click', e => { if (!ddWrap.contains(e.target)) openDropdown(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') openDropdown(false); });

/* ---------- Generate ---------- */
const setStatus = t => statusEl.textContent = t;
function setLoading(show, message = '') {
  loadingScreen.hidden = !show;
  if (message) loadingMessage.textContent = message;
  if (!show) loadingProgress.style.width = '0%';
}
const loadingTitle = $('#loadingTitle'), loadingClose = $('#loadingClose'), loadingNoteLbl = $('#loadingNoteLbl');
function showError(name) {
  loadingScreen.classList.add('error');
  loadingTitle.innerHTML = 'ERRO AO<br><span>GERAR</span>';
  loadingMessage.textContent = `Não foi possível gerar o link com ${name}. Verifique a URL ou tente novamente.`;
  loadingNoteLbl.textContent = 'FALHA EM';
  loadingProvider.textContent = name.toUpperCase();
  loadingProgress.style.width = '100%';
  loadingClose.hidden = false;
}
function closeLoading() {
  loadingScreen.classList.remove('error');
  loadingTitle.innerHTML = 'GERANDO SEU<br><span>HYPERLINK</span>';
  loadingNoteLbl.textContent = 'PROCESSANDO';
  loadingClose.hidden = true;
  setLoading(false);
}
loadingClose.addEventListener('click', closeLoading);

async function generate() {
  if (gen.disabled) return;
  state.busy = true; gen.classList.add('busy'); gen.disabled = true;
  $('#genTxt').textContent = 'Gerando hyperlink...';
  closeLoading();
  setLoading(true, 'Conectando ao encurtador...');
  const target = normalize(urlEl.value);
  const s = SHORTENERS[state.shortener];   // somente o encurtador selecionado, sem fallback
  loadingProvider.textContent = s.name.toUpperCase();
  loadingProgress.style.width = '50%';
  setStatus('Encurtando... ' + s.name);
  let short = null;
  try { short = await s.run(target); } catch { /* erro tratado abaixo */ }

  state.busy = false; gen.classList.remove('busy');
  $('#genTxt').textContent = 'Gerar hyperlink';
  if (!short) { setStatus('Falha ao gerar com ' + s.name + '.'); showError(s.name); refresh(); return; }
  closeLoading();
  setStatus('Sucesso via ' + s.name);
  const usedName = s.name;

  const label = LINK_TEXT[state.style] || 'Abra aqui';
  state.last = `[${label}](${short})`;
  $('#result').textContent = state.last;
  $('#termEngine').textContent = usedName;
  $('#pvText').textContent = label;
  $('#pvTo').textContent = '→ ' + short;
  $('#out').classList.remove('hidden');
  refresh();
}
gen.addEventListener('click', generate);
$('#again').addEventListener('click', generate);

/* ---------- Copy ---------- */
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  const t = $('#toast'); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600);
}
$('#copy').addEventListener('click', async e => {
  const b = e.currentTarget; const old = b.innerHTML;
  await copy(state.last);
  b.innerHTML = '<svg class="ic"><use href="#ic-check"/></svg> Copiado';
  setTimeout(() => b.innerHTML = old, 1800);
});

/* ---------- Particles (monochrome) ---------- */
(function particles() {
  const cv = $('#bg'), cx = cv.getContext('2d');
  let w, h; const resize = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
  resize(); addEventListener('resize', resize);
  const P = Array.from({ length: 50 }, () => ({ x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, r: Math.random() * 1.4 + .4 }));
  (function tick() {
    cx.clearRect(0, 0, w, h); cx.fillStyle = '#fff';
    P.forEach(p => { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      cx.globalAlpha = .12 + Math.random() * .1;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); });
    if (!matchMedia('(prefers-reduced-motion:reduce)').matches) requestAnimationFrame(tick);
  })();
})();

/* ---------- Init ---------- */
(function init() {
  const p = load(LS.pref, {});
  selectShortener(p.shortener && SHORTENERS[p.shortener] ? p.shortener : 'abreai', false);
  if (p.style) document.querySelector(`.style[data-style="${p.style}"]`)?.click();
  refresh();
})();
})();
