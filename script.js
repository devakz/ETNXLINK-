/* ETNX HYPERLINK — client-side only */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const urlEl = $('#url'), field = $('#field'), gen = $('#gen'), statusEl = $('#status');
const loadingScreen = $('#loadingScreen'), loadingMessage = $('#loadingMessage');
const loadingProgress = $('#loadingProgress'), loadingProvider = $('#loadingProvider');
const state = { style: null, busy: false, last: '', shortener: 'isgd' };

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
function guessShortUrl(obj) {
  if (typeof obj === 'string') return obj;
  for (const k of ['shorturl', 'short_url', 'result_url', 'url', 'link', 'short']) if (obj?.[k]) return obj[k];
  if (obj?.data?.url) return obj.data.url;
  if (obj?.result?.full_short_link) return obj.result.full_short_link;
  return null;
}

/* ---------- 10 encurtadores famosos + fallback em cadeia ---------- */
const isgdLike = host => async u => {
  const d = await (await fetch(`https://${host}/create.php?format=json&url=${enc(u)}`)).json();
  if (!d.shorturl) throw new Error(d.errormessage || 'falha'); return d.shorturl;
};
const SHORTENERS = {
  isgd:    { name: 'is.gd',     run: isgdLike('is.gd') },
  vgd:     { name: 'v.gd',      run: isgdLike('v.gd') },
  dagd:    { name: 'da.gd',     run: async u => {
    const t = (await (await fetch(`https://da.gd/shorten?url=${enc(u)}`)).text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error('falha'); return t; } },
  tinyurl: { name: 'TinyURL',   run: async u => {
    const t = (await (await fetch(`https://tinyurl.com/api-create.php?url=${enc(u)}`)).text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error('falha'); return t; } },
  cleanuri:{ name: 'CleanURI',  run: async u => {
    const r = await fetch('https://cleanuri.com/api/v1/shorten', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'url=' + enc(u) });
    const d = await r.json(); if (!d.result_url) throw new Error(d.error || 'falha'); return d.result_url; } },
  shrtco:  { name: 'Shrtco.de', run: async u => {
    const d = await (await fetch(`https://api.shrtco.de/v2/shorten?url=${enc(u)}`)).json();
    if (!d.ok) throw new Error('falha'); return d.result.full_short_link; } },
  clckru:  { name: 'Clck.ru',   run: async u => {
    const t = (await (await fetch(`https://clck.ru/--?url=${enc(u)}`)).text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error('falha'); return t; } },
  ulvis:   { name: 'Ulvis.net', run: async u => {
    const d = await (await fetch(`https://ulvis.net/api.php?url=${enc(u)}&type=json`)).json();
    const s = guessShortUrl(d) || guessShortUrl(d?.data); if (!s) throw new Error('falha'); return s; } },
  spoo:    { name: 'Spoo.me',   run: async u => {
    const r = await fetch('https://spoo.me/shorten', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'url=' + enc(u) });
    const d = await r.json(); const s = guessShortUrl(d); if (!s) throw new Error('falha'); return s; } },
  chilpit: { name: 'Chilp.it',  run: async u => {
    const t = (await (await fetch(`https://chilp.it/api.php?url=${enc(u)}`)).text()).trim();
    if (!/^https?:\/\//.test(t)) throw new Error('falha'); return t; } },
};
const ORDER = Object.keys(SHORTENERS);

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
async function generate() {
  if (gen.disabled) return;
  state.busy = true; gen.classList.add('busy'); gen.disabled = true;
  $('#genTxt').textContent = 'Gerando hyperlink...';
  setLoading(true, 'Preparando conexão segura...');
  const target = normalize(urlEl.value);
  const chosen = state.shortener;
  let short = null, usedName = '';

  const queue = [chosen, ...ORDER.filter(k => k !== chosen)];
  for (let i = 0; i < queue.length; i++) {
    const s = SHORTENERS[queue[i]];
    setStatus(i ? 'Tentando alternativa... ' + s.name : 'Encurtando... ' + s.name);
    loadingProvider.textContent = s.name.toUpperCase();
    loadingMessage.textContent = i ? 'Testando um serviço alternativo...' : 'Conectando ao encurtador...';
    loadingProgress.style.width = `${Math.max(8, ((i + 1) / queue.length) * 100)}%`;
    try { short = await s.run(target); usedName = s.name; setStatus('Sucesso via ' + s.name); break; } catch { /* próximo */ }
  }
  if (!short) setStatus('Todos os encurtadores falharam. Verifique a URL ou sua conexão.');

  state.busy = false; gen.classList.remove('busy');
  $('#genTxt').textContent = 'Gerar hyperlink';
  setLoading(false);
  if (!short) { refresh(); return; }

  const label = LINK_TEXT[state.style] || 'Abra aqui';
  state.last = `[${label}](${short})`;              // formato Markdown: [texto do estilo](URL encurtada)
  $('#result').textContent = state.last;            // texto puro: nada clicável
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
  selectShortener(p.shortener && SHORTENERS[p.shortener] ? p.shortener : 'isgd', false);
  if (p.style) document.querySelector(`.style[data-style="${p.style}"]`)?.click();
  refresh();
})();
})();
