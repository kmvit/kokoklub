// Клуб Коко — интерфейс прототипа. Один файл, без сборки.
// Данные демонстрационной версии хранятся только в браузере.
// Внешний вид — по DESIGN.md: одни компоненты на всех страницах, всё выровнено по левому краю.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');   // неразрывный пробел: «1 500» не рвётся на две строки
  const pad = n => String(n).padStart(2, '0');
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { me: null, token: null, cfg: null, pub: null, mode: 'mock', mock: null, route: '', chat: [], chips: [], pending: null, line: null, ask: null, skipped: {},
    pop: false, voteTab: 'ideas', admTab: 'today', feedKind: 'all', playing: null, shownBal: null, day: null, who: null, wantTier: null, feedTab: 'news', topic: null, thread: null, replyTo: null, openPost: null, fq: '' };

  // ---------------------------------------------------------------- словарь
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const dt = s => { const d = new Date(s); return { d: d.getDate(), wd: WD[d.getDay()], mon: MON[d.getMonth()], t: s.slice(11, 16), full: `${d.getDate()} ${MON[d.getMonth()]}, ${s.slice(11, 16)}` }; };
  const UNLOCK = { book: 'бронь вечеров', vote: 'голосования', members: 'картотека', propose: 'свои предложения', projects: 'свои проекты', cover: 'пластинка с портретом' };
  const LEVELS = [[100, 'Голос клуба'], [60, 'В картотеке'], [30, 'Свой за стойкой'], [0, 'Новый резидент']];
  const level = p => LEVELS.find(l => p >= l[0])[1];
  const TERM = d => d <= 31 ? '1 месяц' : d <= 190 ? '6 месяцев' : '12 месяцев';
  const PERIOD = d => d <= 31 ? 'за месяц' : d <= 190 ? 'за полгода' : 'за год';
  const KIND = { vinyl: 'Винил', cinema: 'Кино', lecture: 'Лекция', set: 'Диджей-сет', projects: 'Проекты', secret: 'Резиденты' };
  const GIFT = { vinyl: 'винил с портретом' };
  const cr = n => `${num(n)} ${plural(n, 'кредит', 'кредита', 'кредитов')}`, rub = n => `${num(n)} ₽`;
  function plural(n, a, b, c) { return n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c; }

  // ---------------------------------------------------------------- графика
  // Логотипы, эмблемы клубов и символы — только готовые файлы дизайн-системы «Латунная акустика» (папка ds/), ничего не перерисовываем.
  const logo = () => `<img src="ds/koko_B_horizontal_on-dark.svg" alt="Клуб Коко" width="149" height="60">`;
  const wordmark = () => `<img src="ds/koko_C_wordmark_on-dark.svg" alt="Коко" style="width:100%;height:auto;display:block">`;
  const sign = f => `<img class="sign" src="ds/${f}.svg" alt="">`;
  const SIGN = { vinyl: sign('club_music'), cinema: sign('club_cinema'), lecture: sign('club_talk'), set: sign('club_exchange'), projects: sign('club_projects'), secret: sign('club_meet'),
    club: sign('koko_E_mark_color'), arch: sign('club_arch'), books: sign('club_books'), design: sign('club_design'), study: sign('club_design'), talk: sign('club_talk') };
  const emblem = (size = 72) => `<img class="emblem" src="ds/koko_E_mark_on-green.svg" width="${size}" height="${Math.round(size * .853)}" alt="">`;
  // ---------------------------------------------------------------- распорядок дня: шкала приёмника
  // Время клуба — московское (Пятигорск). Всё считаем в минутах от полуночи.
  const MSK = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const mskNow = () => { const p = MSK.formatToParts(new Date()), g = t => +((p.find(x => x.type === t) || {}).value || 0); return g('hour') * 60 + g('minute'); };
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5), hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const dur = m => [Math.floor(m / 60) ? `${Math.floor(m / 60)} ч` : '', m % 60 ? `${m % 60} мин` : ''].filter(Boolean).join(' ') || 'минута';
  // Части дня из настроек; промежуток между ними (с 18 до 19) — отдельный отрезок без программы.
  const dayModes = () => { const out = []; S.cfg.day.forEach((d, i) => { const a = toMin(d.from), b = toMin(d.to), prev = out[out.length - 1];
    if (prev && prev.b < a) out.push({ a: prev.b, b: a, i: -1, gap: true, name: `Скоро ${d.name.toLowerCase()}`, text: `${d.name} начнётся в ${d.from}.` });
    out.push({ a, b, i, name: d.name, text: d.text, from: d.from, to: d.to }); });
    // Сегодняшняя программа: если в части дня стоит событие, шкала показывает его вместо общего описания.
    const today = dayKey(new Date()), evs = ((S.pub && S.pub.events) || []).filter(e => e.start.slice(0, 10) === today);
    out.forEach(x => { if (x.gap) return; const e = evs.find(e => { const m = toMin(e.start.slice(11, 16)); return m >= x.a && m < x.b; }); if (e) { x.ev = e; x.text = `${e.start.slice(11, 16)} · ${e.title}`; } });
    return out; };
  const modeAt = m => { const h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close);
    if (m < o) return { closed: true, name: 'Клуб закрыт', text: `Откроемся в ${h.open}.` };
    if (m >= z) return { closed: true, name: 'Клуб закрыт', text: `Откроемся завтра в ${h.open}.` };
    return dayModes().find(x => m >= x.a && m < x.b) || { name: 'Клуб открыт', text: '' }; };
  // Шкала: стеклянное окно приёмника (подсветка — hf/tuner_glass_in.jpg), диапазоны — части дня, жирные риски — границы, красная стрелка — время.
  // Стрелку можно тянуть или двигать стрелками клавиатуры; кнопки под шкалой — как кнопки станций.
  function tunerHTML() { const h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close), F = m => ((m - o) / (z - o)).toFixed(4), M = dayModes();
    const edges = [...new Set(M.flatMap(x => [x.a, x.b]))].sort((a, b) => a - b);
    const al = (m, k) => k === 0 ? 'l' : k === edges.length - 1 ? 'r' : edges[k + 1] - m < 120 ? 'r' : m - edges[k - 1] < 120 ? 'l' : '';
    let ticks = ''; for (let m = o; m <= z; m += 30) { const hr = m % 60 === 0; ticks += `<i class="tg-t${hr ? ' h' : ''}" style="--f:${F(m)}"></i>${hr && !edges.includes(m) ? `<span class="tg-n" style="--f:${F(m)}">${m / 60}</span>` : ''}`; }
    const bands = M.map(x => x.gap ? `<span class="tg-gap" style="--f:${F(x.a)};--w:${F(o + x.b - x.a)}"></span>` : `<span class="tg-band" data-i="${x.i}" style="--f:${F(x.a)};--w:${F(o + x.b - x.a)}"><b>${esc(x.name)}</b></span>`).join('');
    const marks = edges.map((m, k) => `<span class="tg-edge ${al(m, k)}" style="--f:${F(m)}"><b>${hhmm(m)}</b></span>`).join('');
    const keys = M.filter(x => !x.gap).map(x => `<button class="tk-key" data-act="tune" data-m="${Math.round((x.a + x.b) / 2 / 5) * 5}" data-i="${x.i}" aria-pressed="false"><span class="tk-time">${x.from}–${x.to}</span><span class="tk-name">${esc(x.name)}</span><span class="tk-text">${esc(x.text)}</span></button>`).join('');
    return `<div class="tuner" data-tuner>
      <div class="tuner-read" aria-live="polite"><div class="tr-mode"><p class="tr-cap"><i class="lamp" aria-hidden="true"></i><span data-t="cap"></span></p><p class="tr-name" data-t="name"></p><p class="tr-sub" data-t="sub"></p></div>
        <div class="tr-clock"><span class="tr-cap">Пятигорск</span><span class="tr-time" data-t="clock"></span><button class="tr-live" data-act="tunenow" hidden>Вернуть на сейчас</button></div></div>
      <div class="tuner-row"><div class="tuner-glass" role="slider" tabindex="0" aria-label="Шкала дня" aria-valuemin="${o}" aria-valuemax="${z - 5}"><div class="tg-in">${bands}${ticks}${marks}<span class="tg-now" aria-hidden="true"></span><span class="tg-needle" aria-hidden="true"></span></div></div>
        <div class="tuner-knob" role="slider" tabindex="0" aria-label="Ручка настройки: крутите, чтобы сдвинуть стрелку" aria-valuemin="${o}" aria-valuemax="${z - 5}"><span class="tk-ring" aria-hidden="true"></span><span class="tk-dial" aria-hidden="true"><i></i></span></div></div>
      <div class="tuner-keys">${keys}</div></div>`; }
  // Настроить шкалу: live — стрелка идёт за временем, иначе стоит там, куда её поставили.
  function tune(t, m, live) { if (!t) return; const h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close), now = mskNow(), open = now >= o && now < z;
    if (live) { delete t.dataset.tuned; m = now; } else t.dataset.tuned = '1';
    const x = modeAt(m), q = k => t.querySelector(`[data-t="${k}"]`), fr = v => Math.min(1, Math.max(0, (v - o) / (z - o))).toFixed(4);
    t.style.setProperty('--needle', fr(m)); t.style.setProperty('--nowf', fr(now)); t.style.setProperty('--rot', ((Math.min(z, Math.max(o, m)) - o) * 2).toFixed(1) + 'deg');   // один оборот ручки — три часа
    t.classList.toggle('is-open', open); t.classList.toggle('is-tuned', !live); t.classList.toggle('is-off', !!x.closed);
    q('cap').textContent = live ? (open ? `Открыто до ${h.close}` : 'Сейчас закрыто') : `На шкале ${hhmm(m)}`;
    q('name').textContent = x.name;
    q('sub').innerHTML = x.closed || x.gap ? esc(x.text) : `${hhmm(x.a)}–${hhmm(x.b)}${live ? ` · <span class="nw">ещё ${dur(x.b - m)}</span>` : ''}`;
    q('clock').textContent = hhmm(now); t.querySelector('.tr-live').hidden = !!live;
    t.querySelectorAll('.tg-band').forEach(b => b.classList.toggle('on', +b.dataset.i === x.i));
    t.querySelectorAll('.tk-key').forEach(b => { const on = +b.dataset.i === x.i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    t.querySelectorAll('.tuner-glass, .tuner-knob').forEach(g => { g.setAttribute('aria-valuenow', Math.min(z - 5, Math.max(o, m))); g.setAttribute('aria-valuetext', `${hhmm(m)}, ${x.name.toLowerCase()}`); }); }
  const initTuners = () => document.querySelectorAll('[data-tuner]:not([data-ready])').forEach(t => { t.dataset.ready = '1'; tune(t, 0, true); });
  const EYE = on => on
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 10c2.2 3.2 5.2 5 9 5s6.8-1.8 9-5"/><path d="M5.5 13.6l-1.7 2.2M12 15v3M18.5 13.6l1.7 2.2M8.6 14.7l-.9 2.6M15.4 14.7l.9 2.6"/></g></svg>`;
  // Заполненность зала — светодиодная шкала по компоненту Meter (21st.dev, без React): один сегмент — одно место, горят занятые.
  // Последняя четверть шкалы — янтарная, последняя десятая — терракотовая. Сегменты загораются по очереди; при «меньше движения» — сразу.
  const seatMeter = (taken, n) => { taken = Math.max(0, Math.min(taken, n)); const free = n - taken;
    return `<div class="meter${free ? '' : ' full'}" role="meter" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${taken}" aria-label="Зал: занято ${taken} из ${n} мест, свободно ${free}">
      <div class="meter-head"><span>Зал · занято ${taken} из ${n}</span><b>${free ? `Свободно ${free}` : 'Мест нет'}</b></div>
      <div class="meter-row" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--i:${i}" class="${i < taken ? 'on' : ''}${i / n >= .9 ? ' d' : i / n >= .75 ? ' w' : ''}"></i>`).join('')}</div></div>`; };
  const pic = (name, alt = '', motes = false) => `<div class="pic"><img src="img/${name}.jpg" alt="${esc(alt)}" onerror="this.remove()">${motes && !REDUCE ? '<canvas class="motes" aria-hidden="true"></canvas>' : ''}</div>`;
  // Шапка страницы: заголовок, линия с точкой, голос клуба и предмет в арке или круге (визуализации — папка hf/).
  const HEAD_ART = { cinema: ['lamp_sun', 'wide'], vinyl: ['turntable_dark', 'arch'], sets: ['vu', 'disc'], shop: ['dialplate', 'wide'], projects: ['knob', 'disc'], cards: ['cards_fan', 'wide'] };
  const pageHead = (img, title, lead, extra = '') => { const [src, shape, mark] = HEAD_ART[img] || HEAD_ART.cinema;
    return `<div class="page-head"><div class="ph-text"><h1 class="t-page">${title}</h1><div class="rule"><i></i></div>${lead ? `<p class="lead">${lead}</p>` : ''}${extra}</div>
      <div class="ph-art ${shape}" aria-hidden="true"><img class="ph-img" src="hf/${src}.jpg" alt="">${mark ? `<img class="ph-mark" src="ds/${mark}.svg" alt="">` : ''}</div></div>`; };
  const blockTitle = (t, id) => `<h2 class="block-title t-block"${id ? ` id="${id}"` : ''}>${t}<i></i></h2>`;
  const dots = items => `<ul class="dots">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const lock = (text, btn) => `<div class="lock"><p>${text}</p>${btn || ''}</div>`;
  // Приёмы с пригласительных и афиш клуба: линия с подписью посередине, ключевые слова через терракотовые точки,
  // знак в кольце с перекрестьем, дата крупной цифрой.
  const ruleLabel = t => `<div class="rl" aria-hidden="true"><i></i><span>${t}</span><i></i></div>`;
  const kw = words => `<p class="kw">${words.map(w => `<span>${w}</span>`).join('<i aria-hidden="true"></i>')}</p>`;
  const initials = n => esc((n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2));
  // Формат события: утро — мастер-классы и клубы, вечер — формат дня недели (пн — литература … вс — вечер резидентов).
  const fmtOf = e => { const F = S.cfg.formats || []; return (e.slot === 'morning' ? F[7] : F[(new Date(e.start).getDay() + 6) % 7]) || { obj: 'obj_event', sign: 'club_meet', name: KIND[e.kind] || '' }; };
  const isToday = s => s.slice(0, 10) === dayKey(new Date());
  // Строка афиши — как в списке событий из образца: предмет формата, знак в круге, название, формат и дата справа.
  const agendaRow = (e, mine) => { const x = dt(e.start), f = fmtOf(e), t = isToday(e.start);
    return `<li><button class="ag${mine ? ' mine' : ''}" data-act="openev" data-id="${e.id}" aria-label="${esc(e.title)}, ${t ? 'сегодня' : `${x.d} ${x.mon}`}, ${x.t}">
      <span class="ag-art" aria-hidden="true"><img src="hf/${f.obj}.jpg" alt="" loading="lazy"><span class="ag-sign"><img src="ds/${f.sign}.svg" alt=""></span></span>
      <span class="ag-txt"><b>${esc(e.title)}</b><small>${esc(f.name)}${mine ? ' · ваша бронь' : e.free != null ? ` · ${e.free ? `свободно ${e.free}` : 'мест нет'}` : ''}</small></span>
      <span class="ag-when" aria-hidden="true">${t ? '<b class="ag-today">сегодня</b>' : `<b>${x.d}</b><small>${x.mon.slice(0, 3)}</small>`}<small>${x.t}</small></span></button></li>`; };
  // Билет по блоку Ticket Card (21st.dev, ham7a311): основная часть и отрывной корешок с вырезами, между ними — перфорация.
  const ticketHTML = (e, opts = {}) => { const x = dt(e.start), f = fmtOf(e), t = isToday(e.start), me = S.me, res = !!(me && me.resident);
    const price = res ? cr(e.price_res) : rub(e.price_guest), mine = me && me.bookings.includes(e.id);
    return `<article class="tix${mine ? ' mine' : ''}" aria-label="${esc(e.title)}">
      <div class="tix-main"><p class="tix-kick">${t ? 'Сегодня' : `${x.wd}, ${x.d} ${x.mon}`} · ${x.t}</p><h3 class="tix-title">${esc(e.title)}</h3>
        <dl class="tix-dl"><div><dt>Формат</dt><dd>${esc(f.name)}</dd></div><div><dt>${mine ? 'Бронь' : 'Вход'}</dt><dd>${mine ? 'ваша' : price}</dd></div><div><dt>Мест</dt><dd>${e.free ? `${e.free} из ${S.cfg.seats.hall}` : 'нет'}</dd></div></dl></div>
      <div class="tix-stub"><p class="tix-date" aria-hidden="true"><b>${x.d}</b><small>${x.mon.slice(0, 3)}</small></p>
        <button class="btn ${opts.primary === false ? '' : 'primary '}small" data-act="openev" data-id="${e.id}">${mine ? 'Открыть' : opts.label || 'Выбрать место'}</button></div></article>`; };

  // ---------------------------------------------------------------- связь
  async function api(method, path, body) {
    return S.mock(method, path, body, S.token);
  }
  const call = async (method, path, body) => { try { return await api(method, path, body); } catch (e) { toast(e.message); if (e.status === 402) go('cabinet'); return null; } };
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  let toastT;
  function toast(t) { $$('.toast').forEach(x => x.remove()); const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 4500); }
  function modal(html, wide) { closeModal(); const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`; m.addEventListener('click', e => { if (e.target === m) closeModal(); }); document.body.appendChild(m); const f = m.querySelector('input,button'); f && f.focus(); }
  function closeModal() { const m = $('.modal'); m && m.remove(); }
  function levelUp(opened) {
    $$('.levelup').forEach(x => x.remove());
    const el = document.createElement('div'); el.className = 'levelup'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="t-cap">Новый уровень</span><span class="t-block">${level(S.me.progress)}</span><span class="t-small t-2">Открыто: ${opened.map(k => UNLOCK[k]).join(', ')}</span>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2800);
  }

  async function boot() {
    S.mock = window.KokoMock(window.KOKO_SEED);
    S.pub = await api('GET', '/api/public');
    S.cfg = S.pub.config;
    S.token = store.get('koko-token-' + S.mode);
    if (S.token) { try { S.me = await api('GET', '/api/me'); } catch (e) { S.token = null; } }
    S.route = location.hash.slice(1); window.addEventListener('hashchange', () => { S.route = location.hash.slice(1); draw(); });
    draw();
  }
  // Вкладки со скользящей плашкой — по компоненту Animated Tabs (21st.dev, educalvolpz): плашка переезжает к выбранной вкладке, стрелки ← → и Home/End переключают.
  const placeTabs = () => document.querySelectorAll('.tabs').forEach(box => { const on = box.querySelector('[aria-selected="true"]'); if (!on) { box.style.setProperty('--tw', '0px'); return; }
    if (!box.dataset.ready) requestAnimationFrame(() => { box.dataset.ready = '1'; });
    box.style.setProperty('--tx', on.offsetLeft + 'px'); box.style.setProperty('--ty', on.offsetTop + 'px'); box.style.setProperty('--tw', on.offsetWidth + 'px'); box.style.setProperty('--th', on.offsetHeight + 'px'); });
  // Переключатель-сегменты: плашка помнит прошлое место (S.segX) и переезжает к новому даже после перерисовки ленты.
  const placeSeg = () => document.querySelectorAll('.seg').forEach(box => { const on = box.querySelector('[aria-pressed="true"]'); if (!on) return;
    const key = box.classList.contains('dark') ? 'mv' : 'seg'; S[key + 'X'] = on.offsetLeft; S[key + 'W'] = on.offsetWidth; box.style.setProperty('--sx', on.offsetLeft + 'px'); box.style.setProperty('--sw', on.offsetWidth + 'px');
    if (on.offsetLeft < box.scrollLeft || on.offsetLeft + on.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = on.offsetLeft - 24;
    if (!box.dataset.ready) requestAnimationFrame(() => { box.dataset.ready = '1'; }); });
  document.addEventListener('keydown', e => { const b = e.target.closest && e.target.closest('.seg-b'); if (!b || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const all = [...b.parentElement.children], i = all.indexOf(b), n = all.length, j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    e.preventDefault(); S.segFocus = 1; all[j].click(); });
  new MutationObserver(() => requestAnimationFrame(() => { placeTabs(); placeSeg(); initTuners(); })).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  addEventListener('resize', () => requestAnimationFrame(() => { placeTabs(); placeSeg(); }));
  document.addEventListener('keydown', e => { const tab = e.target.closest && e.target.closest('.tabs [role="tab"]'); if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const all = [...tab.parentElement.querySelectorAll('[role="tab"]')], i = all.indexOf(tab), n = all.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n; e.preventDefault(); all[j].click();
    requestAnimationFrame(() => { const k = document.querySelectorAll('.tabs [role="tab"]'); [...k].find(x => x.textContent === all[j].textContent)?.focus(); }); });
  // Тёплый свет под курсором и подсвеченная кромка карточки — по компоненту Spotlight (21st.dev, kevingirelli), переписан без React:
  // две CSS-переменные на кадр, касания пропускаем.
  let spotRaf = 0; document.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const c = e.target.closest && e.target.closest('.card'); if (!c) return;
    cancelAnimationFrame(spotRaf); spotRaf = requestAnimationFrame(() => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }); }, { passive: true });
  // Шкала дня: стрелку тянут мышью или пальцем (по горизонтали), стрелки клавиатуры двигают её на 15 минут, PageUp/PageDown — на час, Esc возвращает к текущему времени.
  const tgMin = (g, x) => { const r = g.querySelector('.tg-in').getBoundingClientRect(), h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close);
    return Math.min(z - 5, o + Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * (z - o) / 5) * 5); };
  document.addEventListener('pointerdown', e => { const g = e.target.closest && e.target.closest('.tuner-glass'); if (!g || e.button > 0) return; const t = g.closest('[data-tuner]');
    g.setPointerCapture(e.pointerId); g.classList.add('drag'); tune(t, tgMin(g, e.clientX));
    const mv = ev => tune(t, tgMin(g, ev.clientX)), up = () => { g.classList.remove('drag'); ['pointermove', 'pointerup', 'pointercancel'].forEach((n, k) => g.removeEventListener(n, k ? up : mv)); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); });
  // Ручка настройки — как на настоящем приёмнике: крутите мышью или пальцем по кругу, колёсиком или стрелками. Один оборот — три часа.
  document.addEventListener('pointerdown', e => { const k = e.target.closest && e.target.closest('.tuner-knob'); if (!k || e.button > 0) return; const t = k.closest('[data-tuner]'), h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close);
    e.preventDefault(); k.setPointerCapture(e.pointerId); k.classList.add('drag'); k.focus({ preventScroll: true });
    const r = k.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, ang = ev => Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let prev = ang(e), cur = +k.getAttribute('aria-valuenow') || o;
    const mv = ev => { let d = ang(ev) - prev; prev = ang(ev); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        cur = Math.min(z - 5, Math.max(o, cur + d / (2 * Math.PI) * 180)); tune(t, Math.round(cur / 5) * 5); },
      up = () => { k.classList.remove('drag'); ['pointermove', 'pointerup', 'pointercancel'].forEach((n, i) => k.removeEventListener(n, i ? up : mv)); };
    k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up); });
  document.addEventListener('wheel', e => { const k = e.target.closest && e.target.closest('.tuner-knob'); if (!k) return; e.preventDefault();
    const t = k.closest('[data-tuner]'), h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close), cur = +k.getAttribute('aria-valuenow') || o;
    tune(t, Math.min(z - 5, Math.max(o, cur + (e.deltaY > 0 ? 5 : -5)))); }, { passive: false });
  // Вопросы: стрелки вверх-вниз, Home и End переводят фокус между вопросами, как в аккордеоне 21st.dev.
  document.addEventListener('keydown', e => { const q = e.target.closest && e.target.closest('.faq-q'); if (!q || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const all = $$('.faq-q', q.closest('.faq')), i = all.indexOf(q); e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length; all[j].focus(); });
  document.addEventListener('keydown', e => { const g = e.target.closest && e.target.closest('.tuner-glass, .tuner-knob'); if (!g) return;
    const t = g.closest('[data-tuner]'), cur = +g.getAttribute('aria-valuenow'), h = S.cfg.hours, o = toMin(h.open), z = toMin(h.close);
    const step = { ArrowRight: 15, ArrowUp: 15, ArrowLeft: -15, ArrowDown: -15, PageUp: 60, PageDown: -60 }[e.key];
    if (e.key === 'Escape') { e.preventDefault(); return tune(t, 0, true); }
    const m = step != null ? Math.round((cur + step) / 15) * 15 : e.key === 'Home' ? o : e.key === 'End' ? z - 5 : null; if (m == null) return;
    e.preventDefault(); tune(t, Math.min(z - 5, Math.max(o, m))); });
  setInterval(() => document.querySelectorAll('[data-tuner][data-ready]:not([data-tuned])').forEach(t => tune(t, 0, true)), 20000);
  // Наклон клубной карты под курсором (±5°), касания и «меньше движения» пропускаем.
  document.addEventListener('pointermove', e => { if (REDUCE || e.pointerType === 'touch') return; const c = e.target.closest && e.target.closest('.mcard'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 10).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 10).toFixed(2) + 'deg'); }, { passive: true });
  document.addEventListener('pointerout', e => { const c = e.target.closest && e.target.closest('.mcard'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });
  function go(r) { if (location.hash.slice(1) === r) { S.route = r; draw(); } else location.hash = r; window.scrollTo(0, 0); }
  function setSession(o) { S.token = o.token; S.me = o.me; S.shownBal = o.me.balance; store.set('koko-token-' + S.mode, o.token); S.chat = []; S.ask = null; S.skipped = {}; S.pop = false; S.who = null; S.mopen = false; S.mview = S.mq = S.msph = S.msort = null; closeModal(); go(''); }
  const setMe = me => { if (me) S.me = me; };

  // ---------------------------------------------------------------- каркас
  // Навигация по ролям. Главное — в строке, второстепенное — под «Ещё». На телефоне — нижняя панель из четырёх разделов и «Ещё».
  const NAV_RES = [['', 'Клуб'], ['afisha', 'Афиша'], ['members', 'Картотека'], ['feed', 'Лента'], ['library', 'Медиатека'], ['cabinet', 'Кабинет']];
  const NAV_GUEST = [['', 'Афиша'], ['library', 'Медиатека'], ['menu', 'Меню'], ['feed', 'Лента'], ['join', 'Клубная карта'], ['cabinet', 'Кабинет']];
  const NAV_PUB = [['afisha', 'Афиша'], ['library', 'Медиатека'], ['menu', 'Меню'], ['feed', 'Лента'], ['join', 'Клубная карта']];
  const NAV_STAFF = [['', 'Смена'], ['afisha', 'Афиша'], ['menu', 'Меню'], ['feed', 'Лента']];
  const navMain = me => !me ? NAV_PUB : me.role === 'staff' ? NAV_STAFF : me.resident ? [...NAV_RES, ...(me.role === 'admin' ? [['admin', 'Админка']] : [])] : NAV_GUEST;
  const navMore = me => [...(me && me.resident ? [['votes', 'Голосования'], ['menu', 'Меню'], ['projects', 'Проекты']] : [['library', 'Медиатека']]), ['records', 'Записи'], ...(me ? [['shop', 'Лавка']] : []), ['host', 'Предложить встречу'], ['rules', 'Правила клуба']];
  const navTab = me => !me ? [['afisha', 'Афиша'], ['menu', 'Меню'], ['feed', 'Лента'], ['join', 'Карта']] : me.role === 'staff' ? NAV_STAFF : me.resident ? [['', 'Клуб'], ['afisha', 'Афиша'], ['members', 'Картотека'], ['feed', 'Лента']] : [['', 'Афиша'], ['feed', 'Лента'], ['join', 'Карта'], ['cabinet', 'Кабинет']];
  const navBadge = r => { const me = S.me; return r === 'members' && me && me.unread ? ` · ${me.unread}` : r === 'feed' && me && me.forum_unread ? ` · ${me.forum_unread}` : ''; };
  const navLink = ([r, t]) => { const on = S.route.split('/')[0] === r; return `<a href="#${r}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${t}${navBadge(r)}</a>`; };
  function shell(inner) {
    const me = S.me, nav = navMain(me), more = navMore(me).filter(([r]) => !nav.some(([x]) => x === r)), c = S.cfg;
    if (me && S.shownBal == null) S.shownBal = me.balance;
    return `<header class="top"><div class="wrap">
      <button class="logo" data-act="home" aria-label="На главную">${logo()}</button>
      <nav class="main" aria-label="Разделы">${nav.map(navLink).join('')}<details class="more"><summary>Ещё</summary><div class="more-pop">${more.map(navLink).join('')}</div></details></nav>
      ${me ? `<button class="coins" data-act="nav" data-to="cabinet" aria-label="Счёт: ${num(me.balance)} кредитов"><i></i><span data-coins>${num(S.shownBal)}</span></button>` : `<button class="btn small" data-act="login">Войти</button>`}
    </div></header><main class="enter">${inner}</main>
    <footer><div class="arches" aria-hidden="true"></div><div class="wrap"><span class="foot-brand">${emblem(64)}<span>Клуб Коко · Пятигорск<br><span class="motto small"><span>Культура</span><i></i><span>Музыка</span><i></i><span>Люди</span><i></i><span>Идеи</span></span></span></span>
      <nav class="foot-links" aria-label="Клуб"><a href="#${me ? '' : 'afisha'}">Афиша</a><a href="#menu">Меню</a><a href="#records">Записи</a><a href="#rules">Правила клуба</a><a href="#host" class="foot-host">Провести встречу в клубе</a></nav>
      <span class="foot-note">Каждый день с ${c.hours.open} до ${c.hours.close}.<br>${S.mode === 'mock' ? 'Демо: данные хранятся только в этом браузере.' : 'Прототип: оплата, карта для входа и вход через VK ID — заглушки.'}${me ? ` <button class="link" data-act="logout">Выйти</button>` : ''}</span></div></footer>
    <nav class="tabbar" aria-label="Главные разделы">${navTab(me).map(navLink).join('')}<button type="button" data-act="more" aria-haspopup="dialog">Ещё</button></nav>
    ${me && me.resident && S.route !== '' ? (S.pop ? `<div class="pop">${gameHTML(true)}</div>` : `<button class="fab" data-act="pop" aria-label="Открыть бармена"><img src="img/barman.jpg" alt="">Бармен</button>`) : ''}`;
  }
  const VIEWS = { '': home, afisha, menu, feed, join, votes, library, members, projects, records, shop, cabinet, admin, host: hostPage, rules: rulesPage };
  let drawing = 0;
  async function draw() {
    const id = ++drawing, me = S.me;
    const [r0, r1] = S.route.split('/');
    let view = r0 === 'invite' ? () => invitePage(r1) : r0 === 'code' ? () => codePage(r1) : r0 === 'org' ? () => orgPage(r1) : r0 === 'history' ? () => historyPage(r1) : VIEWS[S.route] || home;
    if (!me && !['', 'join', 'feed', 'invite', 'menu', 'code', 'org', 'host', 'records', 'rules', 'library'].includes(r0)) view = home;
    let html;
    try { html = await view(); }
    catch (e) { html = `<section class="band"><div class="wrap">${lock(esc(e.message), e.status === 403 && me && me.resident ? `<button class="btn primary" data-act="nav" data-to="">Продолжить анкету</button>` : '')}</div></section>`; }
    if (id !== drawing) return;
    $('#app').innerHTML = shell(html);
    paintCovers(); flowLayout(); S.gsel = null;
    motes(); coins();
    if (me && me.resident && $('[data-game]')) { Bar.start(); Bar.paint(); }
    if (!me && r0 === 'afisha') { const t = $('#afisha'); t && t.scrollIntoView(); }   // «Афиша» у посетителя — раздел главной
    document.body.classList.toggle('noscroll', !!$('.mdraw'));
    if (S.scrollTo) { const t = $(S.scrollTo); S.scrollTo = null; t && t.scrollIntoView({ block: 'start' }); }
  }

  // Квадратные блики от зеркальных шаров — как частицы в 2D-игре.
  function motes() {
    $$('canvas.motes').forEach(c => {
      if (c._on) return; c._on = 1;
      const x = c.getContext('2d'); let W = 0, H = 0; const ps = [];
      const fit = () => { W = c.width = c.clientWidth; H = c.height = c.clientHeight; };
      fit(); for (let i = 0; i < 26; i++) ps.push({ x: Math.random() * W, y: Math.random() * H, s: 2 + (Math.random() * 3 | 0), v: .12 + Math.random() * .3, p: Math.random() * 6 });
      const tick = t => { if (!c.isConnected) return; if (c.width !== c.clientWidth) fit(); x.clearRect(0, 0, W, H);
        for (const p of ps) { p.y -= p.v; p.x += Math.sin(t / 1400 + p.p) * .2; if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
          x.fillStyle = `rgba(255,205,130,${(.2 + .6 * Math.abs(Math.sin(t / 650 + p.p))).toFixed(2)})`; x.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  // Счёт кредитов досчитывает до нового значения ступеньками.
  function coins() {
    const el = $('[data-coins]'); if (!el || !S.me) return;
    const from = S.shownBal ?? S.me.balance, to = S.me.balance; S.shownBal = to;
    if (from === to || REDUCE) { el.textContent = num(to); return; }
    const btn = el.parentElement; btn.classList.add('bump'); let k = 0;
    const iv = setInterval(() => { k++; el.textContent = num(Math.round(from + (to - from) * k / 8)); if (k >= 8) { clearInterval(iv); btn.classList.remove('bump'); } }, 45);
  }

  // ---------------------------------------------------------------- общие блоки
  const tierCard = (k, t) => { const mine = S.me && S.me.resident && S.me.tier === k;
    return `<div class="card${t.group === 'patron' ? ' hi' : ''}"><p class="t-card">${t.name}</p>
    <p class="price">${num(t.price)} ₽<small>${PERIOD(t.days)}</small></p>${dots(t.perks)}<p class="t-small t-2">${esc(t.note)}</p>
    <div class="actions"><button class="btn${k === 'month' ? ' primary' : ''}" data-act="buy" data-tier="${k}">${mine ? 'Продлить карту' : 'Выбрать карту'}</button></div></div>`; };
  // Клубные карты колодой: лицо — цвет, срок и цена; оборот — что входит. Переворот и лёгкий наклон под курсором — по компоненту Tilt Flip Card (21st.dev, без React).
  // Скрытая сторона помечена inert, чтобы до её кнопок нельзя было дойти с клавиатуры.
  const FACE = { month: ['ink', 'koko_E_mark_on-green'], half: ['cream', 'koko_E_mark_color'], year: ['terra', 'koko_E_mark_on-green'], keeper: ['green', 'koko_E_mark_on-green'], patron: ['brass', 'koko_E_mark_mono-black'] };
  const deckHTML = () => `<div class="deck">${Object.entries(S.cfg.tiers).map(([k, t]) => { const [face, mark] = FACE[k] || FACE.month, mine = S.me && S.me.resident && S.me.tier === k, id = `mc-${k}`;
    return `<article class="mcard f-${face}${mine ? ' mine' : ''}" data-flip aria-label="Карта «${esc(t.name)}», ${num(t.price)} ₽ ${PERIOD(t.days)}">
      <div class="mc-in"><div class="mc-face mc-front" data-act="flip"><div class="mc-top"><img src="ds/${mark}.svg" alt="" width="34" height="29"><span class="mc-kind">${t.group === 'patron' ? 'Карта покровителя' : 'Клубная карта'}</span></div>
          <h3 class="mc-name">${esc(t.name)}</h3><p class="mc-price">${num(t.price)}<small>рублей ${PERIOD(t.days)}</small></p><p class="mc-note">${esc(t.note)}</p>
          ${mine ? '<p class="mc-mine">Ваша карта</p>' : ''}<button class="mc-flip" data-act="flip" aria-expanded="false" aria-controls="${id}">Что входит</button></div>
        <div class="mc-face mc-back" id="${id}" inert><p class="mc-kind">${esc(t.name)} · ${num(t.price)} ₽</p>${dots(t.perks)}
          <div class="mc-acts"><button class="btn primary" data-act="buy" data-tier="${k}">${mine ? 'Продлить карту' : 'Выбрать карту'}</button><button class="mc-flip" data-act="flip" aria-expanded="true" aria-controls="${id}">Назад</button></div></div></div></article>`; }).join('')}</div>`;
  // Пакеты входов продаются отдельно от карты: чем больше пакет, тем больше вечеров в подарок.
  const PACKS = () => S.cfg.packs.map(p => ({ ...p, n: p.paid + p.bonus, price: p.paid * S.cfg.entry.resident, save: p.bonus * S.cfg.entry.resident }));   // цена визита — вход резидента; часть визитов — в подарок
  const days = n => `${n} ${plural(n, 'визит', 'визита', 'визитов')}`;
  const LOCK = '<svg class="lk" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  // Закрытая кнопка резидента: гость видит, что именно получил бы с картой и почём. Нажатие ведёт на страницу карт.
  const locked = (label, sub) => `<button class="btn locked" data-act="nav" data-to="join" title="Доступно резидентам"><span>${LOCK}${label}</span>${sub === '' ? '' : `<span>${sub || 'для резидентов'}</span>`}</button>`;
  const packsHTML = () => { const res = S.me && S.me.resident, c = S.cfg;
    const P = PACKS(); return `<div class="grid g4">${P.map((p, i) => `<div class="card${i === P.length - 1 ? ' hi' : ''}"><p class="t-card">${p.name}</p><p class="price">${num(p.price)}<small>кредитов</small></p>
      ${dots([`${days(p.paid)} по ${num(c.entry.resident)}`, `${days(p.bonus)} бесплатно`, `На себя или на гостя`])}
      <div class="actions">${res ? `<button class="btn${i === 0 ? ' primary' : ''}" data-act="pack" data-k="${p.k}">Купить ${days(p.n)}</button>` : locked('С картой резидента', '')}</div></div>`).join('')}</div>`; };
  // Доплата за карту в вечер первого визита: гостевой вход засчитывается в карту «Месяц» до закрытия клуба.
  // Зачёт гостевого входа: только в день визита и в любую карту. На следующий день карта покупается отдельно.
  const offerHTML = () => { const o = S.me && S.me.offer; return !o ? '' : `<div class="card hi offer" style="margin-bottom:var(--s6)"><p class="t-card">Сегодня вы были у нас гостем</p>
    <p>Ваш вход ${rub(o.credit)} засчитывается в любую клубную карту — сегодня, до закрытия клуба. Завтра карта покупается по обычной цене.</p>
    <div class="offer-cards">${o.cards.map(x => `<button class="btn${x.tier === 'month' ? ' primary' : ''}" data-act="buy" data-tier="${x.tier}" data-offer="1"><span>«${esc(x.name)}»</span><span>доплата ${rub(x.price)}</span></button>`).join('')}</div></div>`; };
  // Что даёт резидентство: категория крупно, короткая фраза о ней и пункты, которые в неё входят.
  const valuesHTML = () => `<div class="grid g3">${S.cfg.values.map(([h, line, pts]) => `<div class="card value"><h3 class="value-title">${h}</h3><p class="value-line">${line}</p><ul class="ticks">${pts.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>`;
  const RULES = [
    ['Как попасть', [['Вход в клубный дом', 'Гость — 1 000 ₽, резидент — 500 до 13:00 и 750 после. Цена — по времени входа и на весь день. В любой вход входит напиток из основной карты, авторские коктейли — за доплату.'], ['Клубная карта', 'Отдельный продукт клуба, от 1 500 ₽ в месяц: онлайн-клуб, бронь за 7 дней, пригласительные, голос за программу и вход по цене резидента. В пакете визит — 600.'], ['Зачёт гостевого входа', 'Если вы пришли гостем и в тот же день оформили любую клубную карту, стоимость входа засчитывается в её цену. На следующий день карта покупается отдельно.'], ['Пригласительный', 'Гость резидента проходит бесплатно. В карте от 1 до 20 пригласительных, дополнительный можно купить за 750 кредитов или визит.'], ['Своя встреча', 'Предложить встречу может любой гость: команда клуба посмотрит, резиденты проголосуют. Ведущим не платим — клуб дарит подарок. Гостям организатора — промокоды по цене резидента. Подробности — на странице «Предложить встречу».'], ['На входе', 'Резидент прикладывает карту клуба или называет телефон. Гость с пригласительным называет уникальный код для его активации. Остальные проходят как гости.'], ['Утром и днём', 'С 10:00 до 13:00 — мастер-классы и клубы по интересам. С 13:00 до 18:00 — гостиная без программы: первые полчаса бесплатно, выдаём песочные часы. Кто остаётся дольше, платит за вход.'], ['Часы работы', 'Каждый день с 10:00 до 22:00.'], ['Отказ во входе', 'Клуб имеет право отказать во входе.']]],
    ['Бронь', [['Места', '31 место: зал и балкон работают как одно пространство. Резиденты бронируют за 7 дней, гости — в день вечера.'], ['Опоздание', 'Не пришли в течение получаса — посадку отдают другим, оплата не возвращается.'], ['Отмена', 'Больше чем за сутки — оплата возвращается на счёт. Позже — нет. Гостевая бронь не возвращается.']]],
    ['Деньги клуба', [['Кредиты', 'Счёт в клубе: 1 кредит = 1 ₽. Кредиты не сгорают.'], ['Касса', 'Рублями платят за гостевой вход, карту, пакет, пополнение счёта и подарочную карту. Остальное — кредитами. Каждое пополнение и списание видно в истории счёта.'], ['Записи', 'Сеты и лекции клуба бесплатны для всех.'], ['Пакеты визитов', 'В пакете каждый пятый визит бесплатно. Визит тратят на себя или на гостя, его можно подарить другому резиденту.'], ['Продление', 'Карта не продлевается сама. За 7 дней до конца срока клуб напомнит, продлить можно в кабинете.']]],
    ['Как у нас принято', [['Тишина', 'Просим соблюдать тишину во время проигрывания пластинки. Каждая сторона пластинки длится около 20 минут.'], ['Границы', 'Навязывать общение нельзя. По жалобе резидента клуб может аннулировать карту.'], ['Сообщения', 'Писать резиденту можно, если он подтвердил знакомство или открыл сообщения для всех.']]],
  ];
  // Распорядок дня: утро — клубные встречи, день — гостиная, вечер — программа.
  const dayHTML = () => { const eve = dayModes().filter(x => x.ev).pop();
    return `${tunerHTML()}${eve ? `<div class="day-foot"><button class="btn small" data-act="openev" data-id="${eve.ev.id}">Сегодня вечером: ${esc(eve.ev.title)}</button></div>` : ''}`; };
  const rulesHTML = () => `<div class="grid g2">${RULES.map(([h, items]) => `<div class="card"><p class="t-card">${h}</p><dl class="stack">${items.map(([b, t]) => `<div><dt><b>${b}</b></dt><dd class="t-small t-2">${t}</dd></div>`).join('')}</dl></div>`).join('')}</div>`;

  // ---------------------------------------------------------------- календарь событий
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const SLOT_NAME = { morning: 'Утро', evening: 'Вечер' };
  const bySlot = evs => { const by = {}; evs.forEach(e => { (by[e.start.slice(0, 10)] = by[e.start.slice(0, 10)] || {})[e.slot || 'evening'] = e; }); return by; };
  // Неделя клуба: семь дней, в каждом — утро и вечер. Занятое — с названием, свободное утро зовёт предложить встречу.
  // Стрелки листают недели, «Весь месяц» открывает пять недель целиком. Под неделей — день целиком и карточка выбранного события.
  function calendar(evs) {
    S.calEvs = evs;
    const me = S.me, today = new Date(); today.setHours(0, 0, 0, 0); const start = monday(today), by = bySlot(evs), maxWk = 4;
    if (!S.day || !evs.some(e => e.id === S.day)) { S.day = (evs.find(e => e.slot !== 'morning') || evs[0] || {}).id; S.wk = null; }
    const sel = evs.find(e => e.id === S.day);
    if (S.wk == null) S.wk = sel ? Math.max(0, Math.min(maxWk, Math.floor((new Date(sel.start.slice(0, 10) + 'T00:00') - start) / 6048e5))) : 0;
    const w0 = new Date(start); w0.setDate(w0.getDate() + 7 * S.wk); const w6 = new Date(w0); w6.setDate(w6.getDate() + 6);
    const range = w0.getMonth() === w6.getMonth() ? `${w0.getDate()}–${w6.getDate()} ${MON[w6.getMonth()]}` : `${w0.getDate()} ${MON[w0.getMonth()]} — ${w6.getDate()} ${MON[w6.getMonth()]}`;
    const slot = (e, k, d, past) => {
      if (!e) return past || k === 'evening' ? `<span class="slot ${k} none"><span class="sl-k">${SLOT_NAME[k]}</span><span class="sl-t t-2">—</span></span>`
        : `<button class="slot morning free" data-act="freeslot" data-date="${dayKey(d)}"><span class="sl-k">Утро свободно</span><span class="sl-t">Предложить встречу</span></button>`;
      const mine = me && me.bookings.includes(e.id), st = mine ? ' mine' : e.state === 'open' ? ' open' : e.state === 'closed' ? ' closed' : '';
      return `<button class="slot ${k}${st}" data-act="day" data-id="${e.id}" aria-pressed="${S.day === e.id}" aria-label="${d.getDate()} ${MON[d.getMonth()]}, ${SLOT_NAME[k].toLowerCase()} в ${e.start.slice(11, 16)}: ${esc(e.title)}${mine ? ', вы записаны' : ''}">
        <span class="sl-k">${SLOT_NAME[k]} · ${e.start.slice(11, 16)}</span><span class="sl-t">${esc(e.title)}</span>${mine ? '<span class="sl-mine">вы записаны</span>' : ''}</button>`; };
    const cols = Array.from({ length: 7 }, (_, i) => { const d = new Date(w0); d.setDate(d.getDate() + i); const k = dayKey(d), x = by[k] || {}, past = d < today, now = k === dayKey(today), f = S.cfg.week[i] || {};
      return `<div class="wcol${past ? ' past' : ''}${now ? ' is-today' : ''}"><p class="wc-h"><b>${d.getDate()}</b><span>${WDS[i]}${now ? ' · сегодня' : ''}</span><small>${esc(f.name || '')}</small></p>${slot(x.morning, 'morning', d, past)}${slot(x.evening, 'evening', d, past)}</div>`; }).join('');
    return `<div class="wk" data-cal><div class="wk-head"><button class="btn small icon" data-act="wk" data-d="-1" ${S.wk ? '' : 'disabled'} aria-label="Предыдущая неделя">‹</button><p class="wk-range" aria-live="polite">${range}</p>
        <button class="btn small icon" data-act="wk" data-d="1" ${S.wk < maxWk ? '' : 'disabled'} aria-label="Следующая неделя">›</button><button class="btn small" data-act="calmonth">Весь месяц</button></div>
      <div class="wk-days" role="group" aria-label="Неделя: ${range}">${cols}</div>
      <div class="legend"><span><i class="lg open"></i>можно забронировать</span><span><i class="lg mine"></i>вы записаны</span><span><i class="lg free"></i>утро свободно</span></div>
      <div class="wk-detail" data-event>${sel ? dayDetail(sel) : '<p class="empty">Событий в афише пока нет.</p>'}</div></div>`;
  }
  // День целиком: утро, гостиная и вечер — и карточка выбранного события рядом.
  function dayDetail(e) {
    const evs = S.calEvs || [], k = e.start.slice(0, 10), m = evs.find(x => x.start.slice(0, 10) === k && x.slot === 'morning'), v = evs.find(x => x.start.slice(0, 10) === k && x.slot !== 'morning'), d = dt(e.start), c = S.cfg;
    const part = (name, from, to, x, empty) => `<li class="${x && x.id === e.id ? 'on' : ''}"><span class="dp-t">${from}–${to}</span><span class="dp-n">${name}</span>${x ? `<button class="link" data-act="day" data-id="${x.id}" aria-pressed="${x.id === e.id}">${esc(x.title)}</button>` : `<span class="t-2">${empty}</span>`}</li>`;
    const free = new Date(k + 'T12:00') >= new Date(new Date().toDateString()) ? `свободно · <button class="link" data-act="freeslot" data-date="${k}">предложить встречу</button>` : 'без встречи';
    return `<div class="dd"><div class="dd-plan"><p class="t-cap t-2">${d.wd}, ${d.d} ${d.mon}</p><h3 class="t-block">День целиком</h3>
      <ol class="dplan">${part('Утро', c.day[0].from, c.day[0].to, m, free)}${part('Гостиная', c.day[1].from, c.day[1].to, null, 'кофе, книги, пластинки, разговор')}${part('Вечер', c.day[2].from, c.day[2].to, v, 'без события')}</ol>
      <p class="t-small t-2">${e.slot === 'morning' ? `Утренний вход действует весь день: резидент платит ${resPay(c.entry.morning)}, гость — ${rub(c.entry.guest)}.` : `После ${c.entry.morning_until} резидент платит ${resPay(c.entry.resident)}, гость — ${rub(c.entry.guest)}. Резидент, пришедший до ${c.entry.morning_until}, платит утреннюю цену.`}</p></div>${eventPanel(e)}</div>`;
  }
  // Пять недель целиком: в клетке сверху утро, снизу вечер.
  function monthHTML() { const evs = S.calEvs || [], today = new Date(); today.setHours(0, 0, 0, 0); const start = monday(today), by = bySlot(evs);
    const cells = Array.from({ length: 35 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); const k = dayKey(d), x = by[k] || {}, past = d < today;
      const bar = (e, sl) => e ? `<button class="mb ${sl}${S.me && S.me.bookings.includes(e.id) ? ' mine' : ''}" data-act="pickday" data-id="${e.id}" aria-label="${d.getDate()} ${MON[d.getMonth()]}, ${SLOT_NAME[sl].toLowerCase()}: ${esc(e.title)}">${esc(e.title)}</button>` : `<span class="mb ${sl} none"></span>`;
      return `<div class="mc${past ? ' past' : ''}${k === dayKey(today) ? ' is-today' : ''}"><span class="mc-d">${d.getDate()}${d.getDate() === 1 || i === 0 ? ` <small>${MON[d.getMonth()].slice(0, 3)}</small>` : ''}</span>${bar(x.morning, 'morning')}${bar(x.evening, 'evening')}</div>`; }).join('');
    return `<div class="between"><h2 class="t-block">Пять недель</h2><button class="btn small" data-act="close">Закрыть</button></div><p class="t-small t-2">В клетке сверху — утро, снизу — вечер. Нажмите на событие, чтобы открыть его.</p>
      <div class="month">${WDS.map(w => `<span class="mw">${w}</span>`).join('')}${cells}</div>`; }
  // Карточка события: две цены, схема мест и одно понятное действие для того, кто смотрит.
  // Что получил бы резидент на этом вечере: те же кнопки, но закрытые, с ценой резидента и экономией.
  // Цена резидента для гостя: кнопка видна, но закрыта; по нажатию объясняем, как получить вход по цене резидента.
  const resPay = n => S.me && S.me.resident ? cr(n) : rub(n);   // резиденту — в кредитах, остальным — в рублях
  function resPreview(e) { return `<button class="btn locked" data-act="needres" data-price="${e.price_res}"><span>${LOCK}Резидент</span><span>${resPay(e.price_res)}</span></button>`; }
  function eventPanel(e) {
    const me = S.me, res = !!(me && me.resident), d = dt(e.start), o = dt(e.opens), c = S.cfg, extra = e.extra || 0;
    const join = `<button class="btn primary" data-act="nav" data-to="join"><span>Стать резидентом</span></button>`;
    let foot;
    if (me && me.bookings.includes(e.id)) {
      foot = `<span class="status ok">Вы записаны</span><p>${!res ? 'Гостевая бронь не возвращается.' : e.hours > c.booking.refund_hours ? 'При отмене больше чем за сутки оплата вернётся на счёт.' : 'До вечера меньше суток: при отмене оплата не возвращается.'}</p><button class="btn" data-act="unbook" data-id="${e.id}"><span>Отменить бронь</span></button>`;
    } else if (e.state === 'closed') {
      foot = `<span class="status">Только для резидентов</span><p>Закрытый вечер для резидентов.</p>${join}`;
    } else if (e.state === 'guest_wait') {
      foot = `<span class="status">Сейчас бронируют резиденты</span><p>Гостям бронь откроется в день вечера, ${o.d} ${o.mon}.</p><div class="pay2"><button class="btn" disabled><span>Гость</span><span>${rub(e.price_guest)}</span></button>${resPreview(e)}</div>`;
    } else if (e.state === 'wait') {
      foot = `<span class="status">Бронь откроется ${o.d} ${o.mon} в ${o.t}</span><p>${res ? `Резиденты бронируют за ${me.window} дней до вечера.` : 'По промокоду бронь открывается за 7 дней до вечера.'}</p>`;
    } else if (!me) {
      foot = `<span class="status open">Сегодня бронируют и гости</span><div class="pay2"><button class="btn primary" data-act="login" data-tab="reg"><span>Гость</span><span>${rub(e.price_guest)}</span></button>${resPreview(e)}</div>`;
    } else if (res && !me.unlock.book) {
      foot = `<span class="status">Бронь — после 30% анкеты</span><p>Анкета заполнена на ${me.progress}%. Бармену осталось задать пару вопросов.</p><button class="btn primary" data-act="nav" data-to=""><span>Продолжить анкету</span></button>`;
    } else {
      const unit = n => !n ? 'бесплатно' : res || me.balance >= n ? cr(n) : rub(n);
      const own = e.how === 'included' ? `Вход — визит из пакета. Осталось визитов: ${me.entries_left}` : e.how === 'promo' ? (me.promo.kind !== 'invite' ? (e.deposit ? `Бронь вечера по промокоду ${esc(me.promo.code)} — с депозитом ${rub(e.deposit)}: ${rub(e.deposit - e.deposit_back)} вход, ${rub(e.deposit_back)} вернутся на ваш счёт для бара. Без брони, если будут места, вход по коду — ${rub(e.deposit - e.deposit_back)}` : `Цена по промокоду ${esc(me.promo.code)}${me.promo.org ? ` от «${esc(me.promo.org)}»` : ''}: ${unit(e.my_price)}`) : (e.my_price ? `Вход по пригласительному: ${unit(e.my_price)}` : 'Вход по пригласительному бесплатный')) : `Ваша цена: ${unit(e.my_price)}`;
      const hallOk = e.free > 0, two = e.my_price + e.second_price, twoDays = e.second_invite ? 1 : 2, byDays = me && (me.entries_left || 0) >= twoDays && !e.extra;
      foot = `<span class="status open">Можно забронировать</span><p>${own}${extra && e.how === 'included' ? `, доплата за лекцию — ${cr(extra)}` : ''}.</p>
        ${res ? `<button class="btn primary" data-act="book" data-id="${e.id}" ${hallOk ? '' : 'disabled'}><span>${e.free > 0 ? 'Забронировать место' : 'Мест нет'}</span><span>${hallOk ? (e.how === 'included' ? 'визит из пакета' : unit(e.my_price)) : ''}</span></button>
        <button class="btn" data-act="book" data-plus="1" data-id="${e.id}" ${e.free > 1 ? '' : 'disabled'}><span>${e.second_invite ? `С гостем по пригласительному · осталось ${me.invites_left}` : 'С гостем · пригласительный 500'}</span><span>${e.free > 1 ? (byDays ? days(twoDays) : unit(two)) : 'нет мест'}</span></button>`
        : `<div class="pay2"><button class="btn primary" data-act="book" data-id="${e.id}" ${hallOk ? '' : 'disabled'}><span>${hallOk ? 'Гость' : 'Мест нет'}</span><span>${hallOk ? unit(e.my_price) : ''}</span></button>${resPreview(e)}</div>`}`;
    }
    const xg = e.price_guest - c.entry.guest;
    return `<article class="poster event"><div class="between"><span class="date">${d.d}<small>${d.mon}, ${d.wd}</small></span><span class="time">${d.t}${e.end ? `–${e.end}` : ''}</span></div>
      ${SIGN[e.kind] || SIGN.vinyl}${e.theme ? `<p class="t-cap theme">${esc(e.theme)}</p>` : ''}<h3>${esc(e.title)}</h3>${e.host ? `<p class="t-small host-line">Ведёт: ${esc(e.host)}</p>` : ''}<p>${esc((e.note || '').replace(/([^.!?])$/, '$1.'))}${extra || xg ? ` Вечер по отдельной цене: доплата ${xg !== extra ? `гостю +${num(xg)}, резиденту +${num(extra)}` : `+${num(extra)} к входу`}.` : ''}</p>
      ${e.drink ? `<p>В каждый вход — любой напиток основной карты. Напиток вечера — ${esc(e.drink.replace(/^./, ch => ch.toLowerCase()))}.</p>` : ''}
      <dl class="prices"><div class="${res ? '' : 'me'}"><dt>Гость</dt><dd>${rub(e.price_guest)}</dd></div><div class="${res ? 'me' : ''}"><dt>Резидент</dt><dd>${resPay(e.price_res)}</dd></div></dl>
      <div class="foot">${seatMeter(c.seats.hall - e.free, c.seats.hall)}${foot}</div></article>`;
  }

  // ---------------------------------------------------------------- главная: посетитель, гость, резидент
  // Вход сравниваем со входом: гость и резидент. Цена резидента нажимается — без карты объясняем, как её получить.
  const funnel = (buy) => { const c = S.cfg, e = c.entry, res = !!(S.me && S.me.resident);   // buy — на странице карты кнопка сразу оформляет «Месяц»
    const rp = (n, sub) => `<button class="rp" data-act="resprice" data-price="${n}" aria-label="Вход резидента ${n} ₽ ${sub}"><span class="price">${num(n)}</span><small>${sub}</small></button>`;
    return `<div class="grid g2 vs">
      <div class="card pass cream"><p class="t-cap t-2">Вход гостя</p><div class="res-prices"><span class="rp still"><span class="price">${num(e.guest)}</span><small>рублей, весь день</small></span></div>
        ${dots(['Любой напиток основной карты', 'Вход действует до закрытия', 'Бронь — в день вечера'])}
        <div class="actions">${S.me ? '<button class="btn" data-act="scroll" data-to="afisha">Выбрать вечер</button>' : '<button class="btn" data-act="login" data-tab="reg">Зарегистрироваться гостем</button>'}</div></div>
      <div class="card hi"><p class="t-cap t-2">Вход резидента</p><div class="res-prices">${rp(e.morning, `до ${e.morning_until} — и на весь день`)}${rp(e.resident, `после ${e.morning_until}`)}</div>
        ${dots(['Тот же напиток и та же программа', 'Бронь за 7 дней, раньше гостей', 'В пакете каждый пятый визит бесплатно', `Нужна клубная карта: от ${rub(c.tiers.month.price)} в месяц`])}
        <div class="actions">${res ? '<span class="status ok">Это ваша цена</span>' : buy ? `<button class="btn primary" data-act="buy" data-tier="month">Оформить карту «${c.tiers.month.name}» · ${rub(c.tiers.month.price)}</button>` : '<button class="btn primary" data-act="nav" data-to="join">Выбрать клубную карту</button>'}</div></div></div>`; };
  // Гость или резидент — матрица по блоку Comparison Table (21st.dev, mohammadshehadeh): колонка резидента выделена, галочки и короткий текст в ячейках, кнопки в нижней строке.
  const compareHTML = buy => { const c = S.cfg, e = c.entry, me = S.me, res = !!(me && me.resident);
    const Y = '<span class="ck" role="img" aria-label="есть"></span>', N = '<span class="nk" role="img" aria-label="нет"></span>';
    const rows = [['Вход', rub(e.guest), `${rub(e.morning)} до ${e.morning_until}<br>${rub(e.resident)} после`], ['Напиток основной карты', Y, Y], ['Бронь', 'в день вечера', `за ${c.booking.window} дней`],
      ['Пригласительные для друзей', N, Y], ['Голос за программу', N, Y], ['Картотека и «Свои для своих»', N, Y]];
    const g = me ? '<button class="btn small" data-act="scroll" data-to="afisha">Выбрать вечер</button>' : '<button class="btn small" data-act="login" data-tab="reg">Зарегистрироваться</button>';
    const r = res ? '<span class="status ok">Ваша карта</span>' : buy ? `<button class="btn primary small" data-act="buy" data-tier="month">Оформить · ${rub(c.tiers.month.price)}</button>` : '<button class="btn primary small" data-act="nav" data-to="join">Выбрать карту</button>';
    return `<div class="cmp-wrap"><table class="cmp"><caption class="sr">Что отличается у гостя и резидента</caption>
      <thead><tr><td></td><th scope="col">Гость<small>без карты</small></th><th scope="col" class="hi">Резидент<small>карта от ${rub(c.tiers.month.price)} в месяц</small></th></tr></thead>
      <tbody>${rows.map(([h, a, b]) => `<tr><th scope="row">${h}</th><td>${a}</td><td class="hi">${b}</td></tr>`).join('')}<tr class="cmp-foot"><td></td><td>${g}</td><td class="hi">${r}</td></tr></tbody></table></div>
      <div class="actions cmp-cta">${g}${r}</div>
      <p class="cmp-note">Пришли гостем и решили остаться — оформите карту в тот же день, вход засчитаем в её цену.</p>`; };
  // Как попасть — четыре шага по блоку How It Works Steps (21st.dev, ln-dev7): номер в круге, линия между шагами, без иконок.
  const stepsHTML = () => { const c = S.cfg;
    const steps = [['Выберите время', 'утро, день или вечер в афише'], ['Оставьте телефон', 'гости бронируют в день вечера'], ['Приходите', `вход ${rub(c.entry.guest)}, напиток включён`]];
    return `<ol class="howto">${steps.map(([h, t]) => `<li><span class="howto-n" aria-hidden="true"></span><h3>${h}</h3><p>${t}</p></li>`).join('')}</ol>`; };
  // Частые вопросы — аккордеон по компоненту Accordion (21st.dev, ddoemonn): кнопка с aria-expanded, панель-регион, стрелки и Home/End между вопросами.
  const FAQ = () => { const c = S.cfg, e = c.entry, t = c.tiers;
    return [['Можно прийти без брони?', `Да, если есть свободные места. Вечером в клубе ${c.seats.hall} мест, на популярные вечера лучше бронировать. Гости бронируют в день вечера, резиденты — за ${c.booking.window} дней.`],
      ['Что входит во вход?', `Любой напиток основной карты: кофе, чай или матча. Авторские напитки, коктейли и еда — за доплату. Вход действует до закрытия клуба.`],
      ['Чем гость отличается от резидента?', `Гость платит за вход ${rub(e.guest)}. Резидент — владелец клубной карты: вход ${rub(e.morning)} до ${e.morning_until} и ${rub(e.resident)} после, бронь за ${c.booking.window} дней, пригласительные, голос за программу и картотека резидентов.`],
      ['Сколько стоит клубная карта?', `${t.month.name} — ${rub(t.month.price)}, ${t.half.name.toLowerCase()} — ${rub(t.half.price)}, ${t.year.name.toLowerCase()} — ${rub(t.year.price)}. Карта не продлевается сама: клуб ничего не списывает.`],
      ['Пришёл гостем и захотел карту. Что с входом?', 'Оформите карту в тот же день — стоимость входа засчитаем в её цену. На следующий день карта покупается отдельно.'],
      ['У меня пригласительный или промокод', `Пригласительный от резидента — вход бесплатно. Промокод организатора встречи — вход по цене резидента: ${rub(e.morning)} до ${e.morning_until} и ${rub(e.resident)} после. Введите код при регистрации.`],
      ['Что такое кредиты?', 'Счёт в клубе: 1 кредит = 1 ₽. Пополнить счёт можно на кассе или в кабинете. Кредиты не сгорают, каждая операция видна в истории счёта.'],
      ['Есть ли алкоголь?', 'В меню алкоголя нет: кофе, чай, авторские безалкогольные коктейли, панини и десерты.'],
      ['Как провести свою встречу?', 'Мастер-класс, клуб по интересам или лекцию может предложить любой гость. Команда посмотрит заявку, резиденты проголосуют. Ведущему клуб дарит подарок.']]; };
  const faqHTML = () => `<div class="faq" data-faq>${FAQ().map(([q, a], i) => `<div class="faq-item"><h3><button type="button" class="faq-q" id="faq-q${i}" aria-expanded="false" aria-controls="faq-a${i}" data-act="faq">${q}<i aria-hidden="true"></i></button></h3>
      <div class="faq-a" id="faq-a${i}" role="region" aria-labelledby="faq-q${i}" hidden><p>${a}</p>${/свою встречу/.test(q) ? '<button class="link" data-act="nav" data-to="host">Предложить встречу</button>' : ''}</div></div>`).join('')}</div>`;
  // Записи — три последние, остальные на странице «Записи».
  const recordsTeaser = () => `<div class="grid g3">${S.pub.media.slice(0, 3).map(m => `<div class="card"><p class="t-cap t-2">${m.kind === 'set' ? 'Диджей-сет' : 'Лекция'}, ${m.mins} мин</p><p class="speech">${esc(m.title)}</p><p class="t-small t-2">${esc(m.by)}</p><div class="actions"><button class="btn" data-act="nav" data-to="records">${m.kind === 'set' ? 'Слушать' : 'Смотреть'}</button></div></div>`).join('')}</div>
    <div class="actions"><button class="btn" data-act="nav" data-to="records">Все записи</button></div>`;
  // Гостю наверху — то, что касается его: брони, код, зачёт входа в карту.
  const guestStrip = (me, evs) => { const mine = me.bookings.map(id => evs.find(e => e.id === id)).filter(Boolean).sort((a, b) => a.start < b.start ? -1 : 1);
    const promo = me.promo ? (me.promo.kind !== 'invite' ? `Промокод ${esc(me.promo.code)}: ${promoLine(me.promo)}${me.promo.event && me.promo.note ? ` на вечер «${esc(me.promo.note)}»` : ''}, бронь за 7 дней.` : `Пригласительный ${esc(me.promo.code)}: первый вечер бесплатно, бронь за 7 дней.`) : '';
    return `${rateStrip()}${offerHTML()}<div class="grid g2 strip"><div class="card"><p class="t-card">Ваши брони</p>${mine.length ? `<ul class="agenda">${mine.map(e => agendaRow(e, true)).join('')}</ul>` : `<p class="t-small t-2">Броней пока нет. Гости бронируют в день вечера — выберите его в афише.</p>`}</div>
      <div class="card"><p class="t-card">${promo ? 'Ваш код' : 'Вход'}</p><p class="t-small">${promo || `Гостевой вход — ${rub(S.cfg.entry.guest)}, напиток включён. С клубной картой — ${rub(S.cfg.entry.morning)} до ${S.cfg.entry.morning_until} и ${rub(S.cfg.entry.resident)} после.`}</p>${promo ? '' : '<div class="actions"><button class="btn small" data-act="nav" data-to="join">Клубная карта</button></div>'}</div></div>`; };
  // Обложка — как пригласительный клуба: рамка с точками по углам, дата слева, часы справа, знак в кольце,
  // терракотовое полусолнце и люстра, заголовок с разрядкой, ключевые слова и билет на ближайший вечер.
  const nextEvening = () => { const now = mskNow(), today = dayKey(new Date());
    return (S.pub.events || []).find(e => e.slot !== 'morning' && (e.start.slice(0, 10) > today || (e.start.slice(0, 10) === today && toMin(e.start.slice(11, 16)) + 90 > now))); };
  // Смыслы клуба по очереди на обложке: люстра, винил, коктейли, камин, живая музыка, лекции, работа днём, кино.
  const CV_SLIDES = [['chandelier', 'Вечер в клубе'], ['vinyl', 'Винил целиком'], ['cocktails', 'Авторские коктейли'], ['fireplace', 'Камин'], ['live', 'Живые выступления'], ['lecture', 'Лекции и разговоры'], ['work', 'Работа днём'], ['cinema', 'Кино']];
  const cvShow = i => { const box = $('[data-slides]'); if (!box) return; const imgs = $$('img', box); S.cvI = (i + imgs.length) % imgs.length;
    imgs.forEach((im, k) => im.classList.toggle('on', k === S.cvI)); $$('.cv-dots button').forEach((b, k) => b.setAttribute('aria-pressed', k === S.cvI));
    const c = $('[data-slidecap]'); if (c) c.textContent = CV_SLIDES[S.cvI][1]; };
  // Смена раз в 5 секунд; пауза под курсором и при фокусе, при «меньше движения» — только по точкам.
  setInterval(() => { const box = $('[data-slides]'); if (!box || REDUCE || document.hidden || box.closest('.cv-art-wrap').matches(':hover, :focus-within')) return; cvShow((S.cvI || 0) + 1); }, 5000);
  function coverHTML() {
    const c = S.cfg, d = new Date(), ev = nextEvening(); S.cvI = 0;
    return `<section class="cv"><div class="wrap"><div class="cv-frame">
      <div class="cv-top"><p class="cv-date"><b>${d.getDate()}</b><span>${MON[d.getMonth()]}<br>${WD[d.getDay()]}</span></p>
        <span class="ring cv-mark" aria-hidden="true"><img src="ds/koko_E_mark_on-green.svg" alt=""></span>
        <p class="cv-time"><b>${c.hours.open}—${c.hours.close}</b><span>каждый день<br>Пятигорск</span></p></div>
      ${ruleLabel('Клуб Коко')}
      <div class="cv-grid">
        <div class="cv-art-wrap"><div class="cv-art" data-slides aria-hidden="true"><i class="cv-sun"></i><i class="cv-horizon"></i>${CV_SLIDES.map(([f, t], i) => `<img class="${i ? '' : 'on '}${f === 'chandelier' ? 'scr' : ''}" src="hf/${f === 'chandelier' ? 'chandelier.jpg' : `cv_${f}.webp`}" alt="" ${i ? 'loading="lazy" ' : ''}data-cap="${t}">`).join('')}</div>
          <div class="cv-dots" role="group" aria-label="Что есть в клубе">${CV_SLIDES.map(([, t], i) => `<button type="button" data-act="cvslide" data-i="${i}" aria-pressed="${!i}" aria-label="${t}"></button>`).join('')}</div>
          <p class="cv-slide-cap" data-slidecap>${CV_SLIDES[0][1]}</p></div>
        <div class="cv-text"><h1 class="cv-title">Клуб, где искусство звучит</h1>
          <p class="voice">Музыка, кино, книги и люди — в Пятигорске, каждый день.</p>
          ${kw(['Музыка', 'Кино', 'Книги', 'Дизайн', 'Люди'])}
          ${ev ? `<div class="cv-tix"><p class="cv-cap">${isToday(ev.start) ? 'Сегодня вечером' : 'Ближайший вечер'}</p>${ticketHTML(ev)}</div>` : ''}
          <div class="actions"><button class="btn${ev ? '' : ' primary'}" data-act="scroll" data-to="today">Что сегодня</button><button class="btn" data-act="scroll" data-to="how">Как попасть · ${rub(c.entry.guest)}</button></div></div></div>
    </div></div></section>`; }
  async function home() {
    const me = S.me, c = S.cfg;
    if (me && me.role === 'staff') return teamPage();
    if (me && me.resident) return barPage();
    if (me) { const evs = await api('GET', '/api/events');
      return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">
        ${pageHead('cinema', 'Афиша', `${esc(me.name)}, вы гость клуба. Гости бронируют в день вечера, вход — ${rub(c.entry.guest)}. Заранее бронируют резиденты.`)}
        ${guestStrip(me, evs)}
        ${blockTitle('Сегодня в клубе', 'today')}${dayHTML()}
        ${blockTitle('Афиша на неделю', 'afisha')}${calendar(evs)}
        ${blockTitle('Гость или резидент')}${compareHTML()}
        ${blockTitle('Клубные карты')}${deckHTML()}</div></section>`; }
    // Порядок для того, кто пришёл впервые: что это за место → что сегодня → ритм недели → даты → как попасть → что внутри → карты → вопросы.
    return `${coverHTML()}
      <section class="band"><div class="wrap">${blockTitle('Сегодня в клубе', 'today')}${dayHTML()}</div></section>
      <section class="band"><div class="wrap">${blockTitle('Неделя клуба', 'week')}<p class="lead" style="margin-bottom:var(--s5)">У каждого вечера свой формат. Утром — мастер-классы, днём — гостиная.</p>${formatsHTML()}</div></section>
      <section class="band"><div class="wrap">${blockTitle('Афиша', 'afisha')}${calendar(S.pub.events)}</div></section>
      <section class="band"><div class="wrap">${blockTitle('Как попасть', 'how')}${compareHTML()}</div></section>
      <section class="band"><div class="wrap">${blockTitle('Что есть в клубе')}${spaceHTML()}</div></section>
      <section class="band"><div class="wrap">${blockTitle('Клубные карты', 'card')}<p class="lead" style="margin-bottom:var(--s5)">Нажмите на карту — увидите, что в неё входит.</p>${deckHTML()}
        <div class="actions"><button class="btn" data-act="nav" data-to="join">Сравнить все карты</button></div></div></section>
      <section class="band"><div class="wrap">${blockTitle('Частые вопросы', 'faq')}${faqHTML()}<div class="actions"><button class="btn" data-act="nav" data-to="rules">Все правила клуба</button></div></div></section>
      <section class="band"><div class="wrap">${blockTitle('Записи')}${recordsTeaser()}</div></section>`;
  }
  // Правила клуба целиком — отдельная страница, на главной только частые вопросы.
  function rulesPage() { return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('cards', 'Правила клуба', 'Вход, бронь, деньги и порядок в зале.')}${rulesHTML()}${blockTitle('Частые вопросы')}${faqHTML()}</div></section>`; }
  // Страница «Стать резидентом»: сначала ценности, потом три группы карт и общая таблица.
  function join() {
    const me = S.me, c = S.cfg, T = Object.entries(c.tiers);
    const year = c.tiers.year;
    const entry = t => t.entries ? `${days(t.entries)} на год` : `${c.entry.resident} кредитов или визит из пакета`;
    // Выгода карты: длинные карты — против помесячной оплаты, безлимитные — с какого числа вечеров в месяц выгоднее «Года» с пакетом входов.
    const gain = (t, k) => { if (k === 'month') return 'базовая цена';
      if (!t.entries) { const months = Math.round(t.days / 30.4), save = months * c.tiers.month.price - t.price; return `${months - t.price / c.tiers.month.price} ${plural(months - t.price / c.tiers.month.price, 'месяц', 'месяца', 'месяцев')} бесплатно, −${num(save)} ₽`; }
      // карта покровителя = «Год» + визиты + кредиты: сколько визитов из неё — в подарок
      const gifted = t.entries - Math.round((t.price - t.credits - year.price) / c.entry.resident); return gifted > 0 ? `${days(gifted)} бесплатно` : 'кредиты, голоса, пригласительные'; };
    const rows = [['Цена', t => rub(t.price)], ['Срок', t => TERM(t.days)], ['Выгода', gain], ['Вход', entry], ['Кредиты на счёт', t => t.credits ? num(t.credits) : '—'], ['Бронь зала', t => `за ${t.window} дней`],
      ['Голосов в месяц', t => t.votes], ['Пригласительных', t => t.invites], ['Подарок', t => t.gift.map(g => GIFT[g]).join(', ') || '—'], ['Особое', (t, k) => k === 'patron' ? 'зал на утро раз в год, имя на стене клуба' : '—']]
      .map(([h, f]) => [h, T.map(([k, t]) => String(f(t, k)))]).filter(([, v]) => new Set(v).size > 1);   // строки, где у всех карт одно и то же, не показываем
    const same = [['Бронь зала', `за ${c.booking.window} дней`]].filter(([h]) => !rows.some(r => r[0] === h));
    const P = PACKS(), packRows = [['Платите', [rub(c.entry.resident).replace(' ₽', ' кр.'), ...P.map(p => `${num(p.price)} кр.`)]], ['Визитов', ['1', ...P.map(p => String(p.n))]], ['Бесплатно', ['—', ...P.map(p => days(p.bonus))]], ['Выгода', ['—', ...P.map(p => `${num(p.save)} кр.`)]]];
    const packTable = `${blockTitle('Пакеты в одной таблице')}<div class="tw"><table class="compare"><thead><tr><th></th><th>Разовый вход</th>${P.map((p, i) => `<th class="${i === P.length - 1 ? 'hi' : ''}">${p.name}</th>`).join('')}</tr></thead><tbody>
        ${packRows.map(([h, v]) => `<tr${/Выгода/.test(h) ? ' class="gain"' : ''}><th scope="row">${h}</th>${v.map((x, i) => `<td class="${i === v.length - 1 ? 'hi' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const lead = me && me.resident ? `Ваша карта — «${me.tier_name}». Новая карта продлевает срок действующей, визиты из пакетов сохраняются.` : 'Карта делает вас резидентом. Ниже — что меняется с картой и сколько стоит каждая.';
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('cards', 'Стать резидентом', lead)}${offerHTML()}
      ${me && me.resident ? '' : compareHTML(true)}
      ${blockTitle('Все клубные карты', 'cards')}<p class="lead" style="margin-bottom:var(--s5)">Три карты по сроку и две карты покровителей. Чем длиннее срок, тем дешевле месяц. Нажмите на карту, чтобы увидеть, что в неё входит.</p>${deckHTML()}
      ${blockTitle('Сравнение карт', 'tariffs')}<div class="tw"><table class="compare"><thead><tr><th></th>${T.map(([k, t]) => `<th class="${t.group === 'patron' ? 'hi' : ''}">${t.name}</th>`).join('')}</tr></thead><tbody>
        ${rows.map(([h, v]) => `<tr${h === 'Выгода' ? ' class="gain"' : ''}><th scope="row">${h}</th>${v.map((x, i) => `<td class="${T[i][1].group === 'patron' ? 'hi' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="t-small t-2" style="margin-top:var(--s4);max-width:var(--measure)">Во всех картах: ${same.map(([h, v]) => `${h.toLowerCase()} ${v}`).join(', ') || 'бронь за 7 дней'}, онлайн-клуб, пакеты визитов. Карта не продлевается сама: когда срок закончится, продлите её в кабинете, если хотите. Пока действует старшая карта, младшую оформить нельзя. Гость по пригласительному проходит бесплатно; дополнительный пригласительный можно купить за ${cr(c.entry.resident)} или визит.</p>
      ${blockTitle('Пакеты визитов', 'packs')}<p class="lead" style="margin-bottom:var(--s5)">${c.packs_lead}</p>${packsHTML()}${packTable}
      </div></section>`;
  }
  // Афиши форматов: предмет на бумаге, за ним знак клуба — приём «знак зависит от формата».
  // Форматы недели — сетка 3×3: семь вечеров по дням, каждое утро и гостиная днём.
  function formatsHTML() { const c = S.cfg, at = (c.day[c.day.length - 1] || {}).from || '19:00';
    return `<div class="fmts-c">${c.formats.map(f => `<article class="fmt-c"><div class="fmt-c-art" aria-hidden="true"><img class="fmt-c-obj" src="hf/${f.obj}.jpg" alt="" loading="lazy"><img class="fmt-c-sign" src="ds/${f.sign}.svg" alt=""></div><div class="fmt-c-txt"><p class="service">${esc(f.when)} · ${f.time || at}</p><h3>${esc(f.name)}</h3><p class="fmt-c-sub">${esc(f.sub)}</p></div></article>`).join('')}</div>`; }
  // Бегущая строка ближайших вечеров — по компоненту Marquee (21st.dev, kevingirelli), без React:
  // одна CSS-анимация сдвига, копия скрыта от экранного диктора, пауза при наведении и фокусе, при «меньше движения» — ручная прокрутка.
  function tickerHTML() { const evs = (S.pub.events || []).slice(0, 10); if (!evs.length) return '';
    const items = evs.map(e => { const x = dt(e.start); return `<span class="tk"><b>${x.d} ${x.mon}</b><span class="tk-wd">${x.wd} · ${x.t}</span>${esc(e.title)}</span>`; }).join('<i class="tk-dot" aria-hidden="true"></i>');
    return `<div class="ticker" role="region" aria-label="Ближайшие вечера" tabindex="0"><div class="ticker-track"><div class="ticker-group">${items}<i class="tk-dot" aria-hidden="true"></i></div><div class="ticker-group" aria-hidden="true">${items}<i class="tk-dot" aria-hidden="true"></i></div></div></div>`; }
  // «Слушаем целиком»: конверт и пластинка — по компоненту Vinyl Album Card (21st.dev, saurabh-2607), без React.
  // Обложки чужих альбомов не используем: конверт клубный, на нём название альбома и знак музыки.
  function vinylHTML() { const evs = (S.pub.events || []).filter(e => /^Альбом целиком/.test(e.title)).slice(0, 3); if (!evs.length) return '';
    return `<div class="vinyls">${evs.map(e => { const x = dt(e.start), name = e.title.replace(/^Альбом целиком:\s*/, '');
      return `<button class="vinyl" data-act="scroll" data-to="afisha" aria-label="${esc(e.title)}, ${x.d} ${x.mon}, ${x.t}. Открыть афишу">
        <span class="vinyl-stage"><span class="vinyl-disc" aria-hidden="true"><span class="vinyl-label"><img src="ds/koko_E_mark_color.svg" alt=""></span></span>
        <span class="vinyl-sleeve" aria-hidden="true"><img class="vinyl-sign" src="ds/club_music.svg" alt=""><span class="vinyl-name">${esc(name)}</span><span class="service">Клуб Коко · сторона A и B</span></span></span>
        <span class="vinyl-meta"><span class="service">${x.wd}, ${x.d} ${x.mon} · ${x.t}</span><span class="vinyl-title">${esc(name)}</span><span class="t-small t-2">${esc(e.note || 'Слушаем обе стороны, потом разговор')}</span></span></button>`; }).join('')}</div>`; }
  // Что есть в клубе: звук, кофе, камин, книги — без фотографий, только текст.
  // Что есть в клубе — бенто по блоку Bento Grid (21st.dev, kokonutd): плитки разной ширины, знак, название и одна строка.
  function spaceHTML() { const s = S.cfg.space; if (!s) return '';
    return `<div class="bento">${s.items.map(([h, x, ic, w]) => `<div class="bento-i${w > 1 ? ' wide' : ''}"><span class="medal"><img src="ds/${ic}.svg" alt=""></span><div><p class="t-card">${esc(h)}</p><p class="t-small t-2">${esc(x)}</p></div></div>`).join('')}</div>`; }
  // Меню бара: сторона A — напитки, сторона B — коктейли без алкоголя, DVD — панини. Что входит в гостевой вход, отмечено.
  async function menu() { const cn = await api('GET', '/api/council').catch(() => null);
    const m = S.cfg.menu, row = it => { const [name, a, b] = it, desc = b === undefined ? '' : a, price = b === undefined ? a : b;
      return `<li class="menu-row"><span class="menu-name">${esc(name)}${desc ? `<small>${esc(desc)}</small>` : ''}</span><span class="menu-price">${price == null ? '' : num(price)}</span></li>`; };
    const sec = x => `<div class="card menu-sec"><div class="between"><p class="t-card">${esc(x.name)}</p>${x.included ? '<span class="status ok">входит в гостевой вход</span>' : ''}</div><ul class="menu-list">${x.items.map(row).join('')}</ul></div>`;
    return `<section class="band paper sheet"><div class="wrap"><div class="sheet-head"><img src="ds/symbol_vinyl.svg" alt="" width="72" height="72"><h1 class="t-page">Меню</h1><p class="voice">${esc(m.note)}</p><img class="scale" src="ds/divider_scale.svg" alt=""></div>
      ${m.sides.map(sd => `${blockTitle(`${sd.name} · ${sd.title}`)}<div class="grid g2" style="align-items:start">${sd.sections.map(sec).join('')}</div>`).join('')}
      <p class="t-small t-2" style="margin-top:var(--s5)">Цены в рублях. Резиденты платят кредитами: 1 кредит = 1 ₽.</p>
      ${cn ? councilHTML(cn) : ''}</div></section>`;
  }
  // Тексты документов — черновики. Перед запуском их проверяет юрист и подставляет реквизиты оператора.
  const DOCS = [
    ['Согласие на обработку персональных данных', 'Черновик. Я даю клубу «Коко» (оператор: наименование, ИНН и адрес — заполнить) согласие на обработку моих данных: имени, телефона, ответов анкеты, истории посещений и платежей. Цели: ведение учётной записи, бронь и вход в клуб, работа картотеки и голосований. Действия: сбор, запись, хранение, использование, удаление. Срок: пока действует учётная запись и три года после. Согласие можно отозвать письмом на адрес клуба — данные будут удалены. Согласие оформлено отдельным документом, как требует закон № 152-ФЗ.'],
    ['Политика обработки персональных данных', 'Черновик. Какие данные собирает клуб, зачем, где хранит (серверы в России), кому передаёт (платёжный сервис — только для оплаты), как удалить данные и куда обращаться. Анкету видит команда клуба; резидентам видны только поля с открытым глазом. Фамилию и возраст клуб не показывает.'],
    ['Правила клуба и оферта', 'Черновик. Правила клуба опубликованы на первой странице. Оферта описывает: что входит в карту резидента, срок карты (сама она не продлевается), кредиты и пакеты визитов, бронь мест, отмену, возврат денег, право клуба аннулировать карту за нарушение правил.'],
  ];
  function loginModal(tab) {
    const prov = ['VK ID', 'Яндекс ID', 'Сбер ID', 'T-ID'];
    const roles = { u_admin: 'Слава — управляющий', u_anna: 'Анна — резидент', u_guest: 'Гость', u_s1: 'Даша — бармен' };
    const want = S.wantTier && S.cfg.tiers[S.wantTier];
    modal(`<h2 class="t-block">${tab === 'reg' ? 'Регистрация' : 'Вход в клуб'}</h2>
      <p class="t-small t-2">${want ? `После регистрации откроется оплата карты «${want.name}».` : 'Оставьте имя и телефон. Если вы у нас уже были, мы найдём вас по телефону.'}</p>
      <form class="form" data-form="register">
        <label class="field"><span>Имя</span><input id="reg-name" name="name" required autocomplete="name"></label>
        <label class="field"><span>Телефон</span><input id="reg-phone" name="phone" inputmode="tel" placeholder="+7" autocomplete="tel"></label>
        <label class="field"><span>Промокод или пригласительный, если есть</span><input id="reg-promo" name="promo" autocomplete="off" value="${esc(S.inviteCode || '')}"><small>Пригласительный от резидента — вход бесплатно. Промокод организатора встречи — вход по цене резидента.</small></label>
        <label class="check"><input type="checkbox" id="c-pd" name="consent_pd" required><span>Согласен(на) на обработку персональных данных</span></label>
        <label class="check"><input type="checkbox" id="c-rules" name="consent_rules" required><span>Принимаю правила клуба и условия оферты</span></label>
        <label class="check"><input type="checkbox" id="c-news" name="consent_news"><span>Хочу получать новости и анонсы клуба. Необязательно</span></label>
        ${DOCS.map(([t, body]) => `<details class="doc"><summary>${t}</summary><p>${body}</p></details>`).join('')}
        <div class="actions"><button class="btn primary">${want ? 'Продолжить к оплате' : 'Зарегистрироваться'}</button></div></form>
      <div class="or"><span class="t-cap t-2">Или войдите через</span><div class="chips">${prov.map(p => `<button class="chip" data-act="oauth" data-p="${p}">${p}</button>`).join('')}</div></div>
      <div class="or"><span class="t-cap t-2">Посмотреть сайт глазами</span><div class="chips">${S.pub.demo.map(d => `<button class="chip" data-act="demo" data-id="${d.id}">${roles[d.id] || esc(d.name)}</button>`).join('')}</div></div>`);
  }

  // ---------------------------------------------------------------- бармен: сцена, уровень, диалог
  // Разговор с барменом — по блоку Chat Bubble Thread (21st.dev, bundui): шапка с портретом в кольце и уровнем,
  // реплики пузырями (бармен слева, вы справа, открытия — по центру), варианты ответа — кнопками над полем ввода.
  function gameHTML(small) {
    const p = S.me.progress, on = Math.round(p / 5);
    return `<section class="chat${small ? ' small' : ''}" data-game aria-label="Разговор с барменом">
      <header class="chat-h"><span class="ring chat-ava" aria-hidden="true"><img src="img/barman.jpg" alt="" onerror="this.remove()"></span>
        <span class="chat-who"><b>Бармен</b><small>за стойкой клуба · спросите о вечере, правилах, людях</small></span>
        ${small ? '<button class="btn small close" data-act="pop" aria-label="Закрыть бармена">Закрыть</button>' : ''}</header>
      <div class="hud"><div class="between"><span>Уровень: <b>${level(p)}</b></span><span>Анкета ${p}%</span></div>
        <div class="xp" role="progressbar" aria-label="Анкета заполнена" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? 'on' : ''}${i === 5 || i === 11 ? ' mark' : ''}"></i>`).join('')}</div></div>
      <div class="chat-body" data-scroll><div class="history" data-h></div>
        <div class="b-row bot" data-linerow><p class="bubble line" data-line data-act="skip" aria-live="polite" title="Нажмите, чтобы дописать сразу"></p></div></div>
      <div class="choices" data-ch role="group" aria-label="Варианты ответа"></div>
      <form class="reply" data-form="say"><input name="t" autocomplete="off" data-reply aria-label="Свой ответ бармену"><button class="btn primary small">Ответить</button></form></section>`;
  }
  // Что открывает анкета — жетоны со знаками клуба, как кружки интересов в профиле из образца.
  const TROPHIES = [['book', 'Бронь вечеров', 30, 'club_arch'], ['members', 'Картотека', 60, 'club_meet'], ['propose', 'Свои предложения', 100, 'club_projects'], ['cover', 'Пластинка с портретом', 100, 'club_music']];
  // Карточка резидента — по блоку Profile Card (21st.dev, klyv-ui): портрет в кольце, имя с разрядкой, карта и срок, цифры в ряд, действия.
  function profileHTML() {
    const me = S.me, name = me.anketa.alias || me.name.split(' ')[0], u = me.tier_until ? dt(me.tier_until) : null;
    const stats = [[num(me.balance), plural(me.balance, 'кредит', 'кредита', 'кредитов')], [me.entries_left || 0, `${plural(me.entries_left || 0, 'визит', 'визита', 'визитов')} в пакете`], [me.votes_left, plural(me.votes_left, 'голос', 'голоса', 'голосов')], [me.invites_left || 0, plural(me.invites_left || 0, 'пригласительный', 'пригласительных', 'пригласительных')]];
    return `<article class="prof">
      <div class="prof-top"><span class="ring prof-ava" aria-hidden="true"><b>${initials(name)}</b></span>
        <div><p class="prof-kick">Резидент клуба</p><h1 class="prof-name">${esc(name)}</h1><p class="prof-sub">${me.card_ended ? 'Карта закончилась' : `Карта «${esc(me.tier_name)}»${u ? ` до ${u.d} ${u.mon}` : ''}`}</p></div></div>
      <dl class="prof-stats">${stats.map(([n, t]) => `<div><dt>${t}</dt><dd>${n}</dd></div>`).join('')}</dl>
      <p class="prof-cap">Что открывает анкета</p>
      <ul class="medals">${TROPHIES.map(([k, t, n, ic]) => `<li class="trophy${me.unlock[k] ? ' on' : ''}"><span class="medal-i" aria-hidden="true"><img src="ds/${ic}.svg" alt=""></span><span>${t}</span><b>${me.unlock[k] ? 'Открыто' : `Анкета ${n}%`}</b></li>`).join('')}</ul>
      <div class="actions"><button class="btn small" data-act="nav" data-to="cabinet">Кабинет</button>${me.unlock.members ? '<button class="btn small" data-act="nav" data-to="members">Картотека</button>' : ''}</div></article>`;
  }
  // Вкладка «Клуб»: кто вы в клубе → разговор с барменом → ваши брони билетами → что сегодня и скоро.
  function barPage() {
    const me = S.me, evs = S.pub.events || [];
    const mine = me.bookings.map(id => evs.find(e => e.id === id)).filter(Boolean).sort((a, b) => a.start < b.start ? -1 : 1);
    const soon = evs.filter(e => !mine.includes(e)).slice(0, 5);
    return `<section class="band club-page"><div class="wrap">${rateStrip()}<div class="club-grid">
      <div class="club-side">${profileHTML()}</div>
      <div class="club-main">${gameHTML(false)}
        <section class="club-bk" aria-labelledby="bk-h"><h2 class="cap-title" id="bk-h">Ваши брони</h2>
          ${mine.length ? `<div class="tix-list">${mine.slice(0, 3).map(e => ticketHTML(e)).join('')}</div>` : `<div class="empty-tix"><p>Броней пока нет. Резиденты бронируют за ${me.window} дней — раньше гостей.</p><button class="btn small" data-act="nav" data-to="afisha">Выбрать вечер</button></div>`}</section>
        <section class="club-ag" aria-labelledby="ag-h"><h2 class="cap-title" id="ag-h">Сегодня и скоро</h2><ul class="agenda">${soon.map(e => agendaRow(e)).join('')}</ul>
          <button class="link" data-act="nav" data-to="afisha">Вся афиша</button></section></div>
    </div></div></section>`;
  }
  const Bar = {
    start() { if (S.chat.length) return; const me = S.me, p = me.progress, name = me.anketa.alias || me.name, all = S.cfg.anketa.length, left = S.cfg.anketa.filter(f => !(me.anketa[f.k] || '').trim()).length;
      if (p === 0) this.say(`Добрый вечер, ${name}. Я бармен клуба.\nУ меня ${all} вопросов. После них клуб откроется вам целиком.`, ['Начнём', 'Сначала правила']);
      else if (p < 100) this.say(`Добрый вечер, ${name}. Анкета заполнена на ${p}%, осталось вопросов: ${left}.${this.remind()}`, this.menu());
      else this.say(`Добрый вечер, ${name}. Клуб открыт вам целиком.${this.remind()}`, this.menu()); },
    remind() { const me = S.me; return me.bookings.length ? `\nВаших броней: ${me.bookings.length}.` : !me.free_entry && !me.entries_left && me.balance < S.cfg.entry.resident ? `\nНа счёте ${me.balance} кредитов — на вход не хватит.` : me.votes_left ? `\nГолосов у вас: ${me.votes_left}.` : ''; },
    menu() { return [...(S.me.progress < 100 ? ['Продолжить анкету'] : []), 'Что сегодня?', 'С кем познакомиться?', 'Что посоветуете?', 'Правила']; },
    say(text, chips) { clearInterval(S.tw); S.chips = []; S.chat.push({ who: 'bot', text }); S.pending = chips || []; S.line = { text, n: REDUCE ? text.length : 0 }; this.paint(); this.type(); },
    type() { if (S.line.n >= S.line.text.length) return this.done();
      S.tw = setInterval(() => { S.line.n = Math.min(S.line.n + 2, S.line.text.length); this.paintLine(); if (S.line.n >= S.line.text.length) { clearInterval(S.tw); this.done(); } }, 24); },
    skip() { if (S.line && S.line.n < S.line.text.length) { clearInterval(S.tw); S.line.n = S.line.text.length; this.paintLine(); this.done(); } },
    done() { if (S.pending) { S.chips = S.pending; S.pending = null; } this.paintChoices(); this.paintLine(); },
    // Печатается последняя реплика бармена; всё до неё — в истории пузырями.
    typing() { const last = S.chat[S.chat.length - 1]; return !!(last && last.who === 'bot' && S.line && S.line.text && last.text === S.line.text); },
    paintLine() { const L = S.line; if (!L) return; const on = this.typing(), prev = S.chat[S.chat.length - 2];
      $$('[data-linerow]').forEach(r => { r.hidden = !on; r.classList.toggle('first', !prev || prev.who !== 'bot'); });
      $$('[data-line]').forEach(el => { el.innerHTML = esc(L.text.slice(0, L.n)) + (L.n < L.text.length ? '<span class="more" aria-hidden="true">▌</span>' : ''); });
      $$('[data-scroll]').forEach(b => { b.scrollTop = b.scrollHeight; }); },
    paintChoices() { $$('[data-ch]').forEach(el => { el.innerHTML = S.chips.map(c => `<button class="choice" data-act="chip" data-t="${esc(c)}">${esc(c)}</button>`).join(''); }); },
    paint() {
      const hist = (this.typing() ? S.chat.slice(0, -1) : S.chat).slice(-12);
      $$('[data-h]').forEach(el => { el.innerHTML = hist.map((m, i) => m.who === 'sys' ? `<p class="b-sys">${esc(m.text)}</p>`
        : `<div class="b-row ${m.who === 'me' ? 'me' : 'bot'}${!hist[i - 1] || hist[i - 1].who !== m.who ? ' first' : ''}"><p class="bubble">${esc(m.text)}</p></div>`).join(''); });
      $$('[data-reply]').forEach(el => { el.placeholder = S.ask ? (S.ask.ph || 'Напишите ответ') : 'Спросите о вечере, правилах или людях'; });
      this.paintLine(); this.paintChoices();
    },
    nextField() { return S.cfg.anketa.find(f => !(S.me.anketa[f.k] || '').trim() && !S.skipped[f.k]); },
    askNext(pre = '') { const f = this.nextField();
      if (!f) { S.ask = null; return this.say(pre + (S.me.progress >= 100 ? 'Анкета готова. Обложку для пластинки я отправил в кабинет. Там же можно скрыть любое поле значком глаза.' : 'Пока всё. К пропущенным вопросам вернёмся, когда захотите.'), this.menu()); }
      S.ask = f; this.say(pre + f.q, [...(f.chips || []), 'Пропустить', 'Хватит на сегодня']); },
    async handle(t) { t = t.trim(); if (!t) return; S.chat.push({ who: 'me', text: t }); S.chips = []; this.paint(); const low = t.toLowerCase();
      if (S.ask) { const f = S.ask;
        if (t === 'Хватит на сегодня') { S.ask = null; return this.say('Хорошо. Продолжим в другой раз.', this.menu()); }
        if (t === 'Пропустить') { S.skipped[f.k] = 1; return this.askNext(); }
        const r = await call('PUT', '/api/anketa', { [f.k]: t }); if (!r) return this.paint(); setMe(r.me); refreshHud();
        if (r.opened.length) { S.chat.push({ who: 'sys', text: 'Открыто: ' + r.opened.map(k => UNLOCK[k]).join(', ') }); levelUp(r.opened); }
        const react = t === 'Пока нет' ? 'Хорошо, вернёмся к этому позже. ' : { alias: `Записал: ${t}. `, music: 'Учту, когда будем выбирать пластинку. ', media: 'Добавлю исполнителей в вашу карточку. ', mood: 'Из этих слов соберу обложку. ' }[f.k] || ['Записал. ', 'Понял. ', 'Хорошо. '][S.chat.length % 3];
        return this.askNext(react); }
      const NAVCHIP = { 'Открыть афишу': 'afisha', 'Открыть картотеку': 'members', 'Открыть кабинет': 'cabinet', 'Открыть голосования': 'votes', 'Открыть проекты': 'projects' };
      if (NAVCHIP[t]) { S.chat.push({ who: 'bot', text: 'Проходите. Если понадоблюсь — кнопка «Бармен» внизу справа.' }); S.chips = this.menu(); S.line = { text: '', n: 0 }; return go(NAVCHIP[t]); }
      if (/анкет|начн|продолж/.test(low)) return this.askNext();
      if (/правил/.test(low)) { const n = S.rulesAt || 0; S.rulesAt = (n + 3) % S.cfg.rules.length; return this.say(S.cfg.rules.slice(n, n + 3).map(r => '— ' + r).join('\n'), ['Ещё правила', ...this.menu()]); }
      if (/сегодня|афиш|вечер/.test(low)) { const ev = (await call('GET', '/api/events') || [])[0]; if (!ev) return this.say('Сегодня вечера нет. Афиша на месяц открыта.', this.menu());
        return this.say(`Ближайший вечер — ${dt(ev.start).full}, «${ev.title}».\nСвободно мест: ${ev.free}.`, ['Открыть афишу', ...this.menu()]); }
      if (/познаком|с кем/.test(low)) { if (!S.me.unlock.members) return this.say(`Знакомлю с теми, кто в картотеке. Она откроется на 60% анкеты, у вас — ${S.me.progress}%.`, this.menu());
        const all = ((await call('GET', '/api/members')) || { list: [] }).list.filter(m => m.link !== 'mutual'); if (!all.length) return this.say('Вы уже знакомы со всеми в картотеке.', this.menu());
        const pick = all[(S.introAt = ((S.introAt ?? -1) + 1) % all.length)], a = pick.anketa;
        const why = pick.common[0] ? pick.common[0] + '.' : a.meet ? `Хочет встретить: ${a.meet.toLowerCase()}.` : 'Общего в анкетах пока мало.';
        S.who = pick.id; S.mopen = true;
        return this.say(`Познакомьтесь: ${a.alias}${a.work ? ', ' + a.work.toLowerCase() : ''}.\n${why}${a.project && a.project !== 'Пока нет' ? `\nСейчас занят: ${a.project}.` : ''}`, ['Открыть картотеку', 'С кем ещё?', ...this.menu().slice(-2)]); }
      if (/совет|посовет/.test(low)) { const me = S.me;
        if (!me.nfc) return this.say('Привяжите карту в кабинете — на входе её будет достаточно приложить.', ['Открыть кабинет', ...this.menu()]);
        if (me.votes_left && me.unlock.vote) { const v = await call('GET', '/api/votes'), top = v && v.proposals.find(p => p.kind === 'film'); return this.say(`У вас голосов: ${me.votes_left}.${top ? ` Среди фильмов сейчас первым идёт «${top.title}».` : ''}`, ['Открыть голосования', ...this.menu()]); }
        if (me.invites_left) return this.say(`У вас ${me.invites_left} ${plural(me.invites_left, 'пригласительный', 'пригласительных', 'пригласительных')}. Гость проходит бесплатно, за нового гостя — дополнительный голос.`, ['Открыть кабинет', ...this.menu()]);
        if (me.balance < 1000) return this.say(`На счёте ${me.balance} кредитов. Пакет визитов выгоднее разовых входов.`, ['Открыть кабинет', ...this.menu()]);
        return this.say('В проектах ищут людей. За помощь клуб начисляет кредиты.', ['Открыть проекты', ...this.menu()]); }
      if (/кабинет|счёт|счет|баланс|приглаш/.test(low)) return go('cabinet');
      if (/голос/.test(low)) return go('votes');
      if (/проект/.test(low)) return go('projects');
      this.say('С этим не помогу. Спросите про вечер, правила или людей.', this.menu()); },
  };
  function refreshHud() { const p = S.me.progress, on = Math.round(p / 5);
    $$('.hud').forEach(h => { h.querySelector('.between').innerHTML = `<span>Уровень: <b>${level(p)}</b></span><span>Анкета ${p}%</span>`; const xp = h.querySelector('.xp'); xp.setAttribute('aria-valuenow', p); [...xp.children].forEach((c, i) => c.classList.toggle('on', i < on)); });
    $$('.trophy').forEach((t, i) => { const k = ['book', 'members', 'propose', 'cover'][i], n = [30, 60, 100, 100][i]; t.classList.toggle('on', !!S.me.unlock[k]); t.querySelector('b').textContent = S.me.unlock[k] ? 'Открыто' : `Анкета ${n}%`; }); }

  // ---------------------------------------------------------------- афиша резидента
  async function afisha() {
    const me = S.me;
    if (!me.resident) return home();
    const evs = await api('GET', '/api/events');
    const lead = `Резиденты бронируют за ${me.window} дней. ${me.entries_left ? `В пакете ${days(me.entries_left)}.` : `Вход — ${cr(S.cfg.entry.resident)}.`} При отмене больше чем за сутки оплата возвращается.`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('cinema', 'Афиша', lead)}${calendar(evs)}</div></section>`;
  }

  // ---------------------------------------------------------------- голосования
  // Голосования — за встречи. Пластинки, фильмы и книги для вечеров выбирают в медиатеке.
  async function votes() { return ideasVotes(); }

  // Встречи на голосовании: «за» или «против», голоса месяца не тратятся. Команда ставит в расписание то, что поддержали.
  const VOTE_TABS = [['ideas', 'Встречи'], ['listen', 'Слушаем'], ['film', 'Смотрим'], ['buy', 'Покупаем']];
  const ideaCard = (i, canVote, compact) => { const n = i.yes + i.no, pc = n ? Math.round(100 * i.yes / n) : 0, u = i.vote_until ? dt(i.vote_until) : null;
    return `<article class="idea"><div class="between"><span class="t-cap t-2">${esc(i.kind_name)} · ${IDEA_SLOT[i.slot]}${i.series > 1 ? ` · ${i.series} встреч` : ''}</span>${u ? `<span class="t-cap t-2">до ${u.d} ${u.mon}</span>` : ''}</div>
      <p class="t-card">${esc(i.title)}</p><p class="t-small">Ведёт: ${esc(i.host || i.name)}${i.when ? ` · ${esc(i.when)}` : ''}</p>${!compact && i.about ? `<p class="t-small t-2">${esc(i.about)}</p>` : ''}
      <div class="yn" aria-label="За ${i.yes}, против ${i.no}"><span class="yn-bar"><i style="width:${pc}%"></i></span><span class="t-small">за ${i.yes} · против ${i.no}</span></div>
      <div class="actions">${canVote ? `<button class="btn small${i.my_vote > 0 ? ' primary' : ''}" data-act="ivote" data-id="${i.id}" data-v="1" aria-pressed="${i.my_vote > 0}">За</button><button class="btn small${i.my_vote < 0 ? ' primary' : ''}" data-act="ivote" data-id="${i.id}" data-v="-1" aria-pressed="${i.my_vote < 0}">Против</button>`
        : locked('Голосовать', 'голосуют резиденты')}</div></article>`; };
  async function ideasVotes() {
    const d = await api('GET', '/api/ideas');
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('vinyl', 'Голосования', 'Что будет в программе, решают резиденты. Встречи предлагает любой гость, вы говорите «за» или «против».')}
      <div class="lib-link"><p>Пластинки, фильмы и книги для вечеров выбирают в медиатеке. Там же — что купить в коллекцию.</p><button class="btn small" data-act="nav" data-to="library">Медиатека</button></div>
      <p class="lead">Голоса месяца здесь не тратятся. Голосование длится неделю, потом команда ставит поддержанные встречи в расписание. Бронь места на встречу — тоже голос: рублём.</p>
      <div class="ideas">${d.voting.map(i => ideaCard(i, d.can_vote)).join('') || '<p class="empty">Сейчас на голосовании ничего нет.</p>'}</div>
      <div class="actions" style="margin-top:var(--s5)"><button class="btn primary" data-act="nav" data-to="host">Предложить встречу</button></div></div></section>`;
  }

  // ---------------------------------------------------------------- медиатека: пластинки, фильмы, книги
  // Каждая полка привязана к вечеру своего формата: пластинки — к средам, фильмы — ко вторникам, книги — к понедельникам.
  // Обложки клубные, нарисованы из названия: чужие обложки и постеры не используем.
  const LIB = { vinyl: { tab: 'Музыка', one: 'пластинку', what: 'Пластинки', by: 'Исполнитель', name: 'Альбом', verb: 'звучит целиком', buy: 'Купить пластинку', evening: 'Альбом целиком' },
    film: { tab: 'Кино', one: 'фильм', what: 'Фильмы', by: 'Режиссёр', name: 'Фильм', verb: 'идёт у камина', buy: 'Добавить фильм', evening: 'Кино у камина' },
    book: { tab: 'Книги', one: 'книгу', what: 'Книги', by: 'Автор', name: 'Книга', verb: 'обсуждаем в книжном клубе', buy: 'Купить книгу', evening: 'Книжный клуб' } };
  const LPAL = [['#141210', '#C9A15A', '#AC5938', '#F1EAE3'], ['#0E2B2B', '#C9A15A', '#F1EAE3', '#F1EAE3'], ['#AC5938', '#F1EAE3', '#141210', '#F1EAE3'], ['#F1EAE3', '#141210', '#AC5938', '#141210'],
    ['#4B3A2A', '#D2B888', '#F1EAE3', '#F1EAE3'], ['#E6DCCF', '#0E2B2B', '#A28557', '#141210']];
  const hashOf = t => { let h = 2166136261; for (const ch of t) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const libArt = it => { const h = hashOf(it.by + it.title), [a, b, c, t] = LPAL[h % LPAL.length], m = (h >>> 4) % 6;
    const top = { vinyl: 'Клуб Коко · винил', film: 'Кино у камина', book: 'Библиотека клуба' }[it.kind];
    return `<span class="la la-${it.kind} m${m}" style="--a:${a};--b:${b};--c:${c};--t:${t}" aria-hidden="true"><i class="la-motif"></i><span class="la-top">${top}</span>
      <span class="la-txt"><b>${esc(it.title)}</b><small>${esc(it.by)}${it.year ? ` · ${it.year}` : ''}</small></span></span>`; };
  async function library() {
    const me = S.me, res = !!(me && me.resident), d = await api('GET', '/api/library'), kind = S.libKind || 'vinyl', L = LIB[kind];
    const items = d.items.filter(i => i.kind === kind), evs = d.evenings.filter(e => e.kind === kind), byId = Object.fromEntries(d.items.map(i => [i.id, i]));
    if (!S.libEv || !evs.some(e => e.id === S.libEv && e.open)) S.libEv = (evs.find(e => e.open) || {}).id;
    const sel = evs.find(e => e.id === S.libEv), q = (S.libQ || '').toLowerCase().trim();
    const tabs = `<div class="tabs" role="tablist" aria-label="Полки медиатеки">${Object.entries(LIB).map(([k, x]) => `<button class="tab" role="tab" aria-selected="${k === kind}" data-act="ltab" data-k="${k}">${x.tab} · ${d.items.filter(i => i.kind === k).length}</button>`).join('')}</div>`;
    // вечера: дата, что лидирует, ваш выбор, кнопка «выбрать к этому вечеру»
    const ballot = e => { const x = dt(e.start), top = Object.entries(e.counts).sort((a, b) => b[1] - a[1]).slice(0, 3), max = top.length ? top[0][1] : 1, on = e.id === S.libEv;
      return `<article class="ballot${on ? ' on' : ''}${e.open ? '' : ' closed'}">
        <header class="bl-h"><p class="bl-date"><b>${x.d}</b><span>${x.mon}<br>${x.wd}, ${x.t}</span></p><p class="bl-st">${e.open ? `<i></i>Голосуем до ${dt(new Date(new Date(e.start) - (S.cfg.pick_close_hours || 48) * 36e5).toISOString().slice(0, 16)).d} ${x.mon}` : 'Выбор сделан'}</p></header>
        <h3 class="bl-title">${L.evening}</h3>
        <ol class="bl-top">${top.map(([id, n]) => { const it = byId[id] || { title: '—', by: '' }; return `<li class="${e.mine === id ? 'mine' : ''}"><span class="bl-n"><b>${esc(it.title)}</b><small>${esc(it.by)}${e.mine === id ? ' · ваш выбор' : ''}</small></span><span class="bl-c">${n}</span><i style="--w:${Math.round(100 * n / max)}%"></i></li>`; }).join('') || '<li class="empty">Голосов пока нет — будьте первым.</li>'}</ol>
        ${e.open ? `<button class="btn small${on ? ' primary' : ''}" data-act="lev" data-id="${e.id}" aria-pressed="${on}">${on ? `Выбираем ${L.one} к этому вечеру` : `Выбрать ${L.one}`}</button>` : `<button class="link" data-act="openev" data-id="${e.id}">Открыть в афише</button>`}</article>`; };
    // полка: обложка, название, кто, год, сколько голосов к выбранному вечеру и кнопка голоса
    const genres = [...new Set(items.map(i => i.genre).filter(Boolean))], g = S.libG && genres.includes(S.libG) ? S.libG : '';
    const shown = items.filter(i => (!g || i.genre === g) && (!q || `${i.title} ${i.by} ${i.genre}`.toLowerCase().includes(q)));
    const card = it => { const n = sel ? sel.counts[it.id] || 0 : 0, mine = sel && sel.mine === it.id;
      const btn = !sel ? '' : !res ? locked('Голосовать', 'голосуют резиденты') : !d.can_pick ? `<span class="t-small t-2">Голосование откроется на 30% анкеты</span>`
        : mine ? `<span class="status ok">Ваш выбор на ${dt(sel.start).d} ${dt(sel.start).mon}</span>` : `<button class="btn small" data-act="lpick" data-ev="${sel.id}" data-id="${it.id}">${sel.mine ? 'Выбрать это' : 'Голос'} · ${dt(sel.start).d} ${dt(sel.start).mon.slice(0, 3)}</button>`;
      return `<article class="li-card${mine ? ' mine' : ''}${it.fresh ? ' fresh' : ''}" id="li-${it.id}"><div class="li-art${it.kind === 'vinyl' ? ' sleeve' : ''}">${it.kind === 'vinyl' ? '<i class="disc" aria-hidden="true"></i>' : ''}${libArt(it)}${n ? `<span class="li-n" title="Голосов к вечеру">${n}</span>` : ''}</div>
        <div class="li-txt"><h3>${esc(it.title)}</h3><p class="li-by">${esc(it.by)}${it.year ? ` · ${it.year}` : ''}</p>${it.note ? `<p class="li-note">${esc(it.note)}</p>` : ''}</div><div class="li-act">${btn}</div></article>`; };
    // купить в коллекцию: полоска до цели, кто хочет, «тоже хочу»
    const ws = d.wishes.filter(w => w.kind === kind), open = ws.filter(w => w.status === 'open'), done = ws.filter(w => w.status === 'bought');
    const wish = w => `<li class="wish"><div class="w-main"><p class="w-title"><b>${esc(w.title)}</b>${w.by ? `<small>${esc(w.by)}</small>` : ''}</p>
        <div class="w-bar" role="meter" aria-valuemin="0" aria-valuemax="${d.goal}" aria-valuenow="${w.wants}" aria-label="Хотят ${w.wants} из ${d.goal}"><i style="--w:${Math.min(100, Math.round(100 * w.wants / d.goal))}%"></i></div>
        <p class="w-meta">${w.wants} из ${d.goal} · автор — ${esc(w.by_name)}${w.names.length ? ` · хотят: ${w.names.map(esc).join(', ')}` : ''}</p></div>
      <div class="w-act">${res ? `<button class="btn small${w.mine ? ' primary' : ''}" data-act="lwant" data-id="${w.id}" aria-pressed="${w.mine}" ${d.can_pick ? '' : 'disabled'}>${w.mine ? 'Вы хотите' : 'Тоже хочу'}</button>` : locked('Тоже хочу', '')}${d.admin ? `<button class="btn small" data-act="lbought" data-id="${w.id}">Купили</button>` : ''}</div></li>`;
    const form = !res ? '' : d.can_wish ? `<form class="form wish-form" data-form="lwish"><input type="hidden" name="kind" value="${kind}"><label class="field"><span>${L.by}</span><input name="by" maxlength="80" autocomplete="off"></label>
        <label class="field"><span>${L.name}</span><input name="title" required maxlength="120" autocomplete="off"></label><div class="actions"><button class="btn primary">Предложить</button></div></form>`
      : `<p class="t-small t-2">Предлагать новое можно, когда анкета заполнена полностью. Сейчас — ${me.progress}%.</p>`;
    const lead = res ? `У вас ${d.left} ${plural(d.left, 'голос', 'голоса', 'голосов')} в этом месяце. Первый голос за вечер тратит один голос, передумать можно бесплатно.`
      : 'Коллекция клуба. Что звучит, идёт на экране и обсуждается, выбирают резиденты.';
    return `<section class="band lib-page"><div class="wrap"><header class="feed-head"><h1 class="t-page">Медиатека</h1><p class="lead" data-lib-lead>${lead}</p></header>${tabs}
      <section class="lib-sec"><h2 class="cap-title">Ближайшие вечера · ${L.what.toLowerCase()} ${L.verb}</h2><div class="ballots">${evs.slice(0, 3).map(ballot).join('') || '<p class="empty">Ближайших вечеров этого формата пока нет.</p>'}</div></section>
      <section class="lib-sec" id="shelf"><div class="lib-bar"><h2 class="cap-title">${L.what} в коллекции · ${items.length}</h2>
        <form class="lib-search" data-form="lsearch" role="search"><input name="q" value="${esc(S.libQ || '')}" placeholder="Название, ${L.by.toLowerCase()}, жанр" aria-label="Поиск по полке" autocomplete="off"></form></div>
        <div class="chips" role="group" aria-label="Жанр"><button class="chip${g ? '' : ' on'}" data-act="lgenre" data-k="" aria-pressed="${!g}">Все</button>${genres.map(x => `<button class="chip${g === x ? ' on' : ''}" data-act="lgenre" data-k="${esc(x)}" aria-pressed="${g === x}">${esc(x)}</button>`).join('')}</div>
        ${sel ? `<p class="lib-sel">Голосуете за вечер <b>${dt(sel.start).wd}, ${dt(sel.start).d} ${dt(sel.start).mon}</b>${sel.mine ? ` · ваш выбор: «${esc((byId[sel.mine] || {}).title || '')}»` : ''}</p>` : ''}
        <div class="li-grid li-${kind}">${shown.map(card).join('') || '<p class="empty">Ничего не нашли.</p>'}</div></section>
      <section class="lib-sec" id="wishes"><h2 class="cap-title">${L.buy} в коллекцию</h2><p class="lead" style="margin-bottom:var(--s4)">Предложите, остальные нажимают «Тоже хочу». Когда наберётся ${d.goal}, клуб покупает и зовёт всех на первый вечер.</p>
        <ul class="wishes">${open.map(wish).join('') || '<li class="empty">Пока никто ничего не предложил.</li>'}</ul>
        ${done.length ? `<p class="t-small t-2" style="margin-top:var(--s3)">Уже купили: ${done.map(w => `«${esc(w.title)}»`).join(', ')}.</p>` : ''}${form}</section></div></section>`;
  }

  // ---------------------------------------------------------------- картотека: карта связей
  function drawCover(c, a) {
    const x = c.getContext('2d'), W = c.width; let h = 2166136261; for (const ch of (a.alias || '') + (a.mood || '') + (a.music || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const pals = [['#161411', '#c9a15a', '#c8582f'], ['#14291f', '#c9a15a', '#f1eadd'], ['#c8582f', '#f1eadd', '#161411'], ['#f1eadd', '#161411', '#c8582f'], ['#24211c', '#c9a15a', '#f1eadd']], pal = pals[Math.floor(rnd() * pals.length)];
    x.fillStyle = pal[0]; x.fillRect(0, 0, W, W); const cx = W / 2, cy = W * (.4 + rnd() * .12), n = 10 + Math.floor(rnd() * 14), kind = Math.floor(rnd() * 4);
    // четыре рисунка обложки, как у клубных афиш: лучи, восходящее солнце, арка, кольца пластинки
    if (kind === 0) {
      for (let i = 0; i < n; i++) { const an = Math.PI * 2 * i / n; x.strokeStyle = i % 2 ? pal[1] : pal[2]; x.lineWidth = 1.5 + rnd() * 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(an) * W, cy + Math.sin(an) * W); x.stroke(); }
      for (let r = W * .4; r > 16; r -= 12 + rnd() * 20) { x.strokeStyle = pal[1]; x.lineWidth = 1.3; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
      x.fillStyle = pal[0]; x.beginPath(); x.arc(cx, cy, W * .15, 0, 7); x.fill(); x.fillStyle = pal[2]; x.beginPath(); x.arc(cx, cy, W * .055, 0, 7); x.fill();
    } else if (kind === 1) {
      const hy = W * .66; for (let i = 0; i <= n; i++) { const an = Math.PI + Math.PI * i / n; x.strokeStyle = pal[1]; x.globalAlpha = .55; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx, hy); x.lineTo(cx + Math.cos(an) * W, hy + Math.sin(an) * W); x.stroke(); }
      x.globalAlpha = 1; x.fillStyle = pal[2]; x.beginPath(); x.arc(cx, hy, W * (.22 + rnd() * .08), Math.PI, 0); x.fill(); x.fillStyle = pal[1]; x.fillRect(W * .08, hy, W * .84, 2);
      for (let i = 1; i < 4; i++) { x.fillRect(W * (.2 + i * .05), hy + i * 10, W * (.6 - i * .1), 1.5); }
    } else if (kind === 2) {
      const aw = W * (.36 + rnd() * .1), top = W * .16; x.strokeStyle = pal[1]; x.lineWidth = 1.4;
      for (let k = 0; k < 4; k++) { const w2 = aw + k * 22; x.beginPath(); x.moveTo(cx - w2 / 2, W * .78); x.lineTo(cx - w2 / 2, top + w2 / 2 + 40 - k * 11); x.arc(cx, top + w2 / 2 + 40 - k * 11, w2 / 2, Math.PI, 0); x.lineTo(cx + w2 / 2, W * .78); x.stroke(); }
      x.fillStyle = pal[2]; x.beginPath(); x.moveTo(cx - aw / 2 + 12, W * .78); x.arc(cx, top + aw / 2 + 40, aw / 2 - 12, Math.PI, 0); x.lineTo(cx + aw / 2 - 12, W * .78); x.fill();
      x.fillStyle = pal[1]; x.beginPath(); x.arc(cx, top + aw / 2 + 30, W * .03, 0, 7); x.fill();
    } else {
      for (let r = W * .46; r > W * .1; r -= 5 + rnd() * 4) { x.strokeStyle = pal[1]; x.globalAlpha = .35 + rnd() * .4; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
      x.globalAlpha = 1; x.fillStyle = pal[2]; x.beginPath(); x.arc(cx, cy, W * .14, 0, 7); x.fill(); x.fillStyle = pal[0]; x.beginPath(); x.arc(cx, cy, W * .015, 0, 7); x.fill();
      x.strokeStyle = pal[1]; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, W * .3, -1.1, -.3); x.stroke();
    }
    x.fillStyle = pal[0]; x.fillRect(0, W * .78, W, W * .22); x.fillStyle = pal[1]; x.fillRect(0, W * .78, W, 2);
    const light = pal[0] === '#f1eadd'; x.fillStyle = light ? '#161411' : '#f4e9d0'; x.textAlign = 'center'; x.font = `300 ${W * .075}px "Koko Sans","Jost",sans-serif`; try { x.letterSpacing = `${W * .02}px`; } catch (e) {}
    x.fillText((a.alias || '').toUpperCase().slice(0, 16), cx + W * .01, W * .875);
    x.fillStyle = light ? '#8f4428' : pal[1]; x.font = `400 ${W * .034}px "Koko Sans","Jost",sans-serif`; try { x.letterSpacing = `${W * .006}px`; } catch (e) {} x.fillText((a.mood || a.work || '').toUpperCase().slice(0, 30), cx, W * .94);
    x.strokeStyle = pal[1]; x.lineWidth = 4; x.strokeRect(7, 7, W - 14, W - 14);
  }
  const paintCovers = () => { const go2 = () => $$('canvas[data-cover]').forEach(c => drawCover(c, JSON.parse(c.dataset.cover))); go2(); document.fonts && document.fonts.ready.then(go2); };
  const cover = a => `<canvas class="cover" width="360" height="360" data-cover="${esc(JSON.stringify({ alias: a.alias, mood: a.mood, music: a.music, work: a.work }))}" role="img" aria-label="Обложка: ${esc(a.alias)}"></canvas>`;
  // ---------------------------------------------------------------- оценки заказов, совет меню, команда
  // Звёзды по блоку Star Rate (21st.dev, ham7a311): пять звёзд, выбранные «подпрыгивают», под ними — что оценка значит.
  const STAR_T = ['Не оценено', 'Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];
  const STAR = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.3 6.3L12 17l-5.8 3.2 1.3-6.3L2.8 9.5l6.4-.8z"/></svg>';
  const starsIn = (name, label, val) => `<fieldset class="stars" data-stars><legend>${label}</legend><div class="st-row">${[1, 2, 3, 4, 5].map(n =>
    `<input type="radio" class="sr" id="st-${name}-${n}" name="${name}" value="${n}" ${val === n ? 'checked' : ''}><label for="st-${name}-${n}" title="${STAR_T[n]}"><span class="sr">${n} из 5 — ${STAR_T[n]}</span>${STAR}</label>`).join('')}</div><span class="st-t" data-stt>${STAR_T[val || 0]}</span></fieldset>`;
  const starsOut = v => `<span class="st-out" role="img" aria-label="${v} из 5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= Math.round(v) ? 'on' : ''}"></i>`).join('')}</span>`;
  document.addEventListener('change', e => { const f = e.target.closest && e.target.closest('[data-stars]'); if (f && e.target.type === 'radio') $('[data-stt]', f).textContent = STAR_T[+e.target.value]; });
  const rateStrip = () => S.me && S.me.to_rate ? `<div class="rate-strip"><p><b>Оцените заказ.</b> Пять звёзд блюдам и напиткам — так команда узнаёт, что оставить в меню, а что менять.</p><button class="btn small primary" data-act="rate">Оценить</button></div>` : '';
  async function rateModal(oid) { const d = await call('GET', '/api/orders/mine'); if (!d) return; const o = oid ? d.orders.find(x => x.id === oid) : d.orders.find(x => !x.done);
    if (!o) return toast('Все заказы оценены. Спасибо.');
    modal(`<h2 class="t-card">Оцените заказ</h2><p class="t-small t-2">${when(o.ts)} · оценки видит только команда клуба</p>
      <form class="rate-form" data-form="rate" data-id="${o.id}">${o.items.map((it, i) => `<div class="rate-row">${starsIn(`s${i}`, esc(it.name), it.stars)}<input type="hidden" name="n${i}" value="${esc(it.name)}">
          <input name="t${i}" maxlength="300" value="${esc(it.text)}" placeholder="Что понравилось или нет — по желанию" aria-label="Комментарий: ${esc(it.name)}"></div>`).join('')}
        <div class="rate-row svc">${starsIn('service', 'Как вас обслужили', o.service || 0)}</div>
        <div class="actions"><button class="btn primary">Отправить оценку</button><button type="button" class="btn" data-act="rateskip" data-id="${o.id}">Не оценивать</button></div></form>`); }
  const myOrdersHTML = orders => `<div class="card"><p class="t-card">Заказы и оценки</p>${orders.length ? `<ul class="my-orders">${orders.slice(0, 5).map(o => `<li><div><b>${when(o.ts)}</b><span>${o.items.map(i => `${esc(i.name)}${i.stars ? ` ${starsOut(i.stars)}` : ''}`).join(' · ')}</span></div>
      ${o.done ? `<span class="status ok">${o.skipped ? 'без оценки' : 'оценён'}</span>` : `<button class="btn small primary" data-act="rate" data-id="${o.id}">Оценить</button>`}</li>`).join('')}</ul>` : '<p class="t-small t-2">Когда вы закажете что-нибудь в клубе, бармен запишет заказ на вас — и его можно будет оценить здесь.</p>'}
    <p class="t-small t-2" style="margin-top:var(--s3)">Оценки видит только команда. По ним клуб решает, что оставить в меню.</p></div>`;
  // Заказ гостя: бармен отмечает позиции меню и записывает их на гостя.
  const orderFormHTML = users => { const m = S.cfg.menu;
    return `<div class="card order-card"><p class="t-card">Заказ гостя</p><p class="t-small t-2">Отметьте, что заказали. После визита гость поставит этим позициям оценки.</p>
      <form class="form wide" data-form="barorder"><label class="field"><span>Гость</span><select name="user" required><option value="">Выберите</option>${users.map(u => `<option value="${u.id}">${esc(u.name)}${u.resident ? '' : ' — гость'}</option>`).join('')}</select></label>
        <label class="field"><span>Найти в меню</span><input data-menuq placeholder="капучино, панини, эклер" autocomplete="off"></label>
        <div class="menu-pick" role="group" aria-label="Позиции меню">${m.sides.flatMap(sd => sd.sections).map(sec => `<div class="mp-sec"><p>${esc(sec.name)}</p><div>${sec.items.map(it => `<label class="mp"><input type="checkbox" name="items" value="${esc(it[0])}"><span>${esc(it[0])}</span></label>`).join('')}</div></div>`).join('')}</div>
        <div class="actions"><button class="btn primary">Записать заказ</button></div></form></div>`; };
  document.addEventListener('input', e => { const q = e.target.closest && e.target.closest('[data-menuq]'); if (!q) return; const v = q.value.toLowerCase().trim(), box = q.closest('form');
    $$('.mp', box).forEach(l => { l.hidden = !!v && !l.textContent.toLowerCase().includes(v) && !l.querySelector('input').checked; }); $$('.mp-sec', box).forEach(x => { x.hidden = !$$('.mp', x).some(l => !l.hidden); }); });
  // Сводка оценок — по блоку Rating With Review Summary (21st.dev, sean0205): средняя, число оценок, разбивка по звёздам.
  const rtCls = v => v == null ? '' : v < 3.8 ? ' low' : v >= 4.5 ? ' high' : '';
  const distBar = dist => { const n = dist.reduce((a, x) => a + x, 0) || 1; return `<span class="dist" aria-hidden="true">${dist.map((x, i) => x ? `<i class="d${i + 1}" style="flex:${x}" title="${i + 1}★: ${x}"></i>` : '').join('')}</span>`; };
  function ratingsHTML(r, admin) {
    const rated = r.items.filter(i => i.n >= r.min), all = r.items.filter(i => i.n), tot = all.reduce((a, i) => a + i.n, 0), avg = tot ? Math.round(10 * all.reduce((a, i) => a + i.avg * i.n, 0) / tot) / 10 : null;
    const low = rated.filter(i => i.avg < 3.8).sort((a, b) => a.avg - b.avg), top = rated.filter(i => i.avg >= 4.6).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 6), none = r.items.filter(i => !i.n).length;
    const sdist = r.service.dist, sn = r.service.n || 1;
    const row = (i, withBtn) => `<li class="rt-row"><div class="rt-main"><p><b>${esc(i.name)}</b><small>${esc(i.section)} · ${plural(i.n, 'оценка', 'оценки', 'оценок').replace(/^/, i.n + ' ')}</small></p>${distBar(i.dist)}
        ${i.comments[0] ? `<blockquote>${esc(i.comments[0].text)}</blockquote>` : ''}</div><div class="rt-side"><span class="rt${rtCls(i.avg)}">${i.avg.toFixed(1)}</span>
        ${withBtn && admin ? (i.council ? '<span class="status">на совете</span>' : `<button class="btn small" data-act="tocouncil" data-item="${esc(i.name)}">На совет</button>`) : ''}</div></li>`;
    const secs = [...new Set(r.items.map(i => i.section))];
    return `<div class="tiles"><div class="tile"><b class="rt${rtCls(avg)}">${avg == null ? '—' : avg.toFixed(1)}</b><span>средняя по меню</span></div><div class="tile"><b>${tot}</b><span>${plural(tot, 'оценка', 'оценки', 'оценок')}</span></div>
        <div class="tile"><b class="rt${rtCls(r.service.avg)}">${r.service.avg == null ? '—' : r.service.avg.toFixed(1)}</b><span>обслуживание · ${r.service.n}</span></div><div class="tile"><b>${low.length}</b><span>${plural(low.length, 'позиция проседает', 'позиции проседают', 'позиций проседают')}</span></div></div>
      <div class="grid g2" style="align-items:start;margin-top:var(--s5)"><div class="card"><p class="t-card">Проседают</p><p class="t-small t-2">Средняя ниже 3,8 при ${r.min} и более оценках. ${admin ? 'Вынесите на совет меню — резиденты решат: оставить, доработать или убрать.' : ''}</p>
          <ul class="rt-list">${low.map(i => row(i, true)).join('') || '<li class="t-small t-2">Таких позиций нет.</li>'}</ul></div>
        <div class="card"><p class="t-card">Любят</p><p class="t-small t-2">Средняя 4,6 и выше.</p><ul class="rt-list">${top.map(i => row(i)).join('') || '<li class="t-small t-2">Пока мало оценок.</li>'}</ul>
          <p class="t-card" style="margin-top:var(--s5)">Обслуживание</p><ul class="sv-dist">${[5, 4, 3, 2, 1].map(k => `<li><span>${k}</span><i><b style="--w:${Math.round(100 * sdist[k - 1] / sn)}%"></b></i><span>${sdist[k - 1]}</span></li>`).join('')}</ul>
          <p class="t-small t-2">Пять звёзд за обслуживание — зелёная карточка тому, кто вёл заказ.</p></div></div>
      <details class="fold" style="margin-top:var(--s5)"><summary class="t-card">Всё меню по разделам${none ? ` · без оценок: ${none}` : ''}</summary>
        ${secs.map(sn2 => `<p class="rt-sec">${esc(sn2)}</p><div class="tw"><table class="rt-table"><tbody>${r.items.filter(i => i.section === sn2).sort((a, b) => (a.avg == null) - (b.avg == null) || a.avg - b.avg).map(i =>
          `<tr><td>${esc(i.name)}</td><td class="n"><span class="rt${rtCls(i.n >= r.min ? i.avg : null)}">${i.avg == null ? '—' : i.avg.toFixed(1)}</span></td><td class="n">${i.n || ''}</td><td>${i.n ? distBar(i.dist) : '<span class="t-2">нет оценок</span>'}</td></tr>`).join('')}</tbody></table></div>`).join('')}</details>
      <div class="card" style="margin-top:var(--s5)"><p class="t-card">Последние заказы</p><div class="tw"><table><thead><tr><th>Когда</th><th>Гость</th><th>Заказ</th><th>Вёл</th><th>Оценка</th></tr></thead><tbody>
        ${r.orders.map(o => `<tr><td class="n">${when(o.ts)}</td><td>${esc(o.name)}</td><td>${o.items.map(i => `${esc(i.name)}${i.stars ? ` <b>${i.stars}★</b>` : ''}`).join(', ')}</td><td>${esc(o.by || '—')}</td><td>${o.done ? (o.skipped ? 'без оценки' : `оценён${o.service ? ` · обслуживание ${o.service}★` : ''}`) : 'ждёт оценки'}</td></tr>`).join('') || '<tr><td colspan="5" class="t-2">Заказов нет.</td></tr>'}</tbody></table></div></div>`;
  }
  // Совет меню — на странице меню: резиденты решают судьбу спорных позиций и предлагают новое. Оценок здесь не видно.
  const CCH = [['keep', 'Оставить'], ['fix', 'Доработать'], ['drop', 'Убрать']];
  function councilHTML(d) { const me = S.me, res = !!(me && me.resident);
    const q = c => { const voted = !!c.mine || c.status !== 'open' || !res, tot = c.total || 1;
      return `<li class="cn-item"><p class="cn-q">${c.status === 'open' ? 'Что делать с позицией' : 'Решили про позицию'} <b>«${esc(String(c.item).replace(/[«»]/g, ''))}»</b>${c.status === 'open' ? '?' : ''}</p>
        ${c.status === 'open' ? `<div class="cn-btns" role="group" aria-label="Ваш голос">${CCH.map(([k, t]) => res ? `<button class="btn small${c.mine === k ? ' primary' : ''}" data-act="cvote" data-id="${c.id}" data-k="${k}" aria-pressed="${c.mine === k}">${t}</button>` : '').join('')}${res ? '' : locked('Голосовать', 'голосуют резиденты')}</div>` : `<p class="cn-dec">${esc(c.decision)}</p>`}
        ${voted ? `<ul class="cn-res">${CCH.map(([k, t]) => `<li><span>${t}</span><i><b style="--w:${Math.round(100 * c.counts[k] / tot)}%"></b></i><span>${c.counts[k]}</span></li>`).join('')}</ul>` : '<p class="t-small t-2">Результат увидите после своего голоса.</p>'}
        ${d.admin && c.status === 'open' ? `<form class="cn-close" data-form="cclose" data-id="${c.id}"><input name="decision" placeholder="Решение: например, меняем рецепт с 1 декабря" aria-label="Решение по позиции" maxlength="200"><button class="btn small">Записать решение</button></form>` : ''}</li>`; };
    const w = x => `<li class="wish"><div class="w-main"><p class="w-title"><b>${esc(x.title)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}</p>${x.status === 'open' ? `<div class="w-bar" role="meter" aria-valuemin="0" aria-valuemax="${d.goal}" aria-valuenow="${x.wants}" aria-label="Хотят ${x.wants} из ${d.goal}"><i style="--w:${Math.min(100, Math.round(100 * x.wants / d.goal))}%"></i></div>` : ''}
        <p class="w-meta">${x.status === 'open' ? `${x.wants} из ${d.goal} · автор — ${esc(x.by_name)}` : 'уже в меню'}</p></div>
      <div class="w-act">${x.status !== 'open' ? '' : res ? `<button class="btn small${x.mine ? ' primary' : ''}" data-act="mwant" data-id="${x.id}" aria-pressed="${x.mine}">${x.mine ? 'Вы хотите' : 'Хочу попробовать'}</button>` : locked('Хочу попробовать', '')}${d.admin && x.status === 'open' ? `<button class="btn small" data-act="mwdone" data-id="${x.id}">Ввели в меню</button>` : ''}</div></li>`;
    return `${blockTitle('Совет меню', 'council')}<p class="lead" style="margin-bottom:var(--s5)">Меню клуба решают резиденты: что оставить, что доработать, чего не хватает. Команда выносит вопрос — вы голосуете.</p>
      <div class="grid g2" style="align-items:start"><div class="card"><p class="t-card">На совете</p><ul class="cn-list">${d.items.map(q).join('') || '<li class="t-small t-2">Сейчас вопросов нет.</li>'}</ul></div>
        <div class="card"><p class="t-card">Чего не хватает</p><p class="t-small t-2">Предложите блюдо или напиток. Наберётся ${d.goal} желающих — команда вводит его в меню.</p><ul class="wishes">${d.wishes.map(w).join('') || '<li class="t-small t-2">Предложений пока нет.</li>'}</ul>
          ${res ? `<form class="form" data-form="mwish" style="margin-top:var(--s4)"><label class="field"><span>Что добавить</span><input name="title" required maxlength="80" autocomplete="off"></label><label class="field"><span>Почему — пара слов</span><input name="note" maxlength="160" autocomplete="off"></label><div class="actions"><button class="btn primary small">Предложить</button></div></form>` : ''}</div></div>`; }
  // Команда: карточки сотрудников. Жёлтая — замечание, красная — серьёзное, зелёная — похвала, фиолетовая — деньги в фонд команды.
  const CARD_T = { yellow: 'Жёлтая', red: 'Красная', green: 'Зелёная', purple: 'Фиолетовая' };
  const pips = (n, max, color) => `<span class="pips ${color}" role="img" aria-label="${n} из ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  function teamHTML(t) { const C = t.cfg, f = t.fund, adm = t.admin;
    const person = x => { const full = x.yellows != null;
      return `<article class="tm-card${x.alert ? ' alert' : ''}${t.me === x.id ? ' mine' : ''}"><header><span class="av">${initials(x.name)}</span><div><b>${esc(x.name)}${t.me === x.id ? ' · вы' : ''}</b><small>${esc(x.post)}</small></div></header>
        ${full ? `<dl class="tm-pips"><div><dt>Жёлтые за ${C.yellow_days} дней</dt><dd>${pips(x.yellows, C.yellow_to_red, 'yellow')}</dd></div><div><dt>Красные за год</dt><dd>${pips(Math.min(x.reds, C.red_limit), C.red_limit, 'red')}</dd></div></dl>` : ''}
        <p class="tm-green"><i class="cd green"></i>${x.greens} ${plural(x.greens, 'зелёная', 'зелёные', 'зелёных')}${x.greens_month ? ` · в этом месяце ${x.greens_month}` : ''}</p>
        ${x.alert ? `<p class="tm-alert">Порог красных. Нужен разговор и письменное оформление взысканий — само по себе это не увольнение.</p>` : ''}
        ${x.premium != null ? `<p class="t-small t-2">Доля в командной премии: ${x.premium}%</p>` : ''}
        ${adm ? `<div class="tm-give" role="group" aria-label="Выдать карточку: ${esc(x.name)}">${['green', 'yellow', 'red'].map(c => `<button class="btn small cd-btn ${c}" data-act="givecard" data-staff="${x.id}" data-color="${c}" data-name="${esc(x.name)}">${CARD_T[c]}</button>`).join('')}</div>` : ''}</article>`; };
    const jr = c => { const d = dt(c.ts), dp = c.dispute;
      return `<li class="jr${c.void ? ' void' : ''}"><i class="cd ${c.color}" title="${CARD_T[c.color]}"></i><div class="jr-main"><p><b>${esc(c.staff_name)}</b> — ${esc(c.reason)}${c.rub ? ` · +${num(c.rub)} ₽ в фонд` : ''}</p>
          ${c.note ? `<p class="jr-note">${esc(c.note)}</p>` : ''}<p class="jr-meta">${d.d} ${d.mon} · ${esc(c.by_name)}${c.void ? ' · снята' : c.used ? (c.color === 'green' ? ' · вошла в фиолетовую' : ' · вошла в красную') : ''}</p>
          ${dp ? `<blockquote class="jr-dp ${dp.status}"><b>${dp.status === 'open' ? 'Не согласен' : dp.status === 'accepted' ? 'Возражение принято' : 'Возражение рассмотрено, карточка оставлена'}:</b> ${esc(dp.text)}</blockquote>` : ''}</div>
        <div class="jr-act">${adm && !c.void && !c.auto && c.color !== 'purple' ? `${dp && dp.status === 'open' ? `<button class="btn small" data-act="cardkeep" data-id="${c.id}">Оставить</button>` : ''}<button class="btn small" data-act="cardvoid" data-id="${c.id}">Снять</button>` : ''}
          ${!adm && c.mine && !dp && !c.void && (c.color === 'yellow' || c.color === 'red') ? `<button class="btn small" data-act="carddispute" data-id="${c.id}">Не согласен</button>` : ''}</div></li>`; };
    return `<div class="grid g2 tm-top" style="align-items:start"><div class="card tm-fund"><p class="t-card">Фонд команды</p><p class="tm-sum">${num(f.left)} <small>₽</small></p>
          <p class="t-small">До следующей фиолетовой: ${pips(f.greens % f.need, f.need, 'green')} <span class="t-2">${f.greens} из ${f.need} зелёных</span></p>
          <p class="t-small t-2">${f.need} зелёных карточек команды — одна фиолетовая: ${num(f.rub)} ₽ в фонд. В этом месяце: ${f.purples_month} из ${f.cap}.${f.spent ? ` Уже потратили ${num(f.spent)} ₽.` : ''}</p>
          <p class="md-cap" style="margin-top:var(--s4)">На что потратить</p><ul class="tm-ideas">${t.ideas.map(i => `<li><span>${esc(i.title)}<small>${esc(i.who_name)}</small></span>${t.me ? `<button class="btn small${i.mine ? ' primary' : ''}" data-act="fundvote" data-id="${i.id}" aria-pressed="${i.mine}">За · ${i.n}</button>` : `<b>${i.n}</b>`}</li>`).join('') || '<li class="t-small t-2">Идей пока нет.</li>'}</ul>
          <form class="inline-form" data-form="fundidea"><input name="title" required maxlength="120" placeholder="Своя идея для фонда" aria-label="Идея для фонда"><button class="btn small">Предложить</button></form>
          ${adm ? `<form class="inline-form" data-form="fundspend"><input name="title" required maxlength="120" placeholder="На что потратили" aria-label="На что потратили"><input name="rub" inputmode="numeric" required placeholder="₽" aria-label="Сумма" style="max-width:110px"><button class="btn small">Списать</button></form>` : ''}
          ${t.spends.length ? `<ul class="tm-spends">${t.spends.map(x => `<li>${dt(x.ts).d} ${dt(x.ts).mon}: ${esc(x.title)} — ${num(x.rub)} ₽</li>`).join('')}</ul>` : ''}</div>
        <div class="card"><p class="t-card">Как это работает</p><ul class="tm-rules"><li><i class="cd green"></i><span><b>Зелёная</b> — за то, что сделано хорошо. Видна всей команде. Пять звёзд от гостя за обслуживание дают её автоматически.</span></li>
          <li><i class="cd purple"></i><span><b>Фиолетовая</b> — ${C.green_to_purple} зелёных команды. Это ${num(C.purple_rub)} ₽ в общий фонд: обучение, инструмент, общий ужин.</span></li>
          <li><i class="cd yellow"></i><span><b>Жёлтая</b> — замечание за конкретный случай. Сгорает через ${C.yellow_days} дней. Видит только сам сотрудник и управляющий.</span></li>
          <li><i class="cd red"></i><span><b>Красная</b> — серьёзное нарушение или ${C.yellow_to_red} жёлтых за ${C.yellow_days} дней. ${C.red_limit} красных за год — разговор о расставании.</span></li></ul>
          <p class="t-small t-2">Карточки не уменьшают зарплату. С любой жёлтой или красной можно не согласиться — управляющий обязан ответить.</p></div></div>
      ${blockTitle('Команда')}<div class="tm-grid">${t.staff.map(person).join('')}</div>
      ${blockTitle(adm ? `Журнал карточек${t.disputes ? ` · возражений: ${t.disputes}` : ''}` : 'Ваши карточки и зелёные команды')}<ul class="jr-list">${t.journal.map(jr).join('') || '<li class="t-small t-2">Карточек пока нет.</li>'}</ul>
      ${adm ? `<details class="fold" style="margin-top:var(--s6)"><summary class="t-card">Настройки и новый сотрудник</summary>
        <form class="form wide" data-form="teamcfg" style="margin-top:var(--s4)">${[['yellow_to_red', 'Жёлтых до красной'], ['yellow_days', 'Жёлтая живёт, дней'], ['red_limit', 'Порог красных за год'], ['green_to_purple', 'Зелёных до фиолетовой'], ['purple_rub', 'Фиолетовая, ₽ в фонд'], ['purple_cap', 'Фиолетовых в месяц, не больше']].map(([k, l]) => `<label class="field"><span>${l}</span><input name="${k}" value="${C[k]}" inputmode="numeric"></label>`).join('')}
          <label class="check" style="grid-column:1/-1"><input type="checkbox" name="premium_link" ${C.premium_link ? 'checked' : ''}><span>Красная карточка уменьшает долю сотрудника в командной премии</span></label>
          <label class="field"><span>На сколько процентов за одну красную</span><input name="premium_cut" value="${C.premium_cut}" inputmode="numeric"></label>
          <p class="t-small t-2" style="grid-column:1/-1">Выключено по умолчанию. Включать только после того, как юрист согласует положение о премировании: штраф из зарплаты по Трудовому кодексу запрещён, а премию можно не начислить, если это прописано. Красная карточка сама не является взысканием — замечание и выговор оформляются приказом.</p>
          <div class="actions"><button class="btn primary">Сохранить настройки</button></div></form>
        <form class="inline-form" data-form="staffadd" style="margin-top:var(--s5)"><input name="name" required maxlength="40" placeholder="Имя нового сотрудника" aria-label="Имя"><input name="post" maxlength="40" placeholder="Должность" aria-label="Должность"><button class="btn small">Добавить</button></form></details>` : ''}`; }
  // Страница сотрудника «Смена»: заказ гостя, свои карточки и фонд, оценки меню.
  async function teamPage() { const [t, pe, r] = await Promise.all([api('GET', '/api/team'), api('GET', '/api/admin/people'), api('GET', '/api/admin/ratings')]), tab = S.teamTab || 'order';
    const TABS = [['order', 'Заказ гостя'], ['cards', 'Команда и карточки'], ['ratings', 'Оценки меню']];
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap"><h1 class="t-page">Смена</h1><p class="lead" style="margin:10px 0 var(--s5)">${esc(S.me.name)}, здесь заказы гостей, карточки команды и то, как гости оценивают меню.</p>
      <div class="tabs adm-tabs" role="tablist" aria-label="Разделы смены">${TABS.map(([k, x]) => `<button class="tab" role="tab" aria-selected="${k === tab}" data-act="ttab" data-k="${k}">${x}</button>`).join('')}</div>
      ${tab === 'order' ? orderFormHTML(pe.users) : tab === 'cards' ? teamHTML(t) : ratingsHTML(r, false)}</div></section>`; }

  // ---------------------------------------------------------------- картотека: полка конвертов резидентов
  // Каждый резидент — конверт пластинки: лицо — обложка из анкеты, внутри — что у вас общего, где встретиться, о чём поговорить.
  // Знакомство — с запиской и только по согласию: принял — открылась переписка. Не сайт знакомств и не чат для всех.
  const SPHERES = [['music', 'Музыка', /музык|саксоф|диджей|джаз|винил|сет\b|гитар|пиани/], ['cinema', 'Кино и фото', /кино|фильм|режисс|фото/],
    ['books', 'Литература', /книг|пишет|редакт|литерат|лекци|философ|психолог/], ['design', 'Дизайн и архитектура', /архитект|дизайн|интерьер|санатор/],
    ['business', 'Дело и проекты', /предприним|разработ|бизнес|основател|проект/], ['craft', 'Ремесло', /ремесл|чай|мастер|кофе|керами/]];
  const spheresOf = a => { const t = [a.work, a.evening, a.give, a.project, a.meet].join(' ').toLowerCase(); return SPHERES.filter(([, , re]) => re.test(t)).map(([k]) => k); };
  const KIND_IC = { vinyl: 'пластинка', film: 'фильм', book: 'книга' };
  const LINK = { mutual: 'Вы знакомы', sent: 'Ждёт ответа', incoming: 'Просит познакомиться', none: '' };
  const linkMark = l => l === 'mutual' ? '<span class="lk-m mutual" title="Вы знакомы">знакомы</span>' : l === 'incoming' ? '<span class="lk-m incoming">просит знакомства</span>' : l === 'sent' ? '<span class="lk-m sent">ждёт ответа</span>' : '';
  const firstName = m => esc(m.anketa.alias || '');
  // Совпадение — как оценка совместимости вкусов в музыкальном сервисе: процент и из чего он сложился.
  const PARTS = [['music', 'Музыка'], ['cinema', 'Кино'], ['evenings', 'Вечера'], ['work', 'Дела'], ['people', 'Люди'], ['library', 'Медиатека']];
  const ringHTML = (v, small) => { const r = 44, c = 2 * Math.PI * r;
    return `<span class="mring${small ? ' sm' : ''}" role="img" aria-label="Совпадение ${v}%"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="mr-bg" cx="50" cy="50" r="${r}"/><circle class="mr-fg" cx="50" cy="50" r="${r}" style="--c:${c.toFixed(1)}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - v / 100)).toFixed(1)}" transform="rotate(-90 50 50)"/></svg><b>${v}<small>%</small></b></span>`; };
  const partsHTML = p => `<ul class="mparts" aria-label="Из чего сложилось совпадение">${PARTS.map(([k, t]) => `<li class="${p[k] ? '' : 'zero'}"><span>${t}</span><i><b style="--w:${p[k]}%"></b></i></li>`).join('')}</ul>`;
  // Подборки — как плейлисты: готовые срезы картотеки.
  const MCOLS = [['here', 'Сегодня в клубе', m => m.here], ['close', 'Близкие по духу', m => m.match >= 60], ['week', 'Идут на этой неделе', m => m.plans && m.plans.length],
    ['teach', 'Могут научить', m => /науч/i.test(m.anketa.give || '')], ['known', 'Знакомые', m => m.link === 'mutual']];
  const inCol = (m, k) => { if (!k) return true; const c = MCOLS.find(x => x[0] === k); return c ? !!c[2](m) : spheresOf(m.anketa).includes(k); };
  // Лента конвертов по блоку Cover Flow (21st.dev, louisstudios): центральный конверт крупно, соседние повёрнуты и уходят в глубину.
  // Листается стрелками, колесом, перетаскиванием и свайпом; под лентой — кто это и что у вас общего.
  const flowHTML = shown => shown.length ? `<div class="cflow" data-flow tabindex="0" role="group" aria-roledescription="лента" aria-label="Лента резидентов. Стрелки влево и вправо листают, Enter открывает карточку">
      <div class="cf-stage">${shown.map((m, i) => `<button class="cf-item" data-act="cfpick" data-i="${i}" data-id="${m.id}" tabindex="-1" aria-label="${firstName(m)}, совпадение ${m.match}%"><span class="cf-cover">${cover(m.anketa)}${m.here ? '<i class="cf-here" title="Сегодня в клубе"></i>' : ''}</span></button>`).join('')}</div>
      <button class="cf-nav prev" data-act="cfstep" data-d="-1" aria-label="Предыдущий резидент">‹</button><button class="cf-nav next" data-act="cfstep" data-d="1" aria-label="Следующий резидент">›</button></div>
    <div class="cfd" data-cfd aria-live="polite"></div>` : `<p class="empty">Никого не нашли${S.mq ? ` по «${esc(S.mq)}»` : ''}.</p>`;
  const flowDetail = (m, i, n) => { const a = m.anketa, top = m.common.slice(0, 3);
    return `<div class="cfd-id"><p class="md-kick">${i + 1} из ${n}${m.here ? ' · сегодня в клубе' : ''}</p><h2>${firstName(m)}</h2><p class="cfd-work">${esc(a.work || '')}</p>${linkMark(m.link)}</div>
      <div class="cfd-match">${ringHTML(m.match)}<div><p class="md-cap">Совпадение</p>${partsHTML(m.parts)}</div></div>
      <div class="cfd-mix"><p class="md-cap">Что у вас общего</p><ul class="md-common">${top.map(c => `<li>${esc(c)}</li>`).join('') || '<li class="none">Общего пока не нашли. Тем интереснее познакомиться.</li>'}${m.common.length > 3 ? `<li class="more">и ещё ${m.common.length - 3}</li>` : ''}</ul>
        <div class="actions"><button class="btn primary small" data-act="who" data-id="${m.id}"${m.link === 'none' ? ' data-intro="1"' : ''}>${m.link === 'mutual' ? 'Написать' : m.link === 'incoming' ? 'Ответить на просьбу' : m.link === 'sent' ? 'Открыть карточку' : 'Познакомиться'}</button>${m.link === 'none' || m.link === 'mutual' ? `<button class="btn small" data-act="who" data-id="${m.id}">Карточка</button>` : ''}</div></div>`; };
  function flowLayout() { const box = $('[data-flow]'); if (!box || !S.mem) return; const items = $$('.cf-item', box), n = items.length; if (!n) return;
    S.cfI = Math.max(0, Math.min(n - 1, S.cfI || 0)); const w = items[0].offsetWidth;
    items.forEach((el, i) => { const d = i - S.cfI, a = Math.abs(d), sg = Math.sign(d);
      el.style.transform = d ? `translateX(${sg * (w * .72 + (a - 1) * w * .34)}px) translateZ(${-w * .6 - a * 12}px) rotateY(${-sg * 58}deg)` : 'translateX(0) translateZ(0) rotateY(0)';
      el.style.zIndex = String(100 - a); el.style.opacity = a > 5 ? '0' : '1'; el.style.pointerEvents = a > 5 ? 'none' : ''; el.classList.toggle('on', !d); });
    const m = S.mem.list.find(x => x.id === items[S.cfI].dataset.id); S.cfId = m.id;
    const dd = $('[data-cfd]'); if (dd && dd.dataset.id !== m.id + ':' + n) { dd.dataset.id = m.id + ':' + n; dd.innerHTML = flowDetail(m, S.cfI, n); }
    $$('.cf-nav', box).forEach(b => { b.disabled = b.classList.contains('prev') ? S.cfI === 0 : S.cfI === n - 1; }); }
  // Колода «Знакомства» по блоку Swipe Deck (21st.dev, ddoemonn): по одной анкете, «Дальше» или «Познакомиться», можно вернуть.
  // Только те, с кем вы ещё не знакомы. «Познакомиться» открывает записку — согласие всё равно за человеком.
  function meetDeckHTML(d) { const all = d.list.filter(m => m.link === 'none'), skip = S.deckSkip || [], rest = all.filter(m => !skip.includes(m.id));
    if (!all.length) return '<p class="empty">Вы знакомы со всеми резидентами или уже попросили о знакомстве.</p>';
    if (!rest.length) return `<div class="mdk-end"><p>Вы посмотрели всех, с кем ещё не знакомы: ${all.length}.</p><button class="btn" data-act="dreset">Посмотреть ещё раз</button></div>`;
    const card = (m, pos) => { const a = m.anketa; return `<article class="dcard p${pos}" ${pos ? 'aria-hidden="true"' : `data-dtop data-id="${m.id}"`}>
        <div class="dc-art"><i class="disc" aria-hidden="true"></i>${cover(a)}</div>
        <div class="dc-body"><div class="dc-head"><div><p class="md-kick">${m.here ? 'Сегодня в клубе' : 'Резидент клуба'}</p><h3>${firstName(m)}</h3><p class="dc-work">${esc(a.work || '')}</p></div>${ringHTML(m.match, true)}</div>
          <ul class="md-common">${m.common.slice(0, 3).map(c => `<li>${esc(c)}</li>`).join('') || '<li class="none">Общего пока не нашли. Тем интереснее познакомиться.</li>'}</ul>
          ${a.meet ? `<p class="dc-q"><span>Хочет встретить</span>${esc(a.meet.toLowerCase())}</p>` : ''}${a.give && a.give !== 'Пока послушаю' ? `<p class="dc-q"><span>Может поделиться</span>${esc(a.give.toLowerCase())}</p>` : ''}</div></article>`; };
    return `<div class="mdk" data-deck tabindex="0" role="group" aria-label="Знакомства. Стрелка влево — дальше, вправо — познакомиться">
      <p class="mdk-count">${skip.length + 1} из ${all.length} · резиденты, с которыми вы ещё не знакомы</p>
      <div class="mdk-stack">${rest.slice(0, 3).map((m, i) => card(m, i)).reverse().join('')}</div>
      <div class="mdk-acts"><button class="btn" data-act="dundo" ${skip.length ? '' : 'disabled'}>Вернуть</button><button class="btn" data-act="dskip">Дальше</button><button class="btn primary" data-act="who" data-id="${rest[0].id}" data-intro="1">Познакомиться</button></div>
      <p class="mdk-hint">На клавиатуре — стрелки влево и вправо. На телефоне карточку можно смахнуть.</p></div>`; }
  // Карта интересов по блоку Note Graph (21st.dev, astralyxdev): люди и то, что их связывает — исполнители, фильмы, любимые вечера.
  // Расположение считается пружинами: кто делит больше интересов, тот стоит ближе. Нажали на интерес — видно всех, кто его разделяет.
  function graphHTML(d) {
    const me = { id: 'me', anketa: d.me.anketa, me: true, link: 'me' }, people = [me, ...d.list], tags = {};
    const tag = (k, type, label, pid) => { (tags[k] = tags[k] || { k, type, label, who: [] }).who.push(pid); };
    for (const p of people) { const a = p.anketa;
      [...new Set((a.music || '').split(',').map(x => x.trim()).filter(x => x && x !== '—'))].forEach(x => tag('m:' + x.toLowerCase(), 'music', x, p.id));
      if (a.film && a.film.trim() && a.film !== '—') tag('f:' + a.film.trim().toLowerCase(), 'film', a.film.trim(), p.id);
      if (a.evening) tag('e:' + a.evening, 'evening', a.evening, p.id); }
    const T = Object.values(tags).filter(t => t.who.length >= 2), W = 1000, H = 700;
    const nodes = [...people.map((p, i) => ({ id: p.id, p, x: W / 2 + (p.me ? 0 : Math.cos(i * 2.4) * 300), y: H / 2 + (p.me ? 0 : Math.sin(i * 2.4) * 230), r: p.me ? 30 : 22 })),
      ...T.map((t, i) => ({ id: t.k, t, x: W / 2 + Math.cos(i * 1.7 + 1) * 170, y: H / 2 + Math.sin(i * 1.7 + 1) * 140, r: 7 + t.who.length * 2 }))];
    const ix = Object.fromEntries(nodes.map((n, i) => [n.id, i])), edges = T.flatMap(t => t.who.map(w => [ix[w], ix[t.k]]));
    for (let it = 0; it < 320; it++) { const k = 1 - it / 320;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy || 1, dd = Math.sqrt(d2), min = a.r + b.r + 34;
        const f = ((dd < min ? (min - dd) * .5 : 0) + 9000 / d2) * k; dx /= dd; dy /= dd; a.x += dx * f; a.y += dy * f; b.x -= dx * f; b.y -= dy * f; }
      for (const [i, j] of edges) { const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, dd = Math.sqrt(dx * dx + dy * dy) || 1, f = (dd - 140) * .02 * k; a.x += dx / dd * f; a.y += dy / dd * f; b.x -= dx / dd * f; b.y -= dy / dd * f; }
      for (const n of nodes) { n.x += (W / 2 - n.x) * .006 * k; n.y += (H / 2 - n.y) * .012 * k; } }
    // растягиваем расклад на всё поле
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (const n of nodes) { n.x = 80 + (n.x - x0) / (x1 - x0 || 1) * (W - 160); n.y = 46 + (n.y - y0) / (y1 - y0 || 1) * (H - 110); }
    S.graph = { T, people, adj: Object.fromEntries(nodes.map(n => [n.id, new Set()])) };
    edges.forEach(([i, j]) => { S.graph.adj[nodes[i].id].add(nodes[j].id); S.graph.adj[nodes[j].id].add(nodes[i].id); });
    const f1 = v => v.toFixed(1), at = id => nodes[ix[id]];
    const friends = [...d.links.map(l => [l[0], l[1]]), ...d.list.filter(m => m.link === 'mutual').map(m => ['me', m.id])].filter(l => at(l[0]) && at(l[1]));
    return `<div class="gwrap"><div class="gscroll"><svg class="gmap" viewBox="0 0 ${W} ${H}" role="group" aria-label="Карта интересов: люди и то, что их связывает">
        ${friends.map(([a, b]) => `<line class="gf" x1="${f1(at(a).x)}" y1="${f1(at(a).y)}" x2="${f1(at(b).x)}" y2="${f1(at(b).y)}"/>`).join('')}
        ${edges.map(([i, j]) => `<line class="ge" data-a="${nodes[i].id}" data-b="${esc(nodes[j].id)}" x1="${f1(nodes[i].x)}" y1="${f1(nodes[i].y)}" x2="${f1(nodes[j].x)}" y2="${f1(nodes[j].y)}"/>`).join('')}
        ${nodes.filter(n => n.t).map(n => `<g class="gt ${n.t.type}" data-act="gsel" data-k="${esc(n.id)}" role="button" tabindex="0" aria-label="${esc(n.t.label)}: ${n.t.who.length} ${plural(n.t.who.length, 'человек', 'человека', 'человек')}"><circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${n.r}"/><text x="${f1(n.x)}" y="${f1(n.y + n.r + 15)}">${esc(n.t.label)}</text></g>`).join('')}
        ${nodes.filter(n => n.p).map(n => `<g class="gp ${n.p.link}" data-act="gsel" data-k="${n.id}" role="button" tabindex="0" aria-label="${n.p.me ? 'Вы' : firstName(n.p)}"><circle cx="${f1(n.x)}" cy="${f1(n.y)}" r="${n.r}"/><text x="${f1(n.x)}" y="${f1(n.y + 5)}">${n.p.me ? 'Вы' : initials(n.p.anketa.alias)}</text>${n.p.me ? '' : `<text class="nm" x="${f1(n.x)}" y="${f1(n.y + n.r + 16)}">${firstName(n.p)}</text>`}</g>`).join('')}</svg></div>
      <div class="ginfo" data-ginfo aria-live="polite"><p>Нажмите на интерес — увидите всех, кто его разделяет. Нажмите на человека — увидите, что вас связывает.</p></div>
      <div class="legend"><span><i class="lg g-music"></i>исполнитель</span><span><i class="lg g-film"></i>фильм</span><span><i class="lg g-evening"></i>любимый вечер</span><span><i class="lg ln-mutual"></i>знакомы</span></div></div>`; }
  function graphSelect(k) { const g = S.graph, svg = $('.gmap'), info = $('[data-ginfo]'); if (!g || !svg) return; S.gsel = S.gsel === k ? null : k; k = S.gsel;
    svg.classList.toggle('sel', !!k); const near = k ? g.adj[k] : new Set();
    $$('[data-k]', svg).forEach(n => { n.classList.toggle('hi', !!k && (n.dataset.k === k || near.has(n.dataset.k))); n.classList.toggle('cur', n.dataset.k === k); });
    $$('.ge', svg).forEach(e => e.classList.toggle('hi', !!k && (e.dataset.a === k || e.dataset.b === k)));
    if (!k) { info.innerHTML = '<p>Нажмите на интерес — увидите всех, кто его разделяет. Нажмите на человека — увидите, что вас связывает.</p>'; return; }
    const t = g.T.find(x => x.k === k), name = id => id === 'me' ? 'Вы' : firstName(g.people.find(p => p.id === id));
    if (t) { const kind = { music: 'Слушают', film: 'Выбрали фильм', evening: 'Любимый вечер' }[t.type];
      info.innerHTML = `<p class="md-cap">${kind}</p><p class="gi-title">${esc(t.label)}</p><div class="md-tags">${t.who.map(id => id === 'me' ? '<span class="tag me">Вы</span>' : `<button class="tag" data-act="who" data-id="${id}">${name(id)}</button>`).join('')}</div>`; return; }
    const mineT = new Set(g.T.filter(x => x.who.includes('me')).map(x => x.k)), his = g.T.filter(x => x.who.includes(k));
    if (k === 'me') { info.innerHTML = `<p class="md-cap">Ваши интересы на карте</p><div class="md-tags">${his.map(x => `<button class="tag" data-act="gsel" data-k="${esc(x.k)}">${esc(x.label)}</button>`).join('') || '<span class="t-small t-2">Заполните анкету — появятся связи.</span>'}</div>`; return; }
    const m = g.people.find(p => p.id === k), shared = his.filter(x => mineT.has(x.k));
    info.innerHTML = `<div class="gi-person">${ringHTML(m.match, true)}<div><p class="gi-title">${firstName(m)}</p><p class="t-small t-2">${esc(m.anketa.work || '')}</p></div><button class="btn small primary" data-act="who" data-id="${m.id}">Карточка</button></div>
      <p class="md-cap" style="margin-top:12px">${shared.length ? 'Общее с вами' : 'Общих интересов на карте нет. Его интересы'}</p><div class="md-tags">${(shared.length ? shared : his).map(x => `<button class="tag" data-act="gsel" data-k="${esc(x.k)}">${esc(x.label)}</button>`).join('')}</div>`; }
  // Конверт на полке: обложка, из конверта выглядывает пластинка, имя, дело и главная причина познакомиться.
  const sleeveHTML = m => { const a = m.anketa, why = m.common[0];
    return `<button class="msleeve${S.who === m.id && S.mopen ? ' on' : ''}" data-act="who" data-id="${m.id}" aria-label="${firstName(m)}${a.work ? ', ' + esc(a.work) : ''}. ${m.common.length ? `Общего: ${m.common.length}` : ''} ${LINK[m.link]}">
      <span class="ms-art"><i class="disc" aria-hidden="true"></i>${cover(a)}${m.unread ? `<span class="ms-new" title="Новое сообщение">${m.unread}</span>` : ''}</span>
      <span class="ms-name">${firstName(m)}</span><span class="ms-work">${esc(a.work || m.tier_name)}</span>
      <span class="ms-why">${why ? `<i></i>${esc(why)}` : '<span class="t-2">Общего пока не нашли</span>'}${m.common.length > 1 ? ` <b>+${m.common.length - 1}</b>` : ''}</span>${linkMark(m.link)}</button>`; };
  // Карточка резидента выезжает сбоку: общее, где встретиться, анкета, медиатека, знакомство и переписка.
  function drawerHTML(m, th) {
    const a = m.anketa, rows = [['Чем занимается', a.work], ['Фильм у камина', a.film], ['Любимый вечер', a.evening], ['Может поделиться', a.give], ['Сейчас работает над', a.project], ['Хочет встретить', a.meet]].filter(r => r[1] && r[1] !== 'Пока нет' && r[1] !== '—');
    const artists = (a.music || '').split(',').map(x => x.trim()).filter(x => x && x !== '—');
    const sugg = m.common[0] ? `Добрый вечер! ${m.common[0].replace(/^Оба /, 'Мы оба ').replace(/^Общие знакомые/, 'У нас общие знакомые')}. Познакомимся в клубе?` : 'Добрый вечер! Хочу познакомиться — увидимся в клубе?';
    const act = m.link === 'mutual' ? '' : m.link === 'incoming' ? `<div class="md-req"><p class="md-cap">${firstName(m)} просит познакомиться</p>${m.note ? `<blockquote>${esc(m.note)}</blockquote>` : ''}
        <div class="actions"><button class="btn primary" data-act="know" data-id="${m.id}">Познакомиться</button><button class="btn" data-act="mdecline" data-id="${m.id}">Не сейчас</button></div></div>`
      : m.link === 'sent' ? `<div class="md-req sent"><p class="md-cap">Вы попросили познакомиться</p>${m.note ? `<blockquote>${esc(m.note)}</blockquote>` : ''}<p class="t-small t-2">Когда ${firstName(m)} согласится, откроется переписка.</p></div>`
      : `<form class="md-intro" data-form="intro" data-id="${m.id}"><label class="field"><span class="md-cap">Попросить познакомиться</span><textarea name="note" rows="3" maxlength="300">${esc(sugg)}</textarea></label>
        <p class="t-small t-2">${firstName(m)} увидит записку и решит. Писать друг другу можно будет после согласия.</p>
        <div class="actions"><button class="btn primary">Отправить просьбу</button><button type="button" class="btn" data-act="know" data-id="${m.id}">Мы уже знакомы</button></div></form>`;
    const talk = th && th.can_write ? `<section class="md-sec"><h3 class="md-cap">Переписка</h3><div class="md-thread" data-mthread>${th.list.map(x => `<div class="b-row ${x.mine ? 'me' : 'bot'}"><p class="bubble"><small>${dt(x.ts).d} ${dt(x.ts).mon.slice(0, 3)}, ${dt(x.ts).t}</small>${esc(x.text)}</p></div>`).join('') || '<p class="t-small t-2">Сообщений пока нет. Начните первым.</p>'}</div>
        <form class="reply" data-form="msg" data-id="${m.id}"><input name="text" maxlength="1000" required autocomplete="off" aria-label="Сообщение для ${firstName(m)}" placeholder="Сообщение"><button class="btn primary small">Отправить</button></form></section>`
      : m.link === 'mutual' ? `<p class="t-small t-2 md-sec">${firstName(m)} закрыл(а) сообщения. Поговорите в клубе.</p>` : '';
    return `<div class="mdraw-bg" data-act="mclose"></div><aside class="mdraw" role="dialog" aria-modal="true" aria-labelledby="md-name">
      <button class="md-x" data-act="mclose" aria-label="Закрыть карточку">×</button>
      <div class="md-top"><div class="md-art"><i class="disc" aria-hidden="true"></i>${cover(a)}</div>
        <div class="md-id"><p class="md-kick">${esc(m.tier_name)}${m.friends ? ` · знакомых в клубе: ${m.friends}` : ''}</p><h2 id="md-name">${firstName(m)}</h2>${a.work ? `<p class="md-work">${esc(a.work)}</p>` : ''}${m.link === 'mutual' ? '<p class="status ok">Вы знакомы</p>' : ''}</div></div>
      <div class="md-match">${ringHTML(m.match)}<div><p class="md-cap">Совпадение${m.here ? ' · сегодня в клубе' : ''}</p>${partsHTML(m.parts)}</div></div>
      ${act}
      ${m.common.length ? `<section class="md-sec"><h3 class="md-cap">Что у вас общего</h3><ul class="md-common">${m.common.map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>` : '<p class="md-sec t-small t-2">Совпадений пока нет. Чем полнее анкеты, тем больше общего найдёт картотека.</p>'}
      <section class="md-sec"><h3 class="md-cap">Встретимся в клубе</h3>${m.plans == null ? '<p class="t-small t-2">Не показывает, на какие вечера записан(а).</p>' : m.plans.length ? `<ul class="agenda">${m.plans.map(p => agendaRow({ ...((S.pub.events || []).find(e => e.id === p.id) || {}), ...p }, S.me.bookings.includes(p.id))).join('')}</ul>` : '<p class="t-small t-2">На ближайшие вечера пока не записан(а).</p>'}</section>
      ${artists.length ? `<section class="md-sec"><h3 class="md-cap">Слушает</h3><div class="md-tags">${artists.map(x => `<button class="tag" data-act="mfind" data-q="${esc(x)}" title="Кто ещё слушает">${esc(x)}</button>`).join('')}</div></section>` : ''}
      ${rows.length ? `<section class="md-sec"><dl class="md-kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>` : ''}
      ${m.wants.length ? `<section class="md-sec"><h3 class="md-cap">Хочет в медиатеке</h3><ul class="md-wants">${m.wants.map(w => `<li><span>${w.wish ? 'купить' : { vinyl: 'послушать', film: 'посмотреть', book: 'обсудить' }[w.kind]}</span>${esc(w.title)}${w.by ? ` <small>${esc(w.by)}</small>` : ''}</li>`).join('')}</ul><button class="link" data-act="nav" data-to="library">Медиатека</button></section>` : ''}
      ${m.mutual.length ? `<section class="md-sec"><h3 class="md-cap">Общие знакомые</h3><p>${m.mutual.map(esc).join(', ')}</p></section>` : ''}
      ${talk}</aside>`; }
  async function members(partial) {
    const d = await api('GET', '/api/members'); S.mem = d;
    const list = d.list, me = d.me, q = (S.mq || '').toLowerCase().trim(), colk = S.msph || '', sort = S.msort || 'close', view = S.mview || 'flow';
    const hay = m => [m.anketa.alias, m.anketa.work, m.anketa.music, m.anketa.film, m.anketa.give, m.anketa.project, m.anketa.meet, m.anketa.evening].join(' ').toLowerCase();
    let shown = list.filter(m => (!q || hay(m).includes(q)) && inCol(m, colk));
    if (sort === 'known') shown = [...shown].sort((a, b) => (b.link === 'mutual') - (a.link === 'mutual') || b.score - a.score);
    if (sort === 'abc') shown = [...shown].sort((a, b) => (a.anketa.alias || '').localeCompare(b.anketa.alias || '', 'ru'));
    S.cfI = Math.max(0, shown.findIndex(m => m.id === S.cfId));
    const known = list.filter(m => m.link === 'mutual').length, asks = list.filter(m => m.link === 'incoming'), unread = list.reduce((s, m) => s + (m.unread || 0), 0), here = list.filter(m => m.here).length;
    // как вас видят другие: сколько полей открыто, что добавить, и отметка «я сегодня в клубе»
    const keys = S.cfg.anketa.map(f => f.k).filter(k => !['source', 'media', 'mood'].includes(k)), open = keys.filter(k => (me.anketa[k] || '').trim() && !me.hidden.includes(k));
    const miss = S.cfg.anketa.find(f => ['film', 'give', 'project', 'meet', 'music'].includes(f.k) && !(me.anketa[f.k] || '').trim());
    const self = `<aside class="mself"><div class="mself-art">${cover(me.anketa)}</div><div><p class="md-cap">Так вас видят</p><p class="mself-name">${esc(me.anketa.alias || S.me.name)}</p>
      <p class="t-small t-2">Открыто ${open.length} из ${keys.length} полей анкеты${me.hidden.length ? `, скрыто ${me.hidden.length}` : ''}.${miss ? ` Ответьте бармену про «${esc(miss.q.replace(/\?.*$/, '').toLowerCase())}» — так вас найдут свои.` : ''}</p>
      <label class="check here-t"><input type="checkbox" data-set="here" ${me.here ? 'checked' : ''}><span>Я сегодня в клубе и не против познакомиться</span></label>
      <button class="link" data-act="nav" data-to="cabinet">Настроить в кабинете</button></div></aside>`;
    const askHTML = asks.length ? `<section class="msec"><h2 class="cap-title">Просят познакомиться · ${asks.length}</h2><div class="masks">${asks.map(m => `<article class="mask"><div class="mask-art">${cover(m.anketa)}</div><div class="mask-txt"><p class="sg-name">${firstName(m)}${m.anketa.work ? ` <small>${esc(m.anketa.work)}</small>` : ''}</p>${m.note ? `<blockquote>${esc(m.note)}</blockquote>` : ''}
        <div class="actions"><button class="btn small primary" data-act="know" data-id="${m.id}">Познакомиться</button><button class="btn small" data-act="mdecline" data-id="${m.id}">Не сейчас</button><button class="link" data-act="who" data-id="${m.id}">Карточка</button></div></div></article>`).join('')}</div></section>` : '';
    const VIEWS_M = [['flow', 'Лента'], ['deck', 'Знакомства'], ['map', 'Карта интересов'], ['shelf', 'Списком']], filt = view === 'flow' || view === 'shelf';
    const bar = `<div class="mbar"><div class="seg-wrap"><div class="seg dark" role="group" aria-label="Вид картотеки"${S.mvW ? ` style="--sx:${S.mvX}px;--sw:${S.mvW}px" data-ready="1"` : ''}>${VIEWS_M.map(([k, t]) => `<button type="button" class="seg-b" data-act="mview" data-k="${k}" aria-pressed="${view === k}" tabindex="${view === k ? 0 : -1}">${t}</button>`).join('')}</div></div>
      ${filt ? `<form class="lib-search msearch" data-form="msearch" role="search"><input name="q" value="${esc(S.mq || '')}" placeholder="Имя, дело, исполнитель, фильм" aria-label="Поиск по картотеке" autocomplete="off">${S.mq ? '<button type="button" class="link" data-act="mfind" data-q="">Сбросить</button>' : ''}</form>
      <label class="msort"><span class="sr">Порядок</span><select data-msort aria-label="Порядок">${[['close', 'Сначала близкие'], ['known', 'Сначала знакомые'], ['abc', 'По алфавиту']].map(([k, t]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}</div>
      ${filt ? `<div class="chips" role="group" aria-label="Подборки"><button class="chip${colk ? '' : ' on'}" data-act="msph" data-k="" aria-pressed="${!colk}">Все · ${list.length}</button>${[...MCOLS, ...SPHERES].map(([k, t]) => { const n = list.filter(m => inCol(m, k)).length; return n ? `<button class="chip${colk === k ? ' on' : ''}${k === 'here' ? ' live' : ''}" data-act="msph" data-k="${k}" aria-pressed="${colk === k}">${t} · ${n}</button>` : ''; }).join('')}</div>` : ''}`;
    const body = view === 'map' ? graphHTML(d) : view === 'deck' ? meetDeckHTML(d) : view === 'shelf' ? `<div class="mshelf">${shown.map(sleeveHTML).join('') || `<p class="empty">Никого не нашли${S.mq ? ` по «${esc(S.mq)}»` : ''}.</p>`}</div>` : flowHTML(shown);
    const m = S.mopen && list.find(x => x.id === S.who);
    const th = m && (m.can_write || m.unread) ? await api('GET', `/api/messages/${m.id}`) : null;
    if (m && m.unread) { S.me.unread = Math.max(0, (S.me.unread || 0) - m.unread); m.unread = 0; }
    const inner = `<header class="mhead"><div><h1 class="t-page">Картотека</h1><p class="lead">Резиденты клуба. Чем больше у вас общего — музыка, фильмы, вечера, дела, знакомые, — тем выше совпадение.</p>
        <dl class="mstats"><div><dt>${plural(list.length, 'резидент', 'резидента', 'резидентов')}</dt><dd>${list.length}</dd></div><div><dt>сегодня в клубе</dt><dd>${here}</dd></div><div><dt>${plural(known, 'знакомый', 'знакомых', 'знакомых')}</dt><dd>${known}</dd></div><div><dt>${plural(unread, 'новое сообщение', 'новых сообщения', 'новых сообщений')}</dt><dd>${unread}</dd></div></dl></div>${self}</header>
      ${askHTML}<section class="msec mstage" id="mall">${bar}${body}</section>
      <p class="note" style="margin-top:var(--s6)">Картотека показывает только открытые поля анкет. Возраст и фамилию клуб не показывает. Кто может вам писать, видно ли, на какие вечера вы записаны и что вы сегодня в клубе, решаете вы.</p>
      <div id="mdraw">${m ? drawerHTML(m, th) : ''}</div>`;
    if (partial) return inner;
    return `<section class="band mem-page"><div class="wrap" id="mroot">${inner}</div></section>`;
  }
  // Картотека обновляется на месте; открытая карточка остаётся открытой.
  async function refreshMembers(focusSel) {
    const root = $('#mroot'); if (!root) return draw();
    const y = scrollY, keep = $('.mdraw') ? $('.mdraw').scrollTop : 0; root.innerHTML = await members(true); scrollTo(0, y);
    paintCovers(); navCounts(); flowLayout(); S.gsel = null;
    const dr = $('.mdraw'); if (dr) { dr.scrollTop = keep; const t = $('[data-mthread]'); t && (t.scrollTop = t.scrollHeight); }
    document.body.classList.toggle('noscroll', !!dr);
    const f = focusSel && $(focusSel); f && f.focus({ preventScroll: true });
  }
  // Счётчики в меню без перерисовки страницы.
  function navCounts() { const me = S.me; if (!me) return;
    $$('nav.main a').forEach(a => { const r = a.getAttribute('href').slice(1), base = a.textContent.split(' · ')[0];
      a.textContent = base + (r === 'members' && me.unread ? ` · ${me.unread}` : r === 'feed' && me.forum_unread ? ` · ${me.forum_unread}` : ''); }); }

  // ---------------------------------------------------------------- лента клуба: вместо Telegram-канала и чата
  const when = s => { const d = dt(s), today = new Date().toISOString().slice(0, 10); return s.slice(0, 10) === today ? `сегодня, ${d.t}` : `${d.d} ${d.mon.slice(0, 3)}, ${d.t}`; };
  const paras = t => t.split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('');
  async function feed() {
    const lead = S.me && S.me.resident ? 'Разговоры резидентов, голосования, предложения друг другу и новости клуба.'
      : 'Новости клуба, голосования и разговоры резидентов. Писать и голосовать могут резиденты.';
    return `<section class="band feed-page"><div class="wrap"><header class="feed-head"><h1 class="t-page">Лента</h1><p class="lead">${lead}</p></header><div id="feedbox">${await feedBody()}</div></div></section>`;
  }
  async function refreshFeed(scrollTo) {
    const box = $('#feedbox'); if (!box) return draw();
    const ta = $('[data-form=fpost] textarea[name=text]'), draft = ta && ta.value;   // недописанное сообщение не теряем при обновлении ленты
    box.innerHTML = await feedBody();
    const ta2 = draft && $('[data-form=fpost] textarea[name=text]'); if (ta2) ta2.value = draft;
    if (S.me) { try { setMe(await api('GET', '/api/me')); navCounts(); } catch (e) {} }
    const t = scrollTo && $(scrollTo); if (t) t.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    if (S.segFocus) { S.segFocus = 0; const b = $('.seg [aria-pressed="true"]'); b && b.focus(); }
  }
  // Лента — один спокойный поток: разговоры, голосования, «свои для своих» и новости клуба. Сбоку — только ближайшее в клубе.
  const FEED_KINDS = [['all', 'Всё'], ['talk', 'Разговоры'], ['votes', 'Голосования'], ['offers', 'Свои для своих'], ['news', 'Новости клуба']];
  const ava = (name, club) => `<span class="av${club ? ' club' : ''}" aria-hidden="true">${club ? '<img src="ds/koko_E_mark_on-green.svg" alt="">' : initials(name)}</span>`;
  const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const RIC = { 'Нравится': svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'), 'Иду': svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/>'),
    'Интересно': svg('<path d="M12 4l2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.7l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6z"/>'), reply: svg('<path d="M5 6.5h14v9H10l-4 3.5v-3.5H5z"/>') };
  async function feedBody() {
    const me = S.me, res = !!(me && me.resident);
    const tabs = `<div class="tabs" role="tablist" aria-label="Разделы ленты">${[['news', 'Лента'], ['forum', `Темы резидентов${res && me.forum_unread ? ` · ${me.forum_unread}` : ''}`]]
      .map(([k, t]) => `<button class="tab" role="tab" data-act="ftab" data-k="${k}" aria-selected="${S.feedTab === k}">${t}</button>`).join('')}</div>`;
    if (S.feedTab === 'forum') return tabs + (res ? await forumBody() : lock('Темы по сферам открыты резидентам: музыка, кино, книги, дизайн, проекты и вопросы клубу. Ленту читают все.', '<button class="btn primary" data-act="nav" data-to="join">Стать резидентом</button>'));
    const d = await api('GET', '/api/feed'), kind = S.feedKind || 'all';
    const th = S.openPost ? await api('GET', `/api/threads/c_${S.openPost}`).catch(() => null) : null;
    const poll = p => { const o = p.poll; if (!o) return ''; const voted = o.mine != null || !d.can_react;
      return `<div class="poll"><p class="t-card">${esc(o.q)}</p>${o.options.map((x, i) => { const pc = o.total ? Math.round(100 * x.n / o.total) : 0;
        return voted ? `<div class="opt${o.mine === i ? ' mine' : ''}"><span>${esc(x.t)}${o.mine === i ? ' — ваш выбор' : ''}</span><b>${pc}%</b><i style="width:${pc}%"></i></div>`
          : `<button class="opt btn" data-act="pollvote" data-id="${p.id}" data-opt="${i}">${esc(x.t)}</button>`; }).join('')}
        <p class="t-small t-2">${o.total} ${plural(o.total, 'голос', 'голоса', 'голосов')}${!d.can_react ? ' · войдите, чтобы голосовать' : ''}</p></div>`; };
    const cut = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
    // Пост — по блоку Post Card (21st.dev, shadcnui-blocks): автор и тип записи сверху, заголовок, картинка, текст,
    // внизу за линией — действия. «Иду» — только у событий клуба; «Интересно» — когда кто-то уже отметил.
    const head = (name, club, meta, type) => `<header class="fi-h">${ava(name, club)}<span class="fi-who"><b>${esc(name)}</b><small>${meta}</small></span>${type ? `<span class="fi-type">${type}</span>` : ''}</header>`;
    const post = p => { const open = S.openPost === p.id, long = p.text.length > 360;
      const acts = Object.entries(p.reacts).filter(([k, n]) => k === 'Нравится' || (k === 'Иду' && p.club) || n > 0 || p.mine === k);
      return `<article class="fi${p.pinned ? ' pinned' : ''}${p.club ? ' club' : ''}" id="post-${p.id}">${head(p.by_name, p.club, `${when(p.ts)}${p.pinned ? ' · закреплено' : ''}`, p.poll ? 'Голосование' : p.club ? esc(p.tag || 'Клуб') : 'Разговор')}
        ${p.title ? `<h3 class="fi-title">${esc(p.title)}</h3>` : ''}${p.img ? `<img class="fi-img" src="hf/${esc(p.img)}.jpg" alt="" loading="lazy">` : ''}
        <div class="fi-text">${open || !long ? paras(p.text) : `<p>${esc(cut(p.text, 320))}</p>`}</div>${poll(p)}
        <div class="fi-f">${acts.map(([k, n]) => `<button class="fa${p.mine === k ? ' on' : ''}" data-act="react" data-id="${p.id}" data-r="${esc(k)}" aria-pressed="${p.mine === k}" ${d.can_react ? '' : 'disabled'}>${RIC[k] || ''}<span>${esc(k)}</span>${n ? `<b>${n}</b>` : ''}</button>`).join('')}
          <button class="fa reply-a" data-act="comments" data-id="${p.id}" aria-expanded="${open}">${RIC.reply}<span>${open ? 'Свернуть' : long ? 'Читать дальше' : 'Ответить'}</span>${p.comments ? `<b>${p.comments}</b>` : ''}</button></div>
        ${open && th ? `<div class="comments">${threadHTML(th, true)}</div>` : ''}</article>`; };
    const idea = i => `<article class="fi k-vote" id="idea-${i.id}">${head(i.host || i.name, false, `предлагает встречу · ${when(i.ts)}`, 'Голосование')}${ideaCard(i, d.can_vote, false)}</article>`;
    const offer = o => `<article class="fi k-offer" id="offer-${o.id}">${head(o.by_name, false, `${o.by_work ? `${esc(o.by_work)} · ` : ''}${when(o.ts)}`, 'Свои для своих')}
        <h3 class="fi-title">${esc(o.title)}</h3>${o.text ? `<div class="fi-text"><p>${esc(o.text)}</p></div>` : ''}${o.terms ? `<p class="terms">${esc(o.terms)}</p>` : ''}
        <div class="fi-f">${o.mine ? `<span class="fi-note">Ваше предложение · ${o.wants} ${plural(o.wants, 'отклик', 'отклика', 'откликов')}</span><button class="btn small" data-act="oclose" data-id="${o.id}">Закрыть</button>`
          : o.wanted ? '<span class="status ok">Вы откликнулись — автор ответит в переписке</span>' : d.can_vote ? `<button class="btn small primary" data-act="owant" data-id="${o.id}">Хочу</button><span class="fi-note">${o.wants ? `откликнулись ${o.wants}` : 'автору придёт сообщение от вас'}</span>` : locked('Откликнуться')}</div></article>`;
    let items = [];
    if (['all', 'talk', 'votes', 'news'].includes(kind)) items.push(...d.posts.filter(p => kind === 'all' || (kind === 'talk' && !p.club) || (kind === 'news' && p.club) || (kind === 'votes' && p.poll)).map(p => ({ ts: p.ts, pin: p.pinned && kind !== 'votes', html: post(p) })));
    if (['all', 'votes'].includes(kind)) items.push(...d.ideas.map(i => ({ ts: i.ts, html: idea(i) })));
    if (['all', 'offers'].includes(kind)) items.push(...d.offers.map(o => ({ ts: o.ts, html: offer(o) })));
    items.sort((x, y) => (y.pin ? 1 : 0) - (x.pin ? 1 : 0) || (x.ts < y.ts ? 1 : -1));
    // Поле записи свёрнуто в одну строку; заголовок, опрос и кнопка появляются, когда начали писать.
    const compose = d.can_post ? `<form class="composer" data-form="fpost"><div class="cp-row">${ava(me.anketa && me.anketa.alias || me.name, d.admin)}<label class="cp-field"><span class="sr">${d.admin ? 'Текст новости' : 'Сообщение резидентам'}</span><textarea name="text" rows="1" required maxlength="4000" placeholder="${d.admin ? 'Новость клуба' : 'Что у вас нового?'}"></textarea></label></div>
        <div class="cp-more">${d.admin ? '<label class="field"><span>Заголовок новости</span><input name="title" maxlength="140"></label>' : ''}
        <details class="poll-add"><summary>Добавить опрос</summary><label class="field"><span>Вопрос</span><input name="poll_q" maxlength="140"></label><label class="field"><span>Варианты, каждый с новой строки</span><textarea name="poll" rows="3"></textarea></label></details>
        <div class="actions">${d.admin ? '<label class="check"><input type="checkbox" name="pinned"><span>Закрепить</span></label>' : ''}<button class="btn primary small">Опубликовать</button></div></div></form>`
      : `<div class="composer ghost"><p>${me ? 'Писать, голосовать и откликаться могут резиденты.' : 'Войдите, чтобы отмечать записи. Писать и голосовать могут резиденты.'}</p>${me ? '<button class="btn primary small" data-act="nav" data-to="join">Стать резидентом</button>' : '<button class="btn primary small" data-act="login">Войти</button>'}</div>`;
    // Фильтр — по блоку Segmented Control (21st.dev, kuratlielia): плашка переезжает к выбранному, стрелки и Home/End, на телефоне — прокрутка с затуханием края.
    const seg = `<div class="seg-wrap"><div class="seg" role="group" aria-label="Что показать"${S.segW ? ` style="--sx:${S.segX}px;--sw:${S.segW}px" data-ready="1"` : ''}>${FEED_KINDS.map(([k, t]) => `<button type="button" class="seg-b" data-act="fkind" data-k="${k}" aria-pressed="${kind === k}" tabindex="${kind === k ? 0 : -1}">${t}</button>`).join('')}</div></div>`;
    const empty = { talk: 'Разговоров пока нет. Начните первым.', votes: 'Сейчас ничего не голосуется.', offers: 'Пока никто ничего не предложил. Поделитесь тем, что умеете или чем можете помочь.', news: 'Новостей клуба пока нет.', all: 'Здесь пока тихо.' }[kind];
    const evs = (S.pub.events || []).slice(0, 4);
    const side = `<aside class="feed-side">
        <section class="side-c"><h2 class="cap-title">Ближайшее в клубе</h2><ul class="agenda">${evs.map(e => agendaRow(e, me && me.bookings.includes(e.id))).join('') || '<li class="empty">Событий пока нет.</li>'}</ul><button class="link" data-act="nav" data-to="afisha">Вся афиша</button></section>
        <section class="side-c"><h2 class="cap-title">Свои для своих</h2><p>Резиденты предлагают друг другу то, что умеют: урок, консультацию, вещь. Договариваетесь напрямую.</p>${res ? '<button class="btn small" data-act="offernew">Предложить своё</button>' : ''}</section>
        <section class="side-c"><h2 class="cap-title">Своя встреча</h2><p>Мастер-класс, клуб по интересам, лекция. Команда посмотрит, резиденты проголосуют.</p><button class="btn small" data-act="nav" data-to="host">Предложить встречу</button></section></aside>`;
    return tabs + `<div class="feed-grid"><div class="feed-main paper">${compose}${seg}<div class="stream">${items.map(x => x.html).join('') || `<p class="empty">${empty}</p>`}</div></div>${side}</div>`;
  }
  async function forumBody() {
    const crumbs = (...items) => `<nav class="crumbs" aria-label="Где вы">${items.map(([t, act, k], i) => i === items.length - 1 ? `<span aria-current="page">${esc(t)}</span>` : `<button class="link" data-act="${act}" data-k="${k || ''}" data-id="${k || ''}">${esc(t)}</button>`).join('<i></i>')}</nav>`;
    if (S.thread) {
      const th = await api('GET', `/api/threads/${S.thread}`), t = th.thread;
      return (t.topic === 'comments' ? crumbs(['Обсуждения', 'topic', ''], ['Комментарии к посту'], [t.title]) : crumbs(['Обсуждения', 'topic', ''], [t.topic_name, 'topic', t.topic], [t.title])) + `<div class="thread-head"><h2 class="t-block">${esc(t.title)}</h2>${th.admin ? `<button class="btn small" data-act="pin" data-id="${t.id}">${t.pinned ? 'Открепить ветку' : 'Закрепить ветку'}</button>` : ''}</div>${threadHTML(th)}`;
    }
    if (S.topic) {
      const d = await api('GET', `/api/forum/${S.topic}`), tp = d.topic;
      return crumbs(['Обсуждения', 'topic', ''], [tp.name]) + `<div class="topic-head">${SIGN[tp.sign] || SIGN.club}<p class="lead">${esc(tp.about)}</p></div>${threadList(d.threads)}
        <details class="card compose" ${d.threads.length ? '' : 'open'}><summary class="t-card">Новая ветка</summary><form class="form wide" data-form="fthread">
          <label class="field"><span>О чём ветка</span><input name="title" required maxlength="140"></label>
          <label class="field"><span>Первое сообщение</span><textarea name="text" rows="4" required></textarea></label>
          <div class="actions"><button class="btn primary">Создать ветку</button></div></form></details>`;
    }
    const d = await api('GET', '/api/forum');
    let found = '';
    if (S.fq) { const q = S.fq.toLowerCase(), all = (await api('GET', '/api/forum/all')).threads.filter(t => (t.title + ' ' + t.texts).toLowerCase().includes(q));
      found = `<p class="t-cap t-2">Найдено веток: ${all.length}</p>${threadList(all, true)}<button class="link" data-act="fclear">Сбросить поиск</button>`; }
    return `<form class="search" data-form="fsearch" role="search"><label class="field" style="flex:1"><span class="t-cap t-2">Поиск по обсуждениям</span><input name="q" value="${esc(S.fq)}" autocomplete="off"></label><button class="btn small">Найти</button></form>
      ${found || topicsHTML(d)}
      <p class="note" style="margin-top:var(--s6)">Отвечать можно на конкретное сообщение. Закреплённые ветки — сверху. Сообщение, которое нарушает правила, отправьте команде кнопкой «Пожаловаться».</p>`;
  }
  const WDP = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'], WDS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  // Сферы: близкие резиденту (звёздочка, анкета, свои сообщения) — сверху, остальные — ниже и приглушённо, но видны.
  function topicsHTML(d) {
    const card = (tp, dim) => `<div class="topic${dim ? ' dim' : ''}"><button class="topic-open" data-act="topic" data-k="${tp.k}">${SIGN[tp.sign] || SIGN.club}<span class="t-card">${esc(tp.name)}</span>
        ${tp.day != null ? `<span class="t-cap t-2">Вечер — по ${WDP[tp.day]}</span>` : ''}<span class="t-small t-2">${esc(tp.about)}</span>
        <span class="t-cap t-2">${tp.threads} ${plural(tp.threads, 'ветка', 'ветки', 'веток')} · ${tp.msgs} ${plural(tp.msgs, 'сообщение', 'сообщения', 'сообщений')}${tp.last ? ` · ${when(tp.last)}` : ''}</span>${tp.unread ? `<b class="badge">${tp.unread} ${plural(tp.unread, 'новое', 'новых', 'новых')}</b>` : ''}</button>
        ${tp.kind === 'sphere' ? `<button class="star${tp.star ? ' on' : ''}" data-act="fstar" data-k="${tp.k}" aria-pressed="${tp.star}" title="${tp.star ? 'Убрать из моих интересов' : 'Добавить в мои интересы'}">${tp.star ? '★' : '☆'}<span class="sr">${tp.star ? 'В моих интересах' : 'Отметить интерес'}</span></button>` : ''}</div>`;
    const sp = d.topics.filter(t => t.kind === 'sphere'), mine = sp.filter(t => t.score > 0), rest = sp.filter(t => t.score <= 0), svc = d.topics.filter(t => t.kind !== 'sphere');
    const week = `<ol class="week" aria-label="Неделя клуба">${d.week.map(w => `<li${mine.some(t => t.k === w.topic) ? ' class="on"' : ''}><b>${WDS[w.d]}</b><span>${esc(w.name)}</span></li>`).join('')}</ol>`;
    return `<h3 class="t-block">Неделя клуба</h3><p class="t-small t-2">У каждого формата свой день. Отмеченные вами темы подсвечены.</p>${week}
      <h3 class="t-block">Ваши интересы</h3>${mine.length ? `<div class="topics">${mine.map(t => card(t)).join('')}</div>` : '<p class="empty">Сферы, отмеченные звёздочкой, стоят первыми. Порядок учитывает и анкету, и ваши сообщения.</p>'}
      ${rest.length ? `<h3 class="t-block">Другие сферы</h3><div class="topics">${rest.map(t => card(t, true)).join('')}</div>` : ''}
      <h3 class="t-block">Общее</h3><div class="topics">${svc.map(t => card(t)).join('')}</div>`;
  }
  const threadList = (ts, withTopic) => ts.length ? `<ul class="threads">${ts.map(t => `<li><button class="thr" data-act="thread" data-id="${t.id}">
      <span class="t-card">${t.pinned ? '<span class="status open">Закреплено</span> ' : ''}${esc(t.title)}</span><span class="t-small t-2">${esc(t.first)}</span>
      <span class="t-cap t-2">${withTopic ? `${esc(t.topic_name)} · ` : ''}${esc(t.by)} · ${t.n} ${plural(t.n, 'сообщение', 'сообщения', 'сообщений')} · ${when(t.last)}</span>${t.unread ? `<b class="badge">${t.unread}</b>` : ''}</button></li>`).join('')}</ul>` : '<p class="empty">Веток пока нет.</p>';
  function threadHTML(th, compact) {
    const t = th.thread, rep = S.replyTo && th.msgs.find(m => m.id === S.replyTo);
    const msg = m => `<li class="msg${m.mine ? ' mine' : ''}" id="m-${m.id}"><div class="between"><b>${esc(m.name)}</b><span class="t-cap t-2">${when(m.ts)}</span></div>
      ${m.reply ? `<blockquote><b>${esc(m.reply.name)}</b> ${esc(m.reply.text)}</blockquote>` : ''}
      ${m.hidden ? '<p class="t-small t-2">Сообщение скрыто командой клуба.</p>' : `<p>${esc(m.text)}</p>`}
      <div class="msg-acts">${Object.entries(m.reacts).map(([k, n]) => `<button class="react small${m.my === k ? ' on' : ''}" data-act="mreact" data-id="${m.id}" data-r="${esc(k)}" aria-pressed="${m.my === k}" ${th.can_write ? '' : 'disabled'}>${esc(k)}${n ? ` <b>${n}</b>` : ''}</button>`).join('')}
        ${th.can_write && !m.hidden ? `<button class="link" data-act="reply" data-id="${m.id}">Ответить</button>` : ''}${th.can_write && !m.mine && !m.hidden ? `<button class="link quiet" data-act="report" data-id="${m.id}">Пожаловаться</button>` : ''}
        ${th.admin ? `<button class="link quiet" data-act="hide" data-id="${m.id}">${m.hidden ? 'Показать' : 'Скрыть'}</button>` : ''}</div></li>`;
    return `<ul class="msgs${compact ? ' compact' : ''}">${th.msgs.map(msg).join('') || '<li class="empty">Сообщений пока нет.</li>'}</ul>
      ${th.can_write ? `<form class="send" data-form="fmsg" data-id="${t.id}">${rep ? `<div class="replying"><span>Ответ: <b>${esc(rep.name)}</b> — ${esc(rep.text.slice(0, 80))}</span><button type="button" class="link" data-act="noreply">Отменить</button></div>` : ''}
        <label class="field" style="flex:1"><span class="t-cap t-2">${compact ? 'Комментарий' : 'Сообщение'}</span><textarea name="text" rows="2" required maxlength="2000"></textarea></label><button class="btn primary">Отправить</button></form>`
        : `<p class="t-small t-2">${compact ? 'Комментировать могут резиденты клуба.' : ''}</p>`}`;
  }

  // ---------------------------------------------------------------- проекты, записи, лавка
  async function projects() {
    const list = await api('GET', '/api/projects'), me = S.me;
    const st = { 'идея': '', 'ищем людей': ' open', 'в работе': ' ok' };
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('projects', 'Проекты', 'Над чем работают резиденты и кого они ищут. За помощь проекту клуб начисляет кредиты и голос.')}
      <div class="grid g3">${list.map(p => `<div class="card"><span class="status${st[p.status] ?? ''}">${p.status.replace(/^./, c => c.toUpperCase())}</span><p class="t-card">${esc(p.title)}</p><p class="t-small t-2">${esc(p.about)}</p>
        <dl class="kv"><dt>Ведёт</dt><dd>${esc(p.owner_name)}</dd><dt>Нужны</dt><dd>${esc(p.need || '—')}</dd><dt>Взамен</dt><dd>${esc(p.give || '—')}</dd><dt>Команда</dt><dd>${esc(p.member_names.join(', '))}</dd></dl>
        <div class="actions">${p.members.includes(me.id) ? '<span class="status ok">Вы в команде</span>' : `<button class="btn" data-act="join" data-id="${p.id}">Помочь проекту</button>`}</div></div>`).join('') || '<p class="empty">Проектов пока нет.</p>'}</div>
      ${blockTitle('Новый проект')}${me.unlock.projects ? `<form class="form" data-form="project">
        <label class="field"><span>Название</span><input id="pj-title" name="title" required></label>
        <label class="field"><span>Что вы делаете</span><input id="pj-about" name="about"></label>
        <label class="field"><span>Кто нужен</span><input id="pj-need" name="need"></label>
        <label class="field"><span>Что даёте взамен</span><input id="pj-give" name="give"><small>Например: кредиты, имя в титрах, соавторство.</small></label>
        <div class="actions"><button class="btn primary">Добавить проект</button></div></form>`
        : lock(`Свой проект можно добавить, когда анкета заполнена полностью. Сейчас — ${me.progress}%.`, '<button class="btn primary" data-act="nav" data-to="">Продолжить анкету</button>')}</div></section>`;
  }
  async function records() {
    const list = await api('GET', '/api/media');
    const card = m => `<div class="card"><p class="t-cap t-2">${m.kind === 'set' ? 'Диджей-сет' : 'Лекция'}, ${m.date}, ${m.mins} мин</p><p class="speech">${esc(m.title)}</p><p class="t-small t-2">${esc(m.by)}</p>
      <div class="actions"><div class="player${S.playing === m.id ? ' on' : ''}"><button class="btn" data-act="play" data-id="${m.id}">${S.playing === m.id ? 'Пауза' : m.kind === 'set' ? 'Слушать' : 'Смотреть'}</button><div class="wave" aria-hidden="true"></div></div></div></div>`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('sets', 'Записи', 'Сеты и лекции, записанные в клубном доме. Бесплатно для всех: делитесь с друзьями.')}
      <div class="grid g3">${list.map(card).join('')}</div></div></section>`;
  }
  // Страница пригласительного: открыта без входа. Гость видит, кто его пригласил, и что даёт пригласительный.
  // Страница промокода организатора: гость видит встречу и цену по коду, регистрируется — код применяется сам.
  async function codePage(code) {
    const v = await api('GET', `/api/code/${encodeURIComponent(code || '')}`), me = S.me, u = dt(v.until), d = v.event ? dt(v.event.start) : null;
    const over = v.expired ? 'Срок промокода вышел.' : v.left <= 0 ? 'Входы по промокоду закончились.' : '';
    const cta = over ? `<p class="note">${over} Приходите гостем — вход ${rub(v.guest)}.</p>`
      : me && me.resident ? `<p class="t-small t-2">У вас клубная карта: вход и так по цене резидента. Промокод нужен гостям.</p>`
      : `<div class="actions"><button class="btn primary" data-act="codeaccept" data-code="${esc(v.code)}">${me ? 'Применить промокод' : 'Зарегистрироваться по промокоду'}</button></div>`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap"><article class="invite-card">
      <div class="inv-head"><span class="t-cap">Промокод · Клуб Коко</span><span class="t-cap">${esc(v.code)}</span></div>
      <div class="inv-body"><div class="code-price"><span class="t-cap">Вход по промокоду</span>${v.price == null ? `<b>${rub(v.prices[0])}</b><small>до ${S.cfg.entry.morning_until} — и на весь день</small><b>${rub(v.prices[1])}</b><small>после ${S.cfg.entry.morning_until}, напиток включён. Без кода — ${rub(v.guest)}</small>` : `<b>${v.price ? rub(v.price) : 'бесплатно'}</b><small>вместо ${rub(v.guest)}, напиток включён</small>`}</div><div class="stack">
        ${v.org ? `<p class="inv-to">${esc(v.org)} приглашает</p>` : ''}<h1 class="inv-title">${esc(v.event ? v.event.title : v.note || 'Вечер в клубе Коко')}</h1>
        ${d ? `<p class="t-small t-2">${d.wd}, ${d.d} ${d.mon} · ${d.t}</p>` : ''}
        <ul class="ticks"><li>Зарегистрируйтесь на сайте с этим промокодом — бронь откроется за 7 дней, как у резидента</li><li>Бронь вечера — с депозитом ${rub(v.deposit)}: из него ${rub(v.prices[1])} — вход, остальное вернётся на ваш счёт для бара</li><li>Если в тот же день оформите клубную карту, стоимость входа засчитается в её цену</li><li>Промокод действует до ${u.d} ${u.mon}</li></ul>
        ${cta}</div></div></article></div></section>`;
  }
  // Отчёт организатора по секретной ссылке: сколько гостей прошло по его коду и сколько ему причитается. Имён гостей нет.
  async function orgPage(token) {
    const v = await api('GET', `/api/org/${encodeURIComponent(token || '')}`), u = dt(v.until), e = v.event ? dt(v.event.start) : null;
    const tb = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="t-2">${empty}</td></tr>`}</tbody></table></div>`;
    return `<section class="band paper" style="padding-top:var(--s6)"><div class="wrap"><h1 class="t-page">Отчёт организатора</h1>
      <p class="lead" style="margin-bottom:var(--s5)">${esc(v.org || 'Организатор')} · промокод <b>${esc(v.code)}</b>${v.event ? ` · ${esc(v.event.title)}, ${e.d} ${e.mon}` : v.note ? ` · ${esc(v.note)}` : ''}</p>
      <div class="grid g3 org-stats">${[['Прошли по коду', `${v.used} из ${v.total}`], ['Осталось входов', v.left], ['Оплатили гости', rub(v.collected)]].map(([k, x]) => `<div class="card"><p class="t-cap t-2">${k}</p><p class="price">${x}</p></div>`).join('')}</div>
      <p class="t-small t-2" style="margin:var(--s4) 0 var(--s5)">Вход по коду — ${v.price == null ? `${rub(v.prices[0])} утром, ${rub(v.prices[1])} после ${S.cfg.entry.morning_until}` : v.price ? rub(v.price) : 'бесплатно'}. Код действует до ${u.d} ${u.mon}. Имён гостей здесь нет: клуб не передаёт их данные.</p>
      ${tb(['№', 'Когда', 'Оплачено'], v.uses.map(x => `<tr><td class="n">${x.n}</td><td>${dt(x.ts).d} ${dt(x.ts).mon} · ${dt(x.ts).t}</td><td class="n">${rub(x.price)}</td></tr>`), 'По коду пока никто не прошёл.')}
      ${v.payouts.length ? `<p class="t-cap t-2" style="margin-top:var(--s5)">Выплаты</p>${tb(['Когда', 'Сумма'], v.payouts.map(x => `<tr><td>${dt(x.ts).d} ${dt(x.ts).mon}</td><td class="n">${rub(x.amount)}</td></tr>`), '')}` : ''}</div></section>`;
  }
  // Предложить встречу может любой гость. Дальше — команда клуба, неделя голосования резидентов и расписание.
  const IDEA_KINDS = { study: 'Мастер-класс или учимся вместе', club: 'Клуб по интересам', lecture: 'Лекция', talk: 'Дискуссия', cinema: 'Показ', vinyl: 'Прослушивание', set: 'Живое выступление', projects: 'Свой проект' };
  const IDEA_SLOT = { morning: 'Утро, 10:00–13:00', evening: 'Вечер, 19:00–22:00', any: 'Утро или вечер' };
  // Вход по промокоду: своя цена или цена резидента по времени входа.
  const promoLine = p => p.price != null ? `один вход за ${rub(p.price)}` : `один вход по цене резидента: ${rub(S.cfg.entry.morning)} до ${S.cfg.entry.morning_until}, ${rub(S.cfg.entry.resident)} после`;
  const ideaState = i => i.status === 'new' ? '<span class="status">Команда смотрит</span>' : i.status === 'voting' ? `<span class="status open">На голосовании · за ${i.yes}, против ${i.no}</span>`
    : i.status === 'scheduled' ? '<span class="status ok">В расписании</span>' : `<span class="status">Отклонено${i.reason ? `: ${esc(i.reason)}` : ''}</span>`;
  async function hostPage() {
    const h = S.cfg.hosting, me = S.me, dr = S.ideaDraft || {}, mine = me ? (await api('GET', '/api/ideas')).mine : [];
    const when = dr.date ? (() => { const d = dt(dr.date + 'T10:00'); return `${d.wd}, ${d.d} ${d.mon}`; })() : '';
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('projects', 'Предложить встречу', h.lead)}
      <ol class="steps">${['Вы рассказываете о встрече', 'Команда клуба смотрит заявку — до трёх дней', 'Резиденты неделю голосуют «за» и «против»', 'Встреча попадает в расписание, вы получаете промокоды для своих гостей'].map(x => `<li>${x}</li>`).join('')}</ol>
      ${mine.length ? `${blockTitle('Ваши предложения')}<div class="ideas">${mine.map(i => `<div class="idea"><div class="between"><p class="t-card">${esc(i.title)}</p>${ideaState(i)}</div><p class="t-small t-2">${esc(i.kind_name)} · ${IDEA_SLOT[i.slot]}${i.series > 1 ? ` · ${i.series} встреч` : ''}${i.when ? ` · ${esc(i.when)}` : ''}</p></div>`).join('')}</div>` : ''}
      ${blockTitle('Заявка')}<form class="form wide" data-form="idea">
        <label class="field"><span>Как называется встреча</span><input name="title" required maxlength="120" placeholder="Учимся вместе: монтаж видео на телефоне"></label>
        <label class="field"><span>Что это</span><select name="kind">${Object.entries(IDEA_KINDS).map(([k, t]) => `<option value="${k}"${k === 'study' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Когда</span><select name="slot">${Object.entries(IDEA_SLOT).map(([k, t]) => `<option value="${k}"${k === (dr.slot || 'morning') ? ' selected' : ''}>${t}</option>`).join('')}</select><small>Утро свободнее: там проще найти место.</small></label>
        <label class="field"><span>Удобные дни</span><input name="when" maxlength="120" value="${esc(when)}" placeholder="по вторникам, или 24 ноября"></label>
        <label class="field"><span>Сколько встреч</span><select name="series">${[1, 2, 3, 4, 6, 8, 12].map(n => `<option value="${n}">${n === 1 ? 'Одна встреча' : `${n} встреч, раз в неделю`}</option>`).join('')}</select></label>
        <label class="field"><span>Кто ведёт</span><input name="host" maxlength="80" value="${me ? esc(me.name) : ''}"></label>
        <label class="field"><span>О встрече</span><textarea name="about" rows="4" maxlength="1200" placeholder="Что будет, для кого, что взять с собой. Если это видеокурс — какой и сколько уроков."></textarea></label>
        <label class="field"><span>Сколько своих гостей приведёте</span><input name="guests" inputmode="numeric" placeholder="0"><small>Им дадим промокоды: вход по цене резидента.</small></label>
        <label class="field"><span>Что нужно от клуба</span><input name="needs" maxlength="300" placeholder="Проектор, звук, столы"></label>
        ${me ? '' : `<label class="field"><span>Как вас зовут</span><input name="name" required maxlength="80"></label><label class="field"><span>Телефон или Telegram</span><input name="contact" required maxlength="80"></label>
        <label class="check"><input type="checkbox" name="pd" required> Согласен на обработку имени и контакта, чтобы клуб ответил на заявку</label>`}
        <div class="actions"><button class="btn primary">Отправить предложение</button></div></form>
      ${blockTitle('Как приходят ваши гости')}<div class="grid g3 host-ways">${h.ways.map(w => `<div class="card"><p class="t-card">${esc(w.name)}</p><p class="t-small">${esc(w.text)}</p><p class="t-small host-price">${esc(w.price)}</p></div>`).join('')}</div>
      ${blockTitle('Условия для всех')}<ul class="ticks" style="max-width:var(--measure)">${h.rules.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`;
  }
  async function invitePage(code) {
    const v = await api('GET', `/api/invite/${encodeURIComponent(code || '')}`), me = S.me, u = dt(v.until), by = v.by;
    const state = v.used ? 'Пригласительный уже использован.' : v.expired ? 'Срок пригласительного вышел.' : '';
    const mine = me && me.my_invites && me.my_invites.some(p => p.code === v.code);
    const cta = state ? `<p class="note">${state} Попросите резидента прислать новый или придите гостем.</p>`
      : mine ? `<p class="t-small t-2">Это ваш пригласительный. Отправьте гостю ссылку на эту страницу.</p><div class="actions"><button class="btn primary" data-act="invitecopy" data-code="${esc(v.code)}">Скопировать ссылку</button></div>`
      : me && me.resident ? '<p class="t-small t-2">У вас уже есть карта резидента — пригласительный нужен гостю.</p>'
      : `<div class="actions"><button class="btn primary" data-act="inviteaccept" data-code="${esc(v.code)}">Принять пригласительный</button></div>`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap"><article class="invite-card">
      <div class="inv-head"><span class="t-cap">Пригласительный · Клуб Коко</span><span class="t-cap">${esc(v.code)}</span></div>
      <div class="inv-body"><div class="inv-cover">${cover(by.cover)}</div><div class="stack">
        ${v.to ? `<p class="inv-to">${esc(v.to)},</p>` : ''}<h1 class="inv-title">вас приглашает ${esc(by.name)}</h1>
        <p class="t-small t-2">${by.tier ? `Резидент клуба с картой «${esc(by.tier)}»` : 'Резидент клуба'}${by.about.length ? ` · ${by.about.map(esc).join(' · ')}` : ''}</p>
        ${v.text ? `<blockquote class="inv-note">${esc(v.text)}</blockquote>` : ''}
        <ul class="ticks"><li>Один вечер в клубе бесплатно — любой из афиши</li><li>Бронь места как у резидента, за 7 дней</li><li>Действует до ${u.d} ${u.mon}</li><li>На входе покажите эту страницу</li></ul>
        ${cta}</div></div>
      ${v.events.length && !state ? `<div class="inv-events"><p class="t-cap t-2">Ближайшие вечера</p><ul>${v.events.map(e => { const d = dt(e.start); return `<li><b>${d.d} ${d.mon}, ${d.wd}</b> <span>${esc(e.title)}</span>${e.theme ? ` <span class="t-2">· ${esc(e.theme)}</span>` : ''}</li>`; }).join('')}</ul></div>` : ''}
      <p class="inv-foot t-cap">Культура · Музыка · Люди · Идеи</p></article></div></section>`;
  }
  async function shop() {
    const d = await api('GET', '/api/shop'), me = S.me;
    const NAMES = { vinyl: 'Винил с портретом — входит в карту' };
    const gifts = me.my_gifts || [];
    const online = me.online_until && new Date(me.online_until) > new Date() ? dt(me.online_until) : null;
    const items = d.products.filter(p => !(p.for === 'guest' && me.resident));
    const act = p => p.for === 'resident' && !me.resident ? '<span class="status">Только для резидентов</span>'
      : p.for === 'resident' && !me.unlock.cover ? `<span class="status">Нужна анкета на 100%, у вас ${me.progress}%</span>` : `<button class="btn" data-act="order" data-id="${p.id}">Заказать</button>`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap">${pageHead('shop', 'Лавка', me.resident ? 'Оплата — кредитами со счёта. Пластинку с портретом делаем только резидентам: обложку собираем по анкете, что записано на пластинке — не говорим.' : 'Оплата — кредитами со счёта. Пластинку с портретом делаем только резидентам.')}
      ${online ? `<p class="note" style="margin-bottom:var(--s6)">Доступ к записям открыт до ${online.d} ${online.mon}.</p>` : ''}
      <div class="grid g3">${items.map(p => `<div class="card"><p class="t-card">${esc(p.title)}</p><p class="price">${num(p.price)}<small>кредитов</small></p><p class="t-small t-2">${esc(p.about)}</p><div class="actions">${act(p)}</div></div>`).join('')}</div>
      ${blockTitle('Подарочная карта')}<div class="stack"><p class="lead">Кредиты на счёт получателя. Оплата рублями. Получатель вводит код в кабинете.</p>
        <div class="actions">${S.cfg.gift_amounts.map(n => `<button class="btn" data-act="gift" data-n="${n}">${rub(n)}</button>`).join('')}</div>
        <p class="lead">Клубную карту тоже можно подарить: получатель вводит код и становится резидентом.</p>
        <div class="actions">${['month', 'half', 'year'].map(k => `<button class="btn" data-act="gift" data-tier="${k}">Карта «${S.cfg.tiers[k].name}» · ${rub(S.cfg.tiers[k].price)}</button>`).join('')}</div>
        ${gifts.length ? `<div class="tw"><table><thead><tr><th>Код</th><th>Подарок</th><th>Статус</th></tr></thead><tbody>${gifts.map(g => `<tr><td><b>${esc(g.code)}</b></td><td>${g.tier ? `карта «${S.cfg.tiers[g.tier].name}»` : cr(g.amount)}</td><td>${g.used ? 'использована' : 'ждёт получателя'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
      ${d.orders.length ? `${blockTitle('Ваши заказы')}<div class="tw"><table><thead><tr><th>Заказ</th><th>Цена</th><th>Статус</th></tr></thead><tbody>${d.orders.map(o => `<tr><td>${esc(o.title || NAMES[o.product] || o.product)}</td><td class="n">${o.price ? num(o.price) : '—'}</td><td>${esc(o.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></section>`;
  }

  // ---------------------------------------------------------------- кабинет
  const eyeAttrs = on => `aria-pressed="${on}" aria-label="${on ? 'Поле видно резидентам. Скрыть' : 'Поле видит только команда. Показать резидентам'}" title="${on ? 'Видно резидентам' : 'Видит только команда'}"`;
  async function cabinet() { S.myOrders = ((await api('GET', '/api/orders/mine').catch(() => null)) || { orders: [] }).orders;
    const me = S.me, c = S.cfg, t = await api('GET', '/api/tx'), _r = S.residents = me.resident ? await api('GET', '/api/residents') : [], a = me.anketa, until = me.tier_until ? dt(me.tier_until) : null, hidden = me.hidden || [];
    const eye = f => f.k === 'alias' ? `<span class="eye fixed" title="Имя видно всегда">${EYE(true)}</span>` : `<button type="button" class="eye" data-act="eye" data-k="${f.k}" ${eyeAttrs(!hidden.includes(f.k))}>${EYE(!hidden.includes(f.k))}</button>`;
    const field = f => { const ctl = f.chips && !f.ph ? `<select id="an-${f.k}" name="${f.k}"><option value="">Не выбрано</option>${f.chips.map(o => `<option ${a[f.k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="an-${f.k}" name="${f.k}" value="${esc(a[f.k] || '')}" placeholder="${esc(f.ph || '')}">`;
      return `<div class="field"><label class="lbl" for="an-${f.k}">${esc(f.q)}</label><div class="with-eye">${ctl}${eye(f)}</div></div>`; };
    const inv = me.my_invites || [];
    return `<section class="band paper"><div class="wrap"><h1 class="t-page" style="margin-bottom:var(--s6)">Кабинет</h1>${offerHTML()}<div class="grid g2" style="align-items:start">
      <div class="member"><div class="between"><span style="width:130px">${wordmark()}</span><span class="status">${me.resident ? me.tier_name : 'Гость'}</span></div>
        <div class="rule"><i></i></div><p class="name">${esc(a.alias || me.name)}</p>${me.card_ended ? `<p class="t-small">Карта «${esc(c.tiers[me.tier].name)}» закончилась. Сама она не продлевается — продлите, если хотите остаться резидентом.</p>` : me.resident && me.days_left !== null && me.days_left <= 7 ? `<p class="t-small">Карта закончится через ${me.days_left} ${plural(me.days_left, 'день', 'дня', 'дней')}. Сама она не продлевается.</p>` : ''}
        <dl class="kv">${me.resident ? `<dt>Карта действует до</dt><dd>${until.d} ${until.mon} ${me.tier_until.slice(0, 4)}</dd><dt>Вход на вечер</dt><dd>${me.free_entry ? `без счёта, осталось ${me.free_left} из ${me.visits_cap} в этом месяце` : me.entries_left ? `из пакета, осталось визитов: ${me.entries_left}` : `${c.entry.resident} кредитов`}</dd><dt>Бронь</dt><dd>за ${me.window} дней</dd><dt>Голосов</dt><dd>${me.votes_left}${me.votes_left > me.votes_cap ? `: ${me.votes_cap} в месяц и ${me.votes_left - me.votes_cap} ${plural(me.votes_left - me.votes_cap, 'дополнительный', 'дополнительных', 'дополнительных')}` : ` из ${me.votes_cap} в этом месяце`}</dd><dt>Продление</dt><dd>вручную, карта не продлевается сама</dd>` : `<dt>Вход на вечер</dt><dd>${rub(c.entry.guest)}</dd><dt>Бронь</dt><dd>в день события</dd>`}<dt>Карта для входа</dt><dd>${me.nfc ? 'привязана' : 'не привязана'}</dd></dl>
        <div class="actions">${me.nfc ? '' : '<button class="btn" data-act="nfc">Привязать карту</button>'}<button class="btn${me.resident ? '' : ' primary'}" data-act="nav" data-to="join">${me.resident ? 'Продлить или сменить карту' : me.card_ended ? 'Продлить карту' : 'Стать резидентом'}</button></div></div>
      <div class="card"><p class="t-cap t-2">На счёте</p><p class="price">${num(me.balance)}<small>кредитов</small></p>
        <p class="t-small t-2">${me.resident ? 'Кредитами оплачиваются вход, бар, лекции, записи, книги и пластинки. Кредит равен рублю.' : 'Кредитами можно оплатить гостевой вход, записи и товары лавки. Кредит равен рублю.'}</p>
        ${me.promo ? `<p class="t-small">${me.promo.kind !== 'invite' ? `Промокод ${esc(me.promo.code)}: ${promoLine(me.promo)}${me.promo.event && me.promo.note ? ` на вечер «${esc(me.promo.note)}»` : ''}.` : `Пригласительный ${esc(me.promo.code)}: вход бесплатный.`}</p>` : ''}
        <p class="t-cap t-2">Пополнить счёт</p><div class="actions">${[1000, 5000, 10000, 25000].map(n => `<button class="btn small" data-act="topup" data-n="${n}">${num(n)} ₽</button>`).join('')}</div></div>
      ${me.resident ? `<div class="card"><div class="between"><p class="t-card">Анкета</p><span class="t-small t-2">${me.progress}% · ${level(me.progress)}</span></div>
        <div class="xp" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round(me.progress / 5) ? 'on' : ''}"></i>`).join('')}</div>
        <p class="t-small t-2">30% — бронь и голосования. 60% — картотека. 100% — свои предложения, проекты и пластинка с портретом.</p>
        <p class="t-small eye-help"><span class="eye fixed">${EYE(true)}</span><span>поле видно резидентам в картотеке</span><span class="eye fixed">${EYE(false)}</span><span>поле видит только команда клуба</span></p>
        <details class="fold"${me.progress < 30 ? ' open' : ''}><summary>${me.progress < 100 ? `Заполнить анкету: осталось ${S.cfg.anketa.filter(f => !(a[f.k] || '').trim()).length} ${plural(S.cfg.anketa.filter(f => !(a[f.k] || '').trim()).length, 'вопрос', 'вопроса', 'вопросов')}` : 'Изменить анкету'}</summary><form class="form wide" data-form="anketa">${c.anketa.map(field).join('')}<div class="actions"><button class="btn primary">Сохранить анкету</button><button type="button" class="btn" data-act="nav" data-to="">Заполнить с барменом</button></div></form></details></div>
      <div class="grid" style="align-content:start">
        <div class="card"><p class="t-card">Визиты</p><p class="price">${me.entries_left || 0}<small>${plural(me.entries_left || 0, 'визит', 'визита', 'визитов')} в пакете</small></p>
          <p class="t-small t-2">Визит — вход за ${num(c.entry.resident)}. В пакете каждый пятый бесплатно. Визиты тратятся при брони на вас и гостя и не сгорают, пока действует карта.</p>
          <div class="actions">${PACKS().map(p => `<button class="btn small" data-act="pack" data-k="${p.k}">${p.name} · ${num(p.price)}</button>`).join('')}</div>
          ${me.entries_left ? `<form class="form" data-form="give"><div class="field"><label class="lbl" for="give-to">Подарить визиты резиденту</label><select id="give-to" name="to" required><option value="">Выберите резидента</option>${(S.residents || []).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
            <div class="field"><label class="lbl" for="give-n">Сколько визитов</label><input id="give-n" name="n" type="number" min="1" max="${me.entries_left}" value="1"></div><div class="actions"><button class="btn">Подарить</button></div></form>` : ''}</div>
        <div class="card"><p class="t-card">Пригласительные</p><p class="price">${me.invites_left}<small>${plural(me.invites_left, 'пригласительный', 'пригласительных', 'пригласительных')} в запасе</small></p>
          <p class="t-small t-2">Гость по пригласительному проходит бесплатно. Пригласительные даются на срок карты и добавляются при продлении. Дополнительный можно купить: ${num(c.entry.resident)} кредитов или визит. У пригласительного своя страница с вашим именем. За нового гостя — дополнительный голос.</p>
          <form class="form" data-form="invite"><label class="field"><span>Для кого</span><input name="to" maxlength="60" placeholder="Имя гостя"></label>
            <label class="field"><span>Пара слов от вас</span><textarea name="text" rows="2" maxlength="280" placeholder="Например: приходи в пятницу на винил"></textarea></label>
            <div class="actions"><button class="btn primary">${me.invites_left ? 'Создать пригласительный · из запаса' : `Купить пригласительный · ${(me.entries_left || 0) >= 1 ? '1 визит' : cr(c.entry.resident)}`}</button></div></form>
          ${inv.length ? `<div class="tw"><table><thead><tr><th>Пригласительный</th><th>Для кого</th><th>Статус</th></tr></thead><tbody>${inv.map(p => `<tr><td><a href="#invite/${esc(p.code)}"><b>${esc(p.code)}</b></a></td><td>${esc(p.to || '—')}</td><td>${p.left ? `ждёт гостя до ${dt(p.until).d} ${dt(p.until).mon.slice(0, 3)}` : 'гость пришёл'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
        <div class="card"><p class="t-card">Ваша обложка</p>${a.alias ? `<div style="max-width:280px">${cover(a)}</div>` : '<p class="t-small t-2">Обложка появится, когда в анкете будет имя.</p>'}<p class="t-small t-2">Она стоит в картотеке и печатается на конверте пластинки.</p></div>` : `<div class="grid" style="align-content:start">${guestMath(t)}`}
        ${myOrdersHTML(S.myOrders || [])}
        <div class="card"><details class="fold"><summary class="t-card">Настройки, согласия и подарочный код</summary>
          ${me.resident ? `<label class="field"><span>Кто может вам писать</span><select data-set="dm">${[['known', 'Только те, с кем я знаком(а)'], ['all', 'Все резиденты'], ['none', 'Никто']].map(([v, t]) => `<option value="${v}" ${me.dm === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" data-set="show_plans" ${me.show_plans !== false ? 'checked' : ''}><span>Показывать в картотеке, на какие вечера я записан(а) — чтобы свои могли прийти вместе</span></label>` : ''}
          ${[['news', 'Получать новости и анонсы клуба'], ['photo', 'Разрешаю использовать фото и видео со мной в материалах клуба'], ['social', 'Разрешаю опубликовать мою карточку в соцсетях клуба']].map(([k, t]) => `<label class="check"><input type="checkbox" data-set="${k}" ${(me.consents || {})[k] ? 'checked' : ''}><span>${t}</span></label>`).join('')}
          <p class="t-small t-2">Согласие на обработку данных и правила клуба вы приняли ${(me.consents || {}).pd ? `${dt(me.consents.pd).d} ${dt(me.consents.pd).mon}` : 'при регистрации'}. Чтобы отозвать их, напишите в клуб: учётная запись и данные будут удалены.</p>
          <form class="form wide" data-form="gift"><label class="field"><span>Код подарочной карты</span><input name="code" autocomplete="off" required></label><div class="actions"><button class="btn">Зачислить на счёт</button></div></form></details></div>
        <div class="card"><div class="between"><p class="t-card">История счёта</p><button class="btn small" data-act="nav" data-to="history">Вся история</button></div>
          <ol class="ops compact">${t.slice(0, 4).map(opHTML).join('') || '<li class="empty">Операций пока нет.</li>'}</ol></div></div>
      </div></div></section>`;
  }
  // История счёта: что пришло (кредиты, визиты, пригласительные), что ушло и сколько заплачено деньгами.
  const MON_N = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const OP_KIND = { entry: 'Вход', guest: 'Гостевой вход', card: 'Клубная карта', topup: 'Пополнение', pack: 'Пакет визитов', invite: 'Пригласительный', shop: 'Лавка',
    gift: 'Подарочная карта', refund: 'Возврат', club: 'От клуба', noshow: 'Неявка', host: 'Ведущему' };
  const opIn = x => x.credits > 0 || x.days > 0 || x.inv > 0, opOut = x => x.credits < 0 || x.days < 0 || x.inv < 0;
  const signed = (n, one, few, many) => `${n > 0 ? '+' : '−'}${num(Math.abs(n))} ${plural(Math.abs(n), one, few, many)}`;
  function opHTML(x) {
    const d = new Date(x.ts), m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(x.note || ''), book = x.kind === 'entry' && /^Бронь/.test(x.note || '');
    const title = (m ? m[1] : x.note || '').replace(/^Бронь: /, ''), how = m ? m[2] : '';
    const parts = [x.credits ? `<span class="d${x.credits > 0 ? ' in' : ''}">${signed(x.credits, 'кредит', 'кредита', 'кредитов')}</span>` : '',
      x.days ? `<span class="d${x.days > 0 ? ' in' : ''}">${signed(x.days, 'визит', 'визита', 'визитов')}</span>` : '',
      x.inv ? `<span class="d${x.inv > 0 ? ' in' : ''}">${signed(x.inv, 'пригласительный', 'пригласительных', 'пригласительных')}</span>` : '',
      x.rub ? `<span class="d rub">${rub(x.rub)} ${x.via === 'касса' ? 'на кассе' : x.via || 'онлайн'}</span>` : ''].join('');
    return `<li class="op"><time class="op-date" datetime="${x.ts}"><b>${d.getDate()}</b><span>${MON[d.getMonth()].slice(0, 3)}, ${x.ts.slice(11, 16)}</span></time>
      <div class="op-main"><p class="op-kind">${book ? 'Бронь' : OP_KIND[x.kind] || 'Операция'}</p><p class="op-title">${esc(title)}</p>${how ? `<p class="op-how">${esc(how)}</p>` : ''}</div>
      <div class="op-amt">${parts || '<span class="d zero">без списания</span>'}${x.bal != null ? `<span class="op-after">на счёте ${num(x.bal)}${x.left ? ` · в пакете ${x.left}` : ''}</span>` : ''}</div></li>`;
  }
  async function historyPage(f = '') {
    const me = S.me, all = await api('GET', '/api/tx');
    const F = { '': ['Все', () => true], in: ['Пополнения', opIn], out: ['Списания', opOut], rub: ['Оплаты деньгами', x => x.rub > 0] }, k = F[f] ? f : '';
    const months = [];
    for (const x of all.filter(F[k][1])) { const key = x.ts.slice(0, 7); let g = months.find(m => m.key === key); if (!g) months.push(g = { key, ops: [] }); g.ops.push(x); }
    const sum = (ops, fn) => ops.reduce((a, x) => a + fn(x), 0);
    const both = (a, b, f = num) => [a ? '+' + f(a) : '', b ? '−' + f(-b) : ''].filter(Boolean).join(' / ');
    const total = ops => { const r = sum(ops, x => x.rub), ci = sum(ops, x => Math.max(0, x.credits)), co = sum(ops, x => Math.min(0, x.credits)), di = sum(ops, x => Math.max(0, x.days || 0)), dd = sum(ops, x => Math.min(0, x.days || 0));
      return [r ? `оплачено ${rub(r)}` : '', ci || co ? `кредиты ${both(ci, co)}` : '', di || dd ? `визиты ${both(di, dd)}` : ''].filter(Boolean).join(' · '); };
    const left = me.entries_left || 0, inv = me.invites_left || 0;
    return `<section class="band paper"><div class="wrap ledger">
      <button class="btn small" data-act="nav" data-to="cabinet">Кабинет</button>
      <h1 class="t-page">История счёта</h1>
      <p class="t-small t-2 lead">Что пришло на счёт и на что ушло: кредиты, визиты из пакета, пригласительные и оплаты деньгами. Кредит равен рублю.</p>
      <dl class="ledger-now"><div><dt>На счёте</dt><dd>${num(me.balance)}<small>${plural(me.balance, 'кредит', 'кредита', 'кредитов')}</small></dd></div>${me.resident ? `<div><dt>В пакете</dt><dd>${left}<small>${plural(left, 'визит', 'визита', 'визитов')}</small></dd></div><div><dt>В запасе</dt><dd>${inv}<small>${plural(inv, 'пригласительный', 'пригласительных', 'пригласительных')}</small></dd></div>` : ''}</dl>
      <div class="tabs" role="tablist" aria-label="Какие операции показать">${Object.entries(F).map(([key, [t]]) => `<button class="tab" role="tab" aria-selected="${key === k}" data-act="nav" data-to="history${key ? '/' + key : ''}">${t}</button>`).join('')}</div>
      ${months.map(g => { const [y, mo] = g.key.split('-'); return `<div class="ledger-month"><div class="between"><h2 class="t-block">${MON_N[+mo - 1]} ${y}</h2><p class="t-small t-2">${total(g.ops)}</p></div><ol class="ops">${g.ops.map(opHTML).join('')}</ol></div>`; }).join('')
        || `<p class="empty">${k ? 'Таких операций пока нет.' : 'Операций пока нет. Пополнить счёт или купить пакет визитов можно в кабинете.'}</p>`}
    </div></section>`;
  }
  // Гостю в кабинете — живой расчёт: сколько он заплатил за свои вечера и сколько заплатил бы резидент.
  // Гостю в кабинете — сколько раз он был и что изменится с картой: вход со входом, карта отдельно.
  function guestMath(t) { const c = S.cfg, e = c.entry, n = t.filter(x => x.kind === 'guest').length;
    return `<div class="card"><p class="t-card">${n ? `Вы были у нас ${n} ${plural(n, 'раз', 'раза', 'раз')}` : 'Клубная карта'}</p>
      <p class="t-small">С картой вход стоит ${rub(e.morning)} до ${e.morning_until} и ${rub(e.resident)} после — вместо ${rub(e.guest)}. Бронь за ${c.booking.window} дней, пригласительные, голос за программу. Карта — от ${rub(c.tiers.month.price)} в месяц.</p>
      <p class="t-small t-2">Пришли сегодня гостем — оформите карту сегодня же, и стоимость входа засчитаем в её цену.</p>
      <div class="actions"><button class="btn primary" data-act="nav" data-to="join">Выбрать карту</button></div></div>`; }

  // ---------------------------------------------------------------- админка
  // Админка по вкладкам: сегодня (вход), расписание (события и серии), заявки (предложения встреч), организаторы, участники, деньги.
  const EV_KINDS = [['lecture', 'Лекция'], ['talk', 'Дискуссия'], ['study', 'Мастер-класс, учимся вместе'], ['club', 'Клуб по интересам'], ['cinema', 'Показ'], ['vinyl', 'Прослушивание'], ['set', 'Живое выступление'], ['projects', 'Проекты'], ['secret', 'Вечер резидентов']];
  async function admin() {
    const o = await api('GET', '/api/admin/overview'), c = S.cfg, tab = S.admTab || 'today', users = o.users;
    const opts = (sel, empty) => `${empty ? `<option value="">${empty}</option>` : ''}${users.map(u => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}${u.resident ? '' : ' — гость'}</option>`).join('')}`;
    const table = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="t-2">${empty}</td></tr>`}</tbody></table></div>`;
    const fresh = o.ideas.filter(i => i.status === 'new').length, now = new Date().toISOString().slice(0, 16), today = dayKey(new Date());
    const TABS = [['today', 'Сегодня'], ['schedule', 'Расписание'], ['ideas', `Заявки${fresh ? ` · ${fresh}` : ''}`], ['orgs', 'Организаторы'], ['ratings', 'Оценки'], ['team', 'Команда'], ['people', 'Участники'], ['money', 'Деньги']];
    const sd = o.schedule, when = e => { const d = dt(e.start); return `${d.d} ${d.mon.slice(0, 3)}, ${WDS[(new Date(e.start).getDay() + 6) % 7]} · ${d.t}`; };
    let body = '';
    if (tab === 'today') {
      const tday = sd.filter(e => e.start.slice(0, 10) === today);
      body = `<div class="grid g4">${[['Резидентов', o.residents], ['Гостей в базе', o.guests], ['Кредитов на счетах', num(o.balances)], ['Выручка сегодня, ₽', num(o.rub_today)]].map(([l, v]) => `<div class="card tile"><b>${v}</b><span class="t-small t-2">${l}</span></div>`).join('')}</div>
        ${o.reports && o.reports.length ? `<div class="card" style="margin-top:var(--s5)"><p class="t-card">Жалобы на сообщения</p>${o.reports.map(r => `<div class="between"><span class="t-small">${esc(r.by)}: «${esc(r.text)}»</span><span class="actions"><button class="btn small" data-act="openthread" data-id="${r.thread}">Открыть ветку</button><button class="btn small" data-act="hide" data-id="${r.msg}">Скрыть</button></span></div>`).join('')}</div>` : ''}
        <div class="grid g2" style="margin-top:var(--s5)">
        <div class="card"><p class="t-card">Вход по карте</p><p class="t-small t-2">Цена — по времени входа: резидент ${cr(c.entry.morning)} до ${c.entry.morning_until} и ${cr(c.entry.resident)} после, гость ${rub(c.entry.guest)}. В прототипе выберите участника.</p>
          <form class="form wide" data-form="checkin"><label class="field"><span>Участник</span><select id="ci-user" name="user">${opts()}</select></label>
            <label class="field"><span>Когда пришёл</span><select id="ci-mode" name="mode"><option value="">На программу</option><option value="day">Днём, без программы: первые полчаса бесплатно</option></select></label>
            <div class="actions"><button class="btn primary">Отметить вход</button></div></form><p id="ci-out" class="t-card" aria-live="polite"></p>
          ${o.balcony_today.length ? `<p class="t-cap t-2">Сегодня ждём на балконе</p>${o.balcony_today.map(v => `<div class="between"><span>${esc(v.name)}: ${esc(v.spot.toLowerCase())}</span><button class="btn small" data-act="noshow" data-id="${v.id}">Не пришёл: освободить посадку</button></div>`).join('')}` : ''}
          ${o.visits.length ? `<p class="t-cap t-2">Сейчас с песочными часами</p>${o.visits.map(v => `<div class="between"><span>${esc(v.name)}, с ${v.ts.slice(11, 16)}</span><span class="actions"><button class="btn small" data-act="visit" data-id="${v.id}" data-stay="1">Остался: списать вход</button><button class="btn small" data-act="visit" data-id="${v.id}">Ушёл</button></span></div>`).join('')}` : ''}</div>
        <div class="card"><p class="t-card">Сегодня в клубе</p>${tday.length ? `<ul class="mini">${tday.map(e => `<li><span class="mini-d">${e.start.slice(11, 16)}</span><span><b>${esc(e.title)}</b><small>${e.host ? `ведёт ${esc(e.host)} · ` : ''}записано ${e.booked} из ${c.seats.hall}</small></span></li>`).join('')}</ul>` : '<p class="empty">Сегодня событий нет.</p>'}
          ${fresh ? `<p class="t-small">Новых заявок на встречи: ${fresh}. <button class="link" data-act="atab" data-k="ideas">Посмотреть</button></p>` : ''}</div></div>`;
    }
    if (tab === 'today') body += orderFormHTML(users);
    if (tab === 'ratings') body = ratingsHTML(await api('GET', '/api/admin/ratings'), true);
    if (tab === 'team') body = teamHTML(await api('GET', '/api/team'));
    if (tab === 'schedule') {
      const dr = S.admDraft || {}, by = {}; sd.forEach(e => { (by[e.start.slice(0, 10)] = by[e.start.slice(0, 10)] || {})[e.start.slice(11, 16) < c.entry.morning_until ? 'morning' : 'evening'] = e; });
      const start = monday(new Date()), cells = Array.from({ length: 35 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); const k = dayKey(d), x = by[k] || {}, past = k < today;
        const bar = sl => x[sl] ? `<button class="mb ${sl}" data-act="evedit" data-id="${x[sl].id}" title="${esc(x[sl].title)}">${esc(x[sl].title)}</button>` : past ? `<span class="mb ${sl} none"></span>` : `<button class="mb ${sl} add" data-act="evnew" data-date="${k}" data-slot="${sl}" aria-label="${d.getDate()} ${MON[d.getMonth()]}, ${sl === 'morning' ? 'утро' : 'вечер'}: добавить событие">+ ${sl === 'morning' ? 'утро' : 'вечер'}</button>`;
        return `<div class="mc${past ? ' past' : ''}${k === today ? ' is-today' : ''}"><span class="mc-d">${d.getDate()}${d.getDate() === 1 || i === 0 ? ` <small>${MON[d.getMonth()].slice(0, 3)}</small>` : ''}</span>${bar('morning')}${bar('evening')}</div>`; }).join('');
      const ed = S.admEdit && sd.find(e => e.id === S.admEdit);
      const form = ed ? `<form class="form wide" data-form="editevent" data-id="${ed.id}"><p class="t-card">Изменить: ${esc(ed.title)}</p>
          <label class="field"><span>Название</span><input name="title" value="${esc(ed.title)}" required></label><label class="field"><span>Ведёт</span><input name="host" value="${esc(ed.host || '')}"></label>
          <label class="field"><span>Дата</span><input type="date" name="date" value="${ed.start.slice(0, 10)}"></label><label class="field"><span>Начало</span><input type="time" name="time" value="${ed.start.slice(11, 16)}"></label>
          <label class="field"><span>Доплата резидента, кредитов</span><input name="extra" inputmode="numeric" value="${ed.extra || 0}"></label><label class="field"><span>Доплата гостя, ₽</span><input name="extra_guest" inputmode="numeric" value="${ed.extra_guest ?? ed.extra ?? 0}"></label>
          <label class="field span2"><span>Описание</span><input name="note" value="${esc(ed.note || '')}"></label>
          <div class="actions"><button class="btn primary">Сохранить</button><button type="button" class="btn" data-act="evcancel" data-id="${ed.id}">Отменить событие</button><button type="button" class="link" data-act="evclose">Закрыть</button></div></form>`
        : `<form class="form wide" data-form="newevent">${dr.idea ? '' : `<p class="t-card">Новое событие${dr.date ? `: ${dt(dr.date + 'T10:00').d} ${dt(dr.date + 'T10:00').mon}, ${dr.slot === 'morning' ? 'утро' : 'вечер'}` : ''}</p>`}${dr.idea ? `<input type="hidden" name="idea" value="${dr.idea}"><p class="note span2">По заявке: «${esc(dr.title)}» от ${esc(dr.name)}${dr.contact ? `, ${esc(dr.contact)}` : ''}. ${esc(dr.when || '')}</p>` : ''}
          <label class="field"><span>Название</span><input name="title" required value="${esc(dr.title || '')}" placeholder="Учимся вместе: композиция в фотографии"></label>
          <label class="field"><span>Формат</span><select name="kind">${EV_KINDS.map(([k, t]) => `<option value="${k}"${k === (dr.kind || 'lecture') ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>Дата первой встречи</span><input type="date" name="date" required value="${dr.date || ''}"></label>
          <label class="field"><span>Часть дня</span><select name="slot"><option value="morning"${dr.slot === 'morning' ? ' selected' : ''}>Утро, 10:00–13:00</option><option value="evening"${dr.slot !== 'morning' ? ' selected' : ''}>Вечер, 19:00–22:00</option></select></label>
          <label class="field"><span>Начало</span><input type="time" name="time" placeholder="по умолчанию 10:30 или 19:00"><small>Пусто — 10:30 утром, 19:00 вечером.</small></label>
          <label class="field"><span>Сколько встреч, раз в неделю</span><input name="repeat" inputmode="numeric" value="${dr.series || 1}"></label>
          <label class="field"><span>Ведущий из клуба</span><select name="host_user">${opts(dr.by, 'Не из клуба — впишите имя ниже')}</select></label>
          <label class="field"><span>Или имя ведущего</span><input name="host" value="${esc(dr.by ? '' : dr.host || '')}"></label>
          <label class="field span2"><span>Описание</span><input name="note" value="${esc(dr.about ? dr.about.slice(0, 300) : '')}"></label>
          <label class="field"><span>Доплата резидента, кредитов</span><input name="extra" inputmode="numeric" value="0"><small>Для вечера по отдельной цене, например со спикером.</small></label>
          <label class="field"><span>Доплата гостя, ₽</span><input name="extra_guest" inputmode="numeric" value="0"><small>Обычно больше, чем у резидента.</small></label>
          <label class="field"><span>Организатор</span><input name="org" value="${esc(dr.idea && dr.guests ? dr.host || dr.name : '')}" placeholder="Книжный клуб «Страницы»"><small>Если он ведёт своих гостей.</small></label>
          <label class="field"><span>Промокодов для его гостей</span><input name="quota" inputmode="numeric" value="${dr.guests || 0}"><small>Вход по цене резидента: утром ${num(c.entry.morning)}, после ${c.entry.morning_until} — ${num(c.entry.resident)}.</small></label>
          <label class="field"><span>Контакт организатора</span><input name="contact" value="${esc(dr.contact || '')}"></label>
          <label class="check"><input type="checkbox" name="residents_only"> Только для резидентов</label>
          <div class="actions span2"><button class="btn primary">Поставить в расписание</button>${dr.idea ? '<button type="button" class="link" data-act="evclose">Очистить</button>' : ''}</div></form>`;
      const up = sd.filter(e => e.start >= now), past = sd.filter(e => e.start < now).reverse();
      body = `<div class="grid g2 sched"><div><p class="t-small t-2">Пять недель: сверху утро, снизу вечер. Свободный слот — кнопка «+», занятый открывает правку.</p><div class="month adm">${WDS.map(w => `<span class="mw">${w}</span>`).join('')}${cells}</div></div>
        <div class="card" id="evform">${form}</div></div>
        ${blockTitle('Ближайшие события')}${table(['Когда', 'Событие', 'Ведёт', 'Записано', 'Промокод', ''], up.map(e => `<tr><td class="n">${when(e)}</td><td>${esc(e.title)}${e.residents_only ? '<br><span class="t-2">только резиденты</span>' : ''}${e.extra || e.extra_guest ? `<br><span class="t-2">доплата: гость +${e.extra_guest ?? e.extra}, резидент +${e.extra}</span>` : ''}</td><td>${esc(e.host || '—')}</td><td class="n">${e.booked}</td><td>${e.promo ? `<b>${esc(e.promo)}</b>` : '—'}</td><td><button class="btn small" data-act="evedit" data-id="${e.id}">Изменить</button></td></tr>`), 'Событий нет.')}
        ${blockTitle('Прошедшие: подарок ведущему')}<p class="t-small t-2" style="max-width:var(--measure)">${esc(c.host_note)}</p>${table(['Когда', 'Событие', 'Ведёт', 'Подарок'], past.filter(e => e.host).map(e => `<tr><td class="n">${when(e)}</td><td>${esc(e.title)}</td><td>${esc(e.host)}</td><td>${e.gift ? `Подарено: ${esc(e.gift.name.toLowerCase())}` : `<span class="gift-pick"><select aria-label="Подарок ведущему" id="gift-${e.id}">${c.host_gifts.map(g => `<option value="${g.k}">${esc(g.name)}</option>`).join('')}</select><button class="btn small" data-act="evgift" data-id="${e.id}">Подарить</button></span>`}</td></tr>`), 'За две недели встреч с ведущими не было.')}
        <ul class="ticks" style="max-width:var(--measure);margin-top:var(--s4)">${c.host_gifts.map(g => `<li><b>${esc(g.name)}.</b> ${esc(g.text)}</li>`).join('')}</ul>`;
    }
    if (tab === 'ideas') {
      const card = i => `<article class="idea adm"><div class="between"><span class="t-cap t-2">${esc(i.kind_name)} · ${IDEA_SLOT[i.slot]}${i.series > 1 ? ` · ${i.series} встреч` : ''} · пришла ${dt(i.ts).d} ${dt(i.ts).mon.slice(0, 3)}</span>${ideaState(i)}</div>
        <p class="t-card">${esc(i.title)}</p><dl class="kv"><dt>Ведёт</dt><dd>${esc(i.host || i.name)}</dd><dt>Контакт</dt><dd>${esc(i.name)}${i.contact ? `, ${esc(i.contact)}` : i.by ? ', участник клуба' : ''}</dd>${i.when ? `<dt>Когда удобно</dt><dd>${esc(i.when)}</dd>` : ''}<dt>Своих гостей</dt><dd>${i.guests || '—'}</dd>${i.needs ? `<dt>Нужно</dt><dd>${esc(i.needs)}</dd>` : ''}</dl>
        ${i.about ? `<p class="t-small">${esc(i.about)}</p>` : ''}${i.status === 'voting' ? `<div class="yn"><span class="yn-bar"><i style="width:${i.yes + i.no ? Math.round(100 * i.yes / (i.yes + i.no)) : 0}%"></i></span><span class="t-small">за ${i.yes} · против ${i.no}</span></div>` : ''}
        <div class="actions">${i.status === 'new' ? `<button class="btn small primary" data-act="ideact" data-id="${i.id}" data-a="vote">На голосование</button>` : ''}${['new', 'voting'].includes(i.status) ? `<button class="btn small${i.status === 'voting' ? ' primary' : ''}" data-act="ideasched" data-id="${i.id}">${i.status === 'new' ? 'Сразу в расписание' : 'Поставить в расписание'}</button><button class="btn small" data-act="idereject" data-id="${i.id}">Отклонить</button>` : ''}${i.status === 'rejected' ? `<button class="btn small" data-act="ideact" data-id="${i.id}" data-a="new">Вернуть в новые</button>` : ''}</div></article>`;
      const g = st => o.ideas.filter(i => st.includes(i.status));
      body = `<p class="lead" style="max-width:var(--measure)">Заявки на встречи от гостей и резидентов. Подходит — на голосование на неделю. Свои клубные встречи и срочное можно сразу ставить в расписание.</p>
        ${blockTitle(`Новые · ${g(['new']).length}`)}<div class="ideas">${g(['new']).map(card).join('') || '<p class="empty">Новых заявок нет.</p>'}</div>
        ${blockTitle(`На голосовании · ${g(['voting']).length}`)}<div class="ideas">${g(['voting']).map(card).join('') || '<p class="empty">Сейчас ничего не голосуется.</p>'}</div>
        ${blockTitle('Решённые')}<div class="ideas">${g(['scheduled', 'rejected']).map(card).join('') || '<p class="empty">Пока пусто.</p>'}</div>`;
    }
    if (tab === 'orgs') body = `<div class="card"><p class="t-card">Промокоды организаторов</p><p class="t-small t-2">Гости организатора проходят по коду по цене резидента: утром ${rub(c.entry.morning)}, после ${c.entry.morning_until} — ${rub(c.entry.resident)}. Вечернюю бронь по коду гость делает с депозитом ${rub(c.booking.deposit)}: разница возвращается ему на счёт для бара. Организатору клуб не платит.</p>
          ${table(['Код', 'Организатор и встреча', 'Вход', 'Прошли', 'Собрано', 'Ссылки'], o.promos.filter(p => p.kind !== 'invite').map(p => `<tr><td><b>${esc(p.code)}</b><br><span class="t-2">до ${dt(p.until).d} ${dt(p.until).mon.slice(0, 3)}</span></td><td>${esc(p.org || 'клуб')}${p.contact ? ` · ${esc(p.contact)}` : ''}${p.note ? `<br><span class="t-2">${esc(p.note)}</span>` : ''}</td><td class="n">${p.price == null ? `${num(p.prices[0])} / ${num(p.prices[1])}` : rub(p.price)}</td><td class="n">${p.used} из ${p.total}</td><td class="n">${rub(p.collected)}${p.prepaid ? `<br><span class="t-2">предоплата ${rub(p.prepaid)}</span>` : ''}</td><td><button class="link" data-act="copylink" data-path="code/${esc(p.code)}">для гостей</button>${p.org && p.token ? `<br><button class="link" data-act="copylink" data-path="org/${esc(p.token)}">отчёт организатору</button>` : ''}</td></tr>`), 'Промокодов нет.')}
          <form class="form wide" data-form="newpromo"><label class="field"><span>Организатор</span><input name="org" placeholder="Книжный клуб «Страницы»"><small>Пусто — промокод клуба.</small></label>
            <label class="field"><span>Контакт организатора</span><input name="contact" placeholder="@telegram или телефон"></label>
            <label class="field"><span>Встреча</span><select name="event"><option value="">Без привязки к событию</option>${(o.events_next || []).map(e => `<option value="${e.id}">${dt(e.start).d} ${dt(e.start).mon.slice(0, 3)} · ${e.start.slice(11, 16)} · ${esc(e.title)}</option>`).join('')}</select><small>Код действует до конца дня встречи.</small></label>
            <label class="field"><span>Промокод</span><input name="code" placeholder="KNIGI-15"><small>Пусто — придумаем сами.</small></label>
            <label class="field"><span>Вход по коду, ₽</span><input name="price" inputmode="numeric" placeholder="по времени: ${c.entry.morning} / ${c.entry.resident}"><small>Пусто — цена резидента в это время.</small></label>
            <label class="field"><span>Сколько входов</span><input name="total" value="${c.org.uses}" inputmode="numeric"></label>
            <label class="field"><span>Сколько дней действует</span><input name="days" value="${c.org.days}" inputmode="numeric"><small>Если встреча не выбрана.</small></label>
            <label class="field"><span>Предоплата организатора, ₽</span><input name="prepaid" value="0" inputmode="numeric"><small>Если он выкупил места для гостей.</small></label>
            <label class="field"><span>Описание для гостей</span><input name="note" placeholder="Книжный клуб, суббота"></label><div class="actions"><button class="btn primary">Создать промокод</button></div></form></div>`;
    if (tab === 'people') body = `${table(['Имя', 'Карта', 'Счёт', 'Визитов в пакете', 'Анкета', 'Карта для входа'], users.map(u => `<tr><td>${esc(u.name)}</td><td>${u.resident ? c.tiers[u.tier].name : 'гость'}</td><td class="n">${num(u.balance)}</td><td class="n">${u.entries_left || '—'}</td><td class="n">${u.progress}%</td><td>${u.nfc ? 'привязана' : '—'}</td></tr>`), 'Участников нет.')}
        <div class="card" style="margin-top:var(--s5)"><p class="t-card">Кредиты от клуба</p><p class="t-small t-2">Компенсация или благодарность за помощь клубу. Ведущим не платим — им клуб дарит подарок во вкладке «Расписание».</p>
          <form class="form wide" data-form="credit"><label class="field"><span>Кому</span><select id="cr-user" name="user">${opts()}</select></label>
            <label class="field"><span>Сумма, кредитов</span><input id="cr-a" name="amount" inputmode="numeric"></label>
            <label class="field"><span>Голосов</span><input id="cr-v" name="votes" inputmode="numeric" value="0"><small>Дополнительный голос тратится один раз.</small></label>
            <label class="field"><span>За что</span><input id="cr-n" name="note" placeholder="Помощь с вечером 14 ноября"></label><div class="actions"><button class="btn primary">Начислить</button></div></form></div>`;
    if (tab === 'money') body = `<div class="grid g2"><div class="card"><p class="t-card">Откуда приходят</p><dl class="kv">${Object.entries(o.sources).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
        <div class="card"><p class="t-card">Карты</p><dl class="kv">${Object.entries(o.by_tier).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="actions"><button class="btn" data-act="reset">Сбросить демо-данные</button></div></div></div>
        ${blockTitle('Последние операции')}${table(['Дата', 'Операция', 'Кредиты', 'Рубли'], o.tx.map(x => { const d = dt(x.ts); return `<tr><td class="n">${d.d} ${d.mon.slice(0, 3)}, ${d.t}</td><td>${esc(x.note)}</td><td class="n">${x.credits ? num(x.credits) : ''}</td><td class="n">${x.rub ? num(x.rub) : ''}</td></tr>`; }), 'Операций нет.')}
        ${blockTitle('Заказы пластинок')}${table(['Кто', 'Что', 'Статус'], o.orders.map(x => `<tr><td>${esc((users.find(u => u.id === x.user) || {}).name || '')}</td><td>${esc(x.title || x.product)}</td><td>${esc(x.status)}</td></tr>`), 'Заказов нет.')}`;
    return `<section class="band" style="padding-top:var(--s6)"><div class="wrap"><h1 class="t-page">Админка</h1>
      <div class="tabs adm-tabs" role="tablist" aria-label="Разделы админки">${TABS.map(([k, t]) => `<button class="tab" role="tab" aria-selected="${k === tab}" data-act="atab" data-k="${k}">${t}</button>`).join('')}</div>${body}</div></section>`;
  }

  // ---------------------------------------------------------------- действия
  const pay = (what, sum, credits) => new Promise(res => { modal(`<h2 class="t-block">${credits ? 'Оплата кредитами' : 'Оплата'}</h2><p>${esc(what)}</p><p class="price">${credits ? cr(sum) : rub(sum)}</p>
    <p class="t-small t-2">${credits ? 'Спишем кредиты с вашего счёта в клубе.' : 'Здесь будет оплата через Т-Кассу. В прототипе платёж проходит сразу.'}</p>
    <div class="actions"><button class="btn primary" data-act="payok">${credits ? 'Списать кредиты' : 'Оплатить'}</button><button class="btn" data-act="payno">Отменить</button></div>`); pay.done = ok => { closeModal(); res(ok); }; });
  const A = {
    home: () => go(''), nav: el => { closeModal(); go(el.dataset.to); }, close: closeModal,
    faq: el => { const open = el.getAttribute('aria-expanded') === 'true', panel = document.getElementById(el.getAttribute('aria-controls'));
      el.setAttribute('aria-expanded', String(!open)); panel.hidden = open; },
    more: () => { const me = S.me, tab = navTab(me).map(([r]) => r), all = [...navMain(me), ...navMore(me)].filter(([r], i, a) => !tab.includes(r) && a.findIndex(([x]) => x === r) === i);
      modal(`<h2 class="t-block">Разделы</h2><nav class="sheet-nav" aria-label="Все разделы">${all.map(([r, t]) => `<a href="#${r}" data-act="nav" data-to="${r}">${t}${navBadge(r)}</a>`).join('')}</nav><div class="actions">${me ? '<button class="btn" data-act="logout">Выйти</button>' : '<button class="btn primary" data-act="login">Войти</button>'}<button class="btn" data-act="close">Закрыть</button></div>`); },
    tune: el => tune(el.closest('[data-tuner]'), +el.dataset.m), tunenow: el => tune(el.closest('[data-tuner]'), 0, true),
    flip: el => { const c = el.closest('[data-flip]'), on = !c.classList.contains('flipped'), fr = c.querySelector('.mc-front'), bk = c.querySelector('.mc-back');
      c.classList.toggle('flipped', on); fr.inert = on; bk.inert = !on; c.querySelectorAll('.mc-flip').forEach(b => b.setAttribute('aria-expanded', on));
      (on ? bk.querySelector('.mc-flip') : fr.querySelector('.mc-flip')).focus({ preventScroll: true }); },
    needres: el => A.resprice(el), payok: () => pay.done(true), payno: () => pay.done(false),
    scroll: el => { const t = document.getElementById(el.dataset.to); if (!t) { closeModal(); return go(S.me && !S.me.resident ? '' : el.dataset.to === 'afisha' ? 'afisha' : ''); } t.closest('details') && (t.closest('details').open = true); t && t.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }); },
    login: el => loginModal(el.dataset.tab), logout: () => { closeModal(); S.me = S.token = null; S.shownBal = null; S.wantTier = null; store.set('koko-token-' + S.mode, null); S.chat = []; go(''); },
    demo: async el => { const r = await call('POST', '/api/auth/login', { user: el.dataset.id }); if (r) { S.wantTier = null; setSession(r); } },
    oauth: async el => { const f = $('.modal form'); if (!f.consent_pd.checked || !f.consent_rules.checked) return toast('Сначала отметьте согласие на обработку данных и правила клуба.');
      const r = await call('POST', '/api/auth/register', { name: 'Гость через ' + el.dataset.p, provider: el.dataset.p, consent_pd: 1, consent_rules: 1, consent_news: f.consent_news.checked ? 1 : 0 }); if (r) { setSession(r); afterAuth(); } },
    pop: () => { S.pop = !S.pop; draw(); },
    chip: el => Bar.handle(el.dataset.t), skip: () => Bar.skip(),
    day: async el => { S.day = el.dataset.id; const p = $('[data-event]'); if (!p) return draw();
      const list = S.me ? await api('GET', '/api/events') : S.pub.events, e = list.find(x => x.id === S.day); if (!e) return; S.calEvs = list;
      p.innerHTML = dayDetail(e); $$('.slot[aria-pressed]').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === S.day));
      if (!el.closest('.wk-detail')) p.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: innerWidth < 900 ? 'start' : 'nearest' }); },
    wk: el => { S.wk = Math.max(0, Math.min(4, (S.wk || 0) + +el.dataset.d)); const box = $('[data-cal]'); if (box) box.outerHTML = calendar(S.calEvs || []); },
    calmonth: () => modal(monthHTML(), true),
    pickday: el => { S.day = el.dataset.id; S.wk = null; closeModal(); const box = $('[data-cal]'); if (!box) return draw(); box.outerHTML = calendar(S.calEvs || []);
      const d = $('[data-event]'); d && d.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); },
    // Событие из билета или строки афиши: на странице с календарём — выбрать его там, иначе открыть афишу на этом событии.
    cvslide: el => cvShow(+el.dataset.i),
    rate: el => rateModal(el.dataset.id),
    rateskip: async el => { if (await call('POST', `/api/orders/${el.dataset.id}/rate`, { skip: true })) { closeModal(); setMe(await api('GET', '/api/me')); draw(); } },
    ttab: el => { S.teamTab = el.dataset.k; draw(); },
    tocouncil: async el => { const r = await call('POST', '/api/admin/council', { item: el.dataset.item }); if (r) { toast(r.text); draw(); } },
    cvote: async el => { if (await call('POST', `/api/council/${el.dataset.id}/vote`, { choice: el.dataset.k })) { toast('Голос учтён. Передумать можно, пока вопрос открыт.'); S.scrollTo = '#council'; draw(); } },
    mwant: async el => { const r = await call('POST', `/api/council/wishes/${el.dataset.id}/want`); if (r) { toast(r.mine ? 'Отметили: вы хотите попробовать.' : 'Сняли отметку.'); S.scrollTo = '#council'; draw(); } },
    mwdone: async el => { const r = await call('POST', `/api/admin/council/wishes/${el.dataset.id}/done`); if (r) { toast(r.text); S.scrollTo = '#council'; draw(); } },
    givecard: el => { const c = el.dataset.color, rs = (S.cfg.cards.reasons[c] || []);
      modal(`<h2 class="t-card"><i class="cd ${c}"></i> ${CARD_T[c]} карточка — ${esc(el.dataset.name)}</h2>
        <form class="form" data-form="givecard"><input type="hidden" name="staff" value="${el.dataset.staff}"><input type="hidden" name="color" value="${c}">
          <label class="field"><span>Причина</span><select name="reason" required><option value="">Выберите</option>${rs.map(r => `<option>${esc(r)}</option>`).join('')}<option value="__own">Другая — напишу сам</option></select></label>
          <label class="field"><span>Своя причина</span><input name="own" maxlength="120" placeholder="Если нет в списке"></label>
          <label class="field"><span>Что именно произошло</span><textarea name="note" rows="3" maxlength="300" placeholder="Коротко и по факту: когда, что, чем закончилось"></textarea></label>
          <p class="t-small t-2">${c === 'green' ? 'Зелёную увидит вся команда.' : 'Карточку увидит только сам сотрудник. Он сможет ответить «Не согласен».'}</p>
          <div class="actions"><button class="btn primary">Выдать карточку</button></div></form>`); },
    cardvoid: async el => { if (await call('POST', `/api/team/cards/${el.dataset.id}/resolve`, { void: true })) { toast('Карточку сняли.'); draw(); } },
    cardkeep: async el => { if (await call('POST', `/api/team/cards/${el.dataset.id}/resolve`, {})) { toast('Карточка оставлена. Сотрудник увидит ответ.'); draw(); } },
    carddispute: el => modal(`<h2 class="t-card">Не согласен с карточкой</h2><form class="form" data-form="carddispute" data-id="${el.dataset.id}"><label class="field"><span>Что было на самом деле</span><textarea name="text" rows="4" maxlength="300" required></textarea></label>
      <p class="t-small t-2">Управляющий увидит ответ и либо снимет карточку, либо оставит её.</p><div class="actions"><button class="btn primary">Отправить</button></div></form>`),
    fundvote: async el => { if (await call('POST', `/api/team/ideas/${el.dataset.id}/vote`)) draw(); },
    openev: el => { S.day = el.dataset.id; S.wk = null; if ($('[data-cal]')) return A.pickday(el); S.scrollTo = '[data-event]'; go(S.me && S.me.resident ? 'afisha' : S.me ? '' : 'afisha'); },
    freeslot: el => { S.ideaDraft = { date: el.dataset.date, slot: 'morning' }; go('host'); },
    resprice: el => { const c = S.cfg, n = +el.dataset.price; if (S.me && S.me.resident) return toast(`Это ваша цена: ${cr(n)}.`);
      modal(`<h2 class="t-block">Цена резидента — с клубной картой</h2><p>Чтобы проходить за ${cr(n)} вместо ${rub(c.entry.guest)}, нужна клубная карта — от ${rub(c.tiers.month.price)} в месяц. ${S.me ? 'Оформить её можно прямо сейчас.' : 'Если карта у вас уже есть, войдите как резидент.'}</p>
        <div class="actions"><button class="btn primary" data-act="nav" data-to="join">Выбрать карту</button>${S.me ? '' : '<button class="btn" data-act="login">Войти</button>'}<button class="btn" data-act="close">Не сейчас</button></div>`); },
    who: async el => { S.who = el.dataset.id; S.mopen = true; S.mback = `[data-act=who][data-id="${S.who}"]`; await refreshMembers(el.dataset.intro ? '.md-intro textarea' : '.md-x'); },
    cfpick: el => { if (Date.now() - (S.cfDragT || 0) < 250) return; const i = +el.dataset.i; if (i === S.cfI) return A.who(el); S.cfI = i; flowLayout(); },
    cfstep: el => { S.cfI = (S.cfI || 0) + +el.dataset.d; flowLayout(); },
    gsel: el => graphSelect(el.dataset.k),
    dskip: () => { const top = $('[data-dtop]'); if (!top) return; const id = top.dataset.id; top.classList.add('out-l'); setTimeout(() => { S.deckSkip = [...(S.deckSkip || []), id]; refreshMembers('[data-deck]'); }, REDUCE ? 0 : 240); },
    dundo: () => { S.deckSkip = (S.deckSkip || []).slice(0, -1); refreshMembers('[data-deck]'); },
    dreset: () => { S.deckSkip = []; refreshMembers('[data-deck]'); },
    mclose: () => { S.mopen = false; const back = S.mback; refreshMembers(back); },
    mview: el => { S.mview = el.dataset.k; refreshMembers(`.seg [data-k="${el.dataset.k}"]`); },
    msph: el => { S.msph = el.dataset.k; refreshMembers(`[data-act=msph][data-k="${el.dataset.k}"]`); },
    mfind: el => { S.mq = el.dataset.q; S.mopen = false; S.mview = 'shelf'; refreshMembers().then(() => { const t = $('#mall'); t && t.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }); }); },
    mdecline: async el => { if (await call('POST', `/api/members/${el.dataset.id}/decline`)) { toast('Хорошо. Человек об этом не узнает.'); refreshMembers(); } },
    know: async el => { const r = await call('POST', `/api/members/${el.dataset.id}/know`, {}); if (r) { toast(r.link === 'mutual' ? `Вы и ${r.name} теперь знакомы. Можно писать друг другу.` : `Отметили. Линия появится, когда ${r.name} подтвердит знакомство.`); refreshMembers(); } },
    fkind: el => { S.feedKind = el.dataset.k; S.openPost = null; refreshFeed(); },
    offernew: () => modal(`<h2 class="t-block">Предложить резидентам</h2><p class="t-small t-2">Что вы даёте другим членам клуба и на каких условиях. Откликнувшиеся напишут вам в переписку.</p>
      <form class="form" data-form="offer"><label class="field"><span>Что предлагаете</span><input name="title" required maxlength="120" placeholder="Полчаса консультации по налогам для ИП"></label>
        <label class="field"><span>Подробнее</span><textarea name="text" rows="3" maxlength="800"></textarea></label>
        <label class="field"><span>Условия для резидентов</span><input name="terms" maxlength="200" placeholder="Бесплатно, раз в месяц"></label>
        <label class="field"><span>Сколько висит в ленте</span><select name="days"><option value="30">Месяц</option><option value="60" selected>Два месяца</option><option value="90">Три месяца</option></select></label>
        <div class="actions"><button class="btn primary">Опубликовать</button><button type="button" class="btn" data-act="close">Отмена</button></div></form>`),
    owant: async el => { const r = await call('POST', `/api/offers/${el.dataset.id}/want`); if (r) { toast('Автору ушло сообщение от вас. Ответ придёт в переписку.'); refreshFeed(); } },
    oclose: async el => { const r = await call('POST', `/api/offers/${el.dataset.id}/close`); if (r) { toast('Предложение закрыто.'); refreshFeed(); } },
    ftab: el => { S.feedTab = el.dataset.k; S.topic = S.thread = S.replyTo = null; refreshFeed(); },
    fstar: async el => { const r = await call('POST', `/api/forum/${el.dataset.k}/star`, {}); if (r) { toast(r.star ? 'Сфера в ваших интересах.' : 'Сфера убрана из интересов.'); refreshFeed('#feedbox'); } },
    topic: el => { S.topic = el.dataset.k || null; S.thread = S.replyTo = null; S.fq = ''; refreshFeed('#feedbox'); },
    thread: el => { S.thread = el.dataset.id; S.replyTo = null; refreshFeed('#feedbox'); },
    fclear: () => { S.fq = ''; refreshFeed(); },
    react: async el => { if (await call('POST', `/api/feed/${el.dataset.id}/react`, { r: el.dataset.r })) refreshFeed(); },
    pollvote: async el => { if (await call('POST', `/api/feed/${el.dataset.id}/poll`, { opt: +el.dataset.opt })) { toast('Голос учтён.'); refreshFeed(); } },
    comments: el => { const id = el.dataset.id; S.openPost = S.openPost === id ? null : id; S.replyTo = null; refreshFeed(S.openPost ? `#post-${id}` : null); },
    mreact: async el => { if (await call('POST', `/api/fmsgs/${el.dataset.id}/react`, { r: el.dataset.r })) refreshFeed(); },
    reply: async el => { S.replyTo = el.dataset.id; await refreshFeed(); const t = $('form.send textarea'); t && t.focus(); },
    noreply: () => { S.replyTo = null; refreshFeed(); },
    report: async el => { if (await call('POST', `/api/fmsgs/${el.dataset.id}/report`)) toast('Жалоба передана команде клуба.'); },
    hide: async el => { const r = await call('POST', `/api/admin/fmsgs/${el.dataset.id}/hide`); if (r) { toast(r.hidden ? 'Сообщение скрыто.' : 'Сообщение снова видно.'); $('#feedbox') ? refreshFeed() : draw(); } },
    pin: async el => { const r = await call('POST', `/api/admin/threads/${el.dataset.id}/pin`); if (r) { toast(r.pinned ? 'Ветка закреплена.' : 'Ветка откреплена.'); refreshFeed(); } },
    openthread: el => { S.feedTab = 'forum'; S.thread = el.dataset.id; S.topic = null; go('feed'); },
    eye: async el => { const k = el.dataset.k, hidden = new Set(S.me.hidden || []); hidden.has(k) ? hidden.delete(k) : hidden.add(k);
      const r = await call('PUT', '/api/anketa', { _hidden: [...hidden] }); if (!r) return; setMe(r.me); const on = !hidden.has(k);
      el.outerHTML = `<button type="button" class="eye" data-act="eye" data-k="${k}" ${eyeAttrs(on)}>${EYE(on)}</button>`;
      toast(on ? 'Поле снова видно резидентам в картотеке.' : 'Поле скрыто: теперь его видит только команда клуба.'); },
    pack: async el => { const p = PACKS().find(x => x.k === el.dataset.k), credits = S.me.balance >= p.price;
      if (!await pay(`Пакет «${p.name}»: ${p.paid} + ${p.bonus} в подарок`, p.price, credits)) return;
      const r = await call('POST', '/api/packs/buy', { pack: p.k }); if (r) { setMe(r.me); toast(`Пакет «${p.name}» ваш. В пакете теперь ${days(r.me.entries_left)}.`); draw(); } },
    inviteaccept: async el => { if (!S.me) { S.inviteCode = el.dataset.code; return loginModal('reg'); } const q = await call('POST', '/api/promo/redeem', { code: el.dataset.code }); if (q) { setMe(q.me); toast('Пригласительный принят: первый вечер бесплатно, бронь за 7 дней.'); go('afisha'); } },
    codeaccept: async el => { if (!S.me) { S.inviteCode = el.dataset.code; return loginModal('reg'); } const q = await call('POST', '/api/promo/redeem', { code: el.dataset.code }); if (q) { setMe(q.me); toast(`Промокод принят: ${q.me.promo ? promoLine(q.me.promo) : `вход по цене резидента`}, бронь за 7 дней.`); go('afisha'); } },
    copylink: el => { const url = location.href.split('#')[0] + '#' + el.dataset.path; try { navigator.clipboard.writeText(url); toast('Ссылка скопирована.'); } catch (e) { toast(url); } },
    payout: async el => { const r = await call('POST', `/api/admin/promos/${encodeURIComponent(el.dataset.code)}/payout`, {}); if (r) { toast(`Выплата отмечена: ${r.code}, всего выплачено ${rub(r.paid_out)}.`); draw(); } },
    invitecopy: el => { const url = location.href.split('#')[0] + '#invite/' + el.dataset.code; try { navigator.clipboard.writeText(url); toast('Ссылка скопирована. Отправьте её гостю.'); } catch (e) { toast(url); } },
    buy: async el => { const k = el.dataset.tier, t = S.cfg.tiers[k]; if (!S.me) { S.wantTier = k; return loginModal('reg'); } S.wantTier = null;
      const off = el.dataset.offer && S.me.offer;
      if (!await pay(off ? `Карта «${t.name}» с зачётом гостевого входа` : `Карта резидента «${t.name}»`, off ? t.price - off.credit : t.price)) return;
      const was = S.me.resident, me = await call('POST', '/api/cards/buy', { tier: k, offer: !!off }); if (!me) return; setMe(me);
      toast(was ? `Карта «${t.name}» оформлена. Срок продлён.` : `Карта «${t.name}» оформлена. Добро пожаловать в клуб.`); if (!was) S.chat = []; go(was ? 'cabinet' : ''); },
    topup: async el => { const n = +el.dataset.n; if (!await pay('Пополнение счёта', n)) return; const r = await call('POST', '/api/balance/topup', { amount: n }); if (r) { setMe(r.me); toast(`Счёт пополнен на ${cr(n + r.bonus)}${r.bonus ? `, из них ${num(r.bonus)} — бонус` : ''}.`); draw(); } },
    nfc: async () => { const me = await call('POST', '/api/nfc/bind', {}); if (me) { setMe(me); toast('Карта привязана. На входе приложите её к считывателю.'); draw(); } },
    book: async el => { const ev = (await api('GET', '/api/events')).find(e => e.id === el.dataset.id), spot = S.cfg.seats.balcony.find(x => x.k === el.dataset.balcony), plus = !!el.dataset.plus, me = S.me;
      if (!me.resident) { const total = ev.my_price + ((spot ? spot.size : 1) - 1) * ev.price_guest;
        if (total && !await pay(`${spot ? spot.name : 'Место'}: «${ev.title}». Гостевая бронь не возвращается.`, total, me.balance >= total)) return; }
      const r = await call('POST', `/api/events/${el.dataset.id}/book`, { balcony: spot ? spot.k : null, plus_one: plus }); if (!r) return; setMe(r.me);
      toast(r.cur === 'rub' ? 'Вы записаны. Оплата прошла.' : !me.resident && !r.paid ? 'Вы записаны. Вход по пригласительному бесплатный.' : `Вы записаны${spot ? ` на балкон: ${spot.name.toLowerCase()}` : ''}${plus ? (r.used_invite ? ' с гостем по пригласительному' : ' с гостем') : ''}${spot && r.used_invite ? `, гостей по пригласительным: ${r.used_invite}` : ''}. Списано: ${[r.used_entry ? days(+r.used_entry) + ' из пакета' : '', r.paid ? cr(r.paid) : ''].filter(Boolean).join(' и ') || 'ничего'}.`); draw(); },
    unbook: async el => { const r = await call('DELETE', `/api/events/${el.dataset.id}/book`); if (r) { setMe(r.me); toast(r.guest ? 'Бронь отменена. Гостевая бронь не возвращается.' : r.refund ? 'Бронь отменена. Оплата вернулась на счёт.' : 'Бронь отменена. До вечера оставалось меньше суток, оплата не возвращается.'); draw(); } },
    vtab: el => { S.voteTab = el.dataset.k; draw(); },
    ltab: el => { S.libKind = el.dataset.k; S.libEv = null; S.libG = ''; S.libQ = ''; draw(); },
    lev: el => { S.libEv = el.dataset.id; draw(); requestAnimationFrame(() => { const t = $('#shelf'); t && t.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }); }); },
    lgenre: el => { S.libG = el.dataset.k; draw(); },
    lpick: async el => { const r = await call('POST', '/api/library/pick', { event: el.dataset.ev, item: el.dataset.id }); if (!r) return;
      S.me.votes_left = r.left; toast(r.changed ? `Передумали: «${r.title}». Голос месяца не тратится.` : `Голос за «${r.title}». Осталось голосов: ${r.left}.`); await draw(); const c = $(`#li-${el.dataset.id}`); c && c.scrollIntoView({ block: 'center' }); },
    lwant: async el => { const r = await call('POST', `/api/library/wishes/${el.dataset.id}/want`); if (r) { toast(r.mine ? 'Отметили: вы тоже хотите.' : 'Сняли отметку.'); draw(); } },
    lbought: async el => { const r = await call('POST', `/api/admin/wishes/${el.dataset.id}/bought`); if (r) { toast(r.text); draw(); } },
    atab: el => { S.admTab = el.dataset.k; S.admEdit = null; draw(); },
    evnew: el => { S.admDraft = { date: el.dataset.date, slot: el.dataset.slot }; S.admEdit = null; draw().then(() => { const f = $('#evform'); f && f.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); }); },
    evedit: el => { S.admEdit = el.dataset.id; draw().then(() => { const f = $('#evform'); f && f.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); }); },
    evclose: () => { S.admEdit = null; S.admDraft = null; draw(); },
    evcancel: el => modal(`<h2 class="t-block">Отменить событие?</h2><p>Всем, кто записался, вернём оплату: кредиты и визиты — на счёт, гостям рубли — кредитами.</p><div class="actions"><button class="btn primary" data-act="evcancelok" data-id="${el.dataset.id}">Отменить событие</button><button class="btn" data-act="close">Не отменять</button></div>`),
    evcancelok: async el => { closeModal(); const r = await call('DELETE', `/api/admin/events/${el.dataset.id}`); if (r) { S.admEdit = null; toast(r.refunded ? `Событие отменено. Вернули оплату: ${r.refunded}.` : 'Событие отменено.'); draw(); } },
    evgift: async el => { const g = $(`#gift-${el.dataset.id}`), r = await call('POST', `/api/admin/events/${el.dataset.id}/gift`, { gift: g && g.value }); if (r) { toast(r.text + '.'); draw(); } },
    ideact: async el => { const r = await call('POST', `/api/admin/ideas/${el.dataset.id}`, { action: el.dataset.a }); if (r) { toast(el.dataset.a === 'vote' ? `«${r.title}» — на голосовании неделю.` : 'Заявка снова в новых.'); draw(); } },
    ideasched: async el => { const o = await api('GET', '/api/admin/overview'), i = o.ideas.find(x => x.id === el.dataset.id); if (!i) return;
      S.admDraft = { idea: i.id, title: i.title, kind: i.kind === 'talk' ? 'talk' : i.kind, slot: i.slot === 'evening' ? 'evening' : 'morning', series: i.series, by: i.by, host: i.host, name: i.name, contact: i.contact, about: i.about, guests: i.guests, when: i.when };
      S.admTab = 'schedule'; S.admEdit = null; draw(); },
    idereject: el => modal(`<h2 class="t-block">Отклонить заявку</h2><form class="form" data-form="ideareject" data-id="${el.dataset.id}"><label class="field"><span>Причина — её увидит автор</span><input name="reason" required maxlength="300" placeholder="Похожая встреча уже есть по средам"></label><div class="actions"><button class="btn primary">Отклонить</button><button type="button" class="btn" data-act="close">Отмена</button></div></form>`),
    ivote: async el => { if (await call('POST', `/api/ideas/${el.dataset.id}/vote`, { v: +el.dataset.v })) { $('#feedbox') ? refreshFeed() : draw(); } },
    vote: async el => { const r = await call('POST', `/api/proposals/${el.dataset.id}/vote`); if (r) { S.me.votes_left = r.left; toast('Голос учтён.'); draw(); } },
    win: async el => { const r = await call('POST', `/api/admin/proposals/${el.dataset.id}/win`, {}); if (r) { toast(r.text); draw(); } },
    join: async el => { if (await call('POST', `/api/projects/${el.dataset.id}/join`)) { toast('Вы в команде проекта. Автор это увидит.'); draw(); } },
    order: async el => { const r = await call('POST', `/api/shop/${el.dataset.id}/order`, {}); if (r) { setMe(r.me); toast(r.status === 'доступ открыт' ? 'Доступ открыт.' : 'Заказ принят. Сообщим, когда он будет готов.'); draw(); } },
    play: el => { S.playing = S.playing === el.dataset.id ? null : el.dataset.id; if (S.playing) toast('Плеер подключим, когда появятся файлы записей.'); draw(); },
    gift: async el => { const k = el.dataset.tier, n = k ? S.cfg.tiers[k].price : +el.dataset.n; if (!await pay(k ? `Карта «${S.cfg.tiers[k].name}» в подарок` : `Подарочная карта на ${cr(n)}`, n)) return; const r = await call('POST', '/api/gift', k ? { tier: k } : { amount: n }); if (r) { setMe(r.me); toast(`Подарочная карта готова. Код: ${r.code}. Передайте его получателю.`); draw(); } },
    noshow: async el => { const r = await call('POST', `/api/admin/bookings/${el.dataset.id}/noshow`, {}); if (r) { toast(`${r.name}: ${r.text}.`); draw(); } },
    visit: async el => { const r = await call('POST', `/api/admin/visits/${el.dataset.id}`, { stay: !!el.dataset.stay }); if (r) { toast(`${r.name}: ${r.text}.`); draw(); } },
    reset: async () => { if (await call('POST', '/api/admin/reset')) { toast('Демо-данные сброшены.'); A.logout(); } },
  };
  function afterAuth() { if (S.me && S.me.promo) toast(S.me.promo.kind !== 'invite' ? `Промокод принят: ${promoLine(S.me.promo)} и бронь за 7 дней.` : 'Пригласительный принят: первый вечер бесплатно.');
    if (S.wantTier) A.buy({ dataset: { tier: S.wantTier } }); }
  const F = {
    register: async d => { let r = null; if (d.phone) { try { r = await api('POST', '/api/auth/login', { phone: d.phone }); } catch (e) {} }
      if (r && d.promo && !r.me.resident) { S.token = r.token; const q = await call('POST', '/api/promo/redeem', { code: d.promo }); if (q && q.me) r.me = q.me; }
      r = r || await call('POST', '/api/auth/register', d); if (r) { setSession(r); afterAuth(); } },
    say: async (d, form) => { form.reset(); await Bar.handle(d.t || ''); },
    anketa: async d => { const r = await call('PUT', '/api/anketa', d); if (r) { setMe(r.me); if (r.opened.length) levelUp(r.opened); else toast('Анкета сохранена.'); S.chat = []; draw(); } },
    rate: async (d, form) => { const items = {}; for (let i = 0; d[`n${i}`] !== undefined; i++) if (d[`s${i}`]) items[d[`n${i}`]] = { stars: +d[`s${i}`], text: d[`t${i}`] || '' };
      if (!Object.keys(items).length && !d.service) return toast('Поставьте хотя бы одну оценку.');
      const r = await call('POST', `/api/orders/${form.dataset.id}/rate`, { items, service: +d.service || 0 }); if (!r) return; setMe(r.me); closeModal(); toast('Спасибо. Оценки ушли команде клуба.'); draw(); },
    barorder: async (d, form) => { const items = $$('[name=items]:checked', form).map(x => x.value); const r = await call('POST', '/api/admin/orders', { user: d.user, items }); if (r) { toast(`${r.name}. ${r.text}`); draw(); } },
    cclose: async (d, form) => { const r = await call('POST', `/api/admin/council/${form.dataset.id}/close`, d); if (r) { toast(r.text); S.scrollTo = '#council'; draw(); } },
    mwish: async d => { if (await call('POST', '/api/council/wishes', d)) { toast('Предложили. Теперь ждём, кто ещё захочет.'); S.scrollTo = '#council'; draw(); } },
    givecard: async d => { const reason = d.reason === '__own' ? d.own : d.reason; if (!(reason || '').trim()) return toast('Укажите причину — без неё карточку выдать нельзя.');
      if (await call('POST', '/api/team/cards', { staff: d.staff, color: d.color, reason, note: d.note })) { closeModal(); toast('Карточка выдана.'); draw(); } },
    carddispute: async (d, form) => { if (await call('POST', `/api/team/cards/${form.dataset.id}/dispute`, d)) { closeModal(); toast('Ответ отправлен управляющему.'); draw(); } },
    teamcfg: async (d, form) => { if (await call('PUT', '/api/team/settings', { ...d, premium_link: !!$('[name=premium_link]', form).checked })) { toast('Настройки сохранены.'); draw(); } },
    staffadd: async d => { if (await call('POST', '/api/team/staff', d)) { toast('Сотрудник добавлен.'); draw(); } },
    fundidea: async d => { if (await call('POST', '/api/team/ideas', d)) draw(); },
    fundspend: async d => { if (await call('POST', '/api/team/spend', d)) { toast('Списали из фонда.'); draw(); } },
    lwish: async d => { if (await call('POST', '/api/library/wishes', d)) { toast('Предложили. Теперь ждём, кто ещё захочет.'); draw(); } },
    lsearch: async d => { S.libQ = d.q || ''; await draw(); const i = $('[data-form=lsearch] input'); i && i.focus(); },
    propose: async d => { if (await call('POST', '/api/proposals', { ...d, kind: S.voteTab })) { toast('Предложение добавлено.'); draw(); } },
    project: async d => { if (await call('POST', '/api/projects', d)) { toast('Проект добавлен.'); draw(); } },
    checkin: async d => { const r = await call('POST', '/api/admin/checkin', d); if (r) { await draw(); const o = $('#ci-out'); if (o) o.textContent = `${r.name}: ${r.text}. На счёте ${num(r.balance)}.`; } },
    credit: async d => { const r = await call('POST', '/api/admin/credit', d); if (r) { toast(`Начислено ${cr(r.amount)}.`); draw(); } },
    gift: async d => { const r = await call('POST', '/api/gift/redeem', d); if (r) { setMe(r.me); toast(r.tier ? `Подарок активирован: карта «${r.tier}». Добро пожаловать в клуб.` : `Подарочная карта зачислена: ${cr(r.amount)} на счёте.`); draw(); } },
    give: async d => { const r = await call('POST', '/api/packs/give', { to: d.to, n: +d.n }); if (r) { setMe(r.me); toast(`Подарили ${days(+d.n)}. В пакете осталось ${r.me.entries_left}.`); draw(); } },
    intro: async (d, form) => { const r = await call('POST', `/api/members/${form.dataset.id}/know`, { note: d.note }); if (r) { toast(`Просьба отправлена. ${r.name} увидит вашу записку.`); refreshMembers(); } },
    msearch: async d => { S.mq = d.q || ''; await refreshMembers('[data-form=msearch] input'); },
    msg: async (d, form) => { if (await call('POST', `/api/messages/${form.dataset.id}`, d)) { toast('Сообщение отправлено.'); refreshMembers(); } },
    fpost: async (d, form) => { const r = await call('POST', '/api/feed', { ...d, pinned: !!d.pinned, poll: (d.poll || '').split('\n') }); if (r) { form.reset(); toast('Опубликовано.'); S.feedKind = 'all'; refreshFeed(); } },
    offer: async d => { const r = await call('POST', '/api/offers', d); if (r) { closeModal(); toast('Предложение в ленте.'); S.feedKind = 'offers'; refreshFeed(); } },
    invite: async d => { const r = await call('POST', '/api/invites', d); if (r) { setMe(r.me); toast(`Пригласительный ${r.code} готов${r.free ? '' : `, списано: ${r.paid}`}. Отправьте гостю ссылку на его страницу.`); go('invite/' + r.code); } },
    fthread: async d => { const r = await call('POST', `/api/forum/${S.topic}`, d); if (r) { S.thread = r.id; toast('Ветка создана.'); refreshFeed('#feedbox'); } },
    fmsg: async (d, form) => { const r = await call('POST', `/api/threads/${form.dataset.id}`, { text: d.text, reply_to: S.replyTo }); if (r) { S.replyTo = null; await refreshFeed(); const l = $$('.msgs li'); l.length && l[l.length - 1].scrollIntoView({ block: 'nearest' }); } },
    fsearch: d => { S.fq = (d.q || '').trim(); refreshFeed(); },
    newpromo: async d => { const r = await call('POST', '/api/admin/promos', d); if (r) { toast(`Промокод ${r.code} создан. Ссылки для гостей и отчёт — в таблице.`); draw(); } },
    newevent: async d => { const r = await call('POST', '/api/admin/events', d); if (r) { S.admDraft = null; toast(`В расписании: ${r.events.length > 1 ? `${r.events.length} встречи` : `«${r.events[0].title}»`}${r.promo ? `. Промокод для гостей — ${r.promo.code}` : ''}.`); draw(); } },
    editevent: async (d, form) => { const r = await call('PUT', `/api/admin/events/${form.dataset.id}`, d); if (r) { S.admEdit = null; toast('Событие сохранено.'); draw(); } },
    ideareject: async (d, form) => { const r = await call('POST', `/api/admin/ideas/${form.dataset.id}`, { action: 'reject', reason: d.reason }); if (r) { closeModal(); toast('Заявка отклонена. Автор увидит причину.'); draw(); } },
    idea: async (d, form) => { const r = await call('POST', '/api/ideas', d); if (r) { form.reset(); S.ideaDraft = null; toast('Предложение отправлено. Команда клуба посмотрит его в течение трёх дней.'); if (S.me) draw(); } },
  };
  document.addEventListener('click', e => { const d = $('details.more[open]'); if (d && !e.target.closest('details.more summary')) d.open = false;   // «Ещё» закрывается кликом мимо и после выбора
    const el = e.target.closest('[data-act]'); if (!el) return; if (el.tagName === 'A') e.preventDefault(); A[el.dataset.act] && A[el.dataset.act](el); });
  document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); F[f.dataset.form](Object.fromEntries(new FormData(f)), f); });
  // Настройки сохраняются сразу, как только человек переключил галочку или список.
  document.addEventListener('change', e => { const el = e.target.closest('[data-msort]'); if (!el) return; S.msort = el.value; refreshMembers('[data-msort]'); });
  document.addEventListener('change', async e => { const el = e.target.closest('[data-set]'); if (!el) return; const k = el.dataset.set;
    const body = k === 'dm' ? { dm: el.value } : k === 'show_plans' ? { show_plans: el.checked } : k === 'here' ? { here: el.checked } : { consents: { [k]: el.checked } };
    const me = await call('PUT', '/api/settings', body); if (!me) return; setMe(me);
    if (k === 'here') { toast(el.checked ? 'Вас видно в подборке «Сегодня в клубе». Отметка снимется сама в конце дня.' : 'Отметку сняли.'); return refreshMembers('[data-set=here]'); }
    toast(k === 'dm' ? 'Сохранили, кто может вам писать.' : k === 'show_plans' ? (el.checked ? 'В картотеке видно, на какие вечера вы записаны.' : 'Ваши вечера в картотеке скрыты.') : el.checked ? 'Согласие сохранено.' : 'Согласие отозвано.'); });
  // Лента и колода картотеки: стрелки, колесо, перетаскивание и свайп.
  document.addEventListener('keydown', e => { const t = e.target; if (!t.closest || t.closest('input, textarea, select')) return;
    const fl = t.closest('[data-flow]'), dk = t.closest('[data-deck]');
    if (fl && ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) { e.preventDefault(); const n = $$('.cf-item', fl).length;
      if (e.key === 'Enter') { const on = $('.cf-item.on', fl); on && A.who(on); return; }
      S.cfI = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (S.cfI || 0) + (e.key === 'ArrowRight' ? 1 : -1); flowLayout(); }
    if (dk && !t.closest('button') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); if (e.key === 'ArrowLeft') A.dskip(); else { const b = $('.mdk-acts [data-intro]'); b && A.who(b); } } });
  let wheelAcc = 0;
  document.addEventListener('wheel', e => { const fl = e.target.closest && e.target.closest('[data-flow]'); if (!fl || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault(); wheelAcc += e.deltaX; if (Math.abs(wheelAcc) > 70) { S.cfI = (S.cfI || 0) + Math.sign(wheelAcc); wheelAcc = 0; flowLayout(); } }, { passive: false });
  let drag = null;
  document.addEventListener('pointerdown', e => { const t = e.target; if (!t.closest || e.button > 0) return;
    const fl = t.closest('.cf-stage'), dc = t.closest('[data-dtop]');
    if (fl) drag = { kind: 'flow', x: e.clientX, i: S.cfI || 0, w: ($('.cf-item', fl) || {}).offsetWidth || 200, moved: false };
    else if (dc) drag = { kind: 'deck', x: e.clientX, el: dc, moved: false }; });
  document.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 8) drag.moved = true; if (!drag.moved) return;
    if (drag.kind === 'flow') { const i = drag.i - Math.round(dx / (drag.w * .42)); if (i !== S.cfI) { S.cfI = i; flowLayout(); } }
    else { drag.el.style.transition = 'none'; drag.el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`; drag.el.classList.toggle('to-r', dx > 60); drag.el.classList.toggle('to-l', dx < -60); } });
  const dragEnd = e => { if (!drag) return; const d = drag, dx = e.clientX - d.x; drag = null;
    if (d.kind === 'flow') { if (d.moved) S.cfDragT = Date.now(); return; }
    d.el.style.transition = ''; d.el.classList.remove('to-r', 'to-l');
    if (d.moved && dx < -90) return A.dskip(); d.el.style.transform = '';
    if (d.moved && dx > 90) { const b = $('.mdk-acts [data-intro]'); b && A.who(b); } };
  document.addEventListener('pointerup', dragEnd); document.addEventListener('pointercancel', () => { if (drag && drag.el) { drag.el.style.transition = ''; drag.el.style.transform = ''; } drag = null; });
  addEventListener('resize', () => requestAnimationFrame(flowLayout));
  // Варианты ответа выбираются стрелками, как меню в игре. Escape закрывает окно. Enter открывает резидента на карте.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if ($('.modal')) { closeModal(); return; } if ($('.mdraw')) { A.mclose(); return; } if (S.pop) { S.pop = false; draw(); return; } }
    const g = e.target.closest && e.target.closest('g[data-act]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); A[g.dataset.act](g); return; }
    const c = e.target.closest && e.target.closest('.choice'); if (!c || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault(); const all = $$('.choice', c.parentElement), i = all.indexOf(c), n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; n && n.focus();
  });
  boot();
})();
