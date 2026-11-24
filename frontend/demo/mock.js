// Демо-режим: тот же API, что в server/app.py, но в браузере. Нужен, чтобы сайт работал без сервера
// (опубликованная демо-страница). Правила повторяют сервер строка в строку; источник правды — сервер.
window.KokoMock = function (SEED) {
  const CFG = SEED.config, KEY = 'koko-demo-v33';
  let db = null;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const now = () => new Date(), addDays = (d, n, h = 0, m = 0) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(x.getHours() + h, x.getMinutes() + m); return x; };
  const nid = p => p + '_' + Math.random().toString(16).slice(2, 10);
  const hex = () => Math.random().toString(16).slice(2, 6).toUpperCase();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const col = n => (db[n] = db[n] || []);
  const get = (n, id) => col(n).find(x => x.id === id) || null;
  const put = (n, doc) => { const a = col(n), i = a.findIndex(x => x.id === doc.id); if (i < 0) a.push(doc); else a[i] = doc; return doc; };
  const drop = (n, id) => { db[n] = col(n).filter(x => x.id !== id); };
  class Fail extends Error { constructor(c, m) { super(m); this.status = c; } }
  const fail = (c, m) => { throw new Fail(c, m); };

  function seed() {
    db = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const s of SEED.users) {
      const u = { ...s, anketa: { ...s.anketa }, hidden: [...(s.hidden || [])] }, t = CFG.tiers[u.tier] || {};
      u.tier_until = u.tier ? iso(addDays(today, u.days_left)) : null; delete u.days_left; u.consents = { ...(s.consents || {}) };
      Object.assign(u, { entries_left: s.entries || 0, joined: iso(today), owned: [], online_until: null, promo: null, invites: s.invites ?? (t.invites || 0) });
      if (s.here) u.here_day = iso(today).slice(0, 10); delete u.here;
      put('users', u);
    }
    // Демо-история счёта: операции за прошлые недели, остаток после каждой считается назад от нынешнего баланса.
    for (const uid of new Set((SEED.history || []).map(h => h.user))) {
      const u = get('users', uid), hs = SEED.history.filter(h => h.user === uid).sort((a, b) => a.day - b.day || a.h - b.h || a.m - b.m);
      let bal = u.balance - hs.reduce((s, h) => s + h.credits, 0), left = (u.entries_left || 0) - hs.reduce((s, h) => s + h.days, 0);
      hs.forEach((h, i) => { bal += h.credits; left += h.days;
        put('tx', { id: `th_${uid}_${i}`, user: uid, credits: h.credits, rub: h.rub, kind: h.kind, note: h.note, visit: h.visit, days: h.days, inv: h.inv, via: h.via, bal, left, ts: iso(addDays(today, h.day, h.h, h.m)) }); });
    }
    // Программа по дням недели: у каждого дня своя сфера (config.week), вечер берётся из program[день недели] по очереди.
    for (let day = 0; day < 28; day++) {
      const date = addDays(today, day), wd = (date.getDay() + 6) % 7, pool = SEED.program[wd], tpl = pool[Math.floor(day / 7) % pool.length];
      put('events', { ...tpl, id: `e${day + 1}`, time: '19:00', start: iso(addDays(today, day, 19, 0)), theme: CFG.week[wd].name,
        drink: SEED.program_drinks[day % SEED.program_drinks.length], seed_booked: SEED.program_booked[day % 7] });
      // Утро: мастер-классы и клубы по интересам — не каждый день, остальные утра свободны для предложений.
      for (const m0 of (SEED.program_morning || {})[wd] || []) { const { series, ...m } = m0;
        put('events', { ...m, title: series ? `${m.title}, урок ${Math.floor(day / 7) + 1}` : m.title, id: `m${day + 1}`, time: '10:30', end: '12:30', start: iso(addDays(today, day, 10, 30)), extra: 0,
          theme: 'Мастер-классы и клубы', seed_booked: 4 + (day % 5), status: 'scheduled' }); }
    }
    // предложения встреч: одно на голосовании, два ждут команду
    for (const { day, vote_days, ...i } of SEED.ideas || []) put('ideas', { ...i, ts: iso(addDays(today, day, 12, 0)), vote_until: vote_days ? iso(addDays(today, vote_days)) : null });
    for (const v of SEED.idea_votes || []) put('idea_votes', { ...v, id: `${v.idea}:${v.user}`, ts: iso(today) });
    for (const n of ['library', 'projects', 'media', 'products']) for (const d of SEED[n]) put(n, JSON.parse(JSON.stringify(d)));
    for (const p of SEED.proposals) put('proposals', { ...p, seed_votes: p.votes, status: 'open' });
    for (const p of SEED.promos) put('promos', { ...p, id: p.code, kind: p.org ? 'event' : 'club', token: 'R' + hex() + hex(), paid_out: 0, by: null, created: iso(today), until: iso(addDays(today, p.days)) });
    for (const l of SEED.links) put('links', { ...l, id: `${l.a}-${l.b}` });
    SEED.messages.forEach((m, i) => put('messages', { id: `msg_${i}`, from: m.from, to: m.to, text: m.text, read: false, ts: iso(addDays(today, m.day, 18)) }));
    for (const s of SEED.feed) { const p = JSON.parse(JSON.stringify(s)); p.ts = iso(addDays(today, p.day, p.h || 12)); delete p.day; delete p.h; p.pinned = !!p.pinned; put('posts', p);
      put('threads', { id: 'c_' + p.id, topic: 'comments', by: 'u_admin', title: p.title, pinned: false, ts: p.ts }); }
    // медиатека: «купить в коллекцию», голоса за вечера, брони резидентов (чтобы в картотеке было видно, кто куда идёт)
    const evDay = (wd, week) => { for (let d = 0; d < 7; d++) if ((addDays(today, d).getDay() + 6) % 7 === wd) return d + 7 * week; return 0; };
    for (const { day, wants, ...w } of SEED.wishes || []) put('wishes', { ...w, seed_wants: wants, status: 'open', ts: iso(addDays(today, day, 12, 0)) });
    for (const v of SEED.wish_votes || []) put('wish_votes', { id: `${v.wish}:${v.user}`, ...v });
    for (const x of SEED.picks || []) { const ev = `e${evDay(x.wd, x.week) + 1}`; put('picks', { id: `${ev}:${x.user}`, ballot: ev, item: x.item, user: x.user }); }
    for (const x of SEED.member_bookings || []) put('bookings', { id: `bs_${x.user}_${x.wd}`, user: x.user, event: `e${evDay(x.wd, x.week) + 1}`, paid: 0, cur: 'credits', balcony: null, seats: 1, size: 1, guest: false, seed: true, arrived: false, burned: false, ts: iso(today) });
    // команда: сотрудники, карточки, идеи для фонда
    for (const x of SEED.staff || []) put('staff', { ...x });
    (SEED.cards || []).forEach(({ day, dispute, ...c }, i) => put('cards', { id: `k_seed_${i}`, by: 'u_admin', note: '', ...c, ts: iso(addDays(today, day, 21, 0)), ...(dispute ? { dispute: { text: dispute, status: 'open', ts: iso(addDays(today, day + 1, 10, 0)) } } : {}) }));
    settleCards();
    for (const x of SEED.fund_ideas || []) put('fund_ideas', { ...x, votes: [...x.votes] });
    // заказы и оценки, совет меню
    for (const { day, hour, rated, ...o } of SEED.bar_orders || []) { const ts = hour < 0 ? iso(new Date(now().getTime() + hour * 36e5)) : iso(addDays(today, day, hour, 40));
      put('bar_orders', { service: null, ...o, ts }); for (const [item, stars] of Object.entries(rated || {})) put('ratings', { id: `${o.id}:${item}`, order: o.id, user: o.user, item, stars, text: '', ts }); }
    for (const { day, ...c } of SEED.council || []) put('council', { ...c, decision: '', ts: iso(addDays(today, day, 12, 0)) });
    for (const { day, wants, ...w } of SEED.menu_wishes || []) put('menu_wishes', { ...w, seed_wants: wants, status: 'open', ts: iso(addDays(today, day, 12, 0)) });
    for (const v of SEED.menu_wish_votes || []) put('menu_wish_votes', { id: `${v.wish}:${v.user}`, ...v });
    for (const { day, ...o } of SEED.offers || []) put('offers', { ...JSON.parse(JSON.stringify(o)), ts: iso(addDays(today, day, 11, 0)), until: iso(addDays(today, 60)), status: 'open' });
    for (const s of SEED.threads) { const t = JSON.parse(JSON.stringify(s)), msgs = t.msgs, ids = []; delete t.msgs;
      msgs.forEach((m, i) => { const mid = `${t.id}_${i}`; ids.push(mid);
        put('fmsgs', { id: mid, thread: t.id, user: m.u, text: m.t, ts: iso(addDays(today, m.day, 10 + i)), reply_to: m.reply != null ? ids[m.reply] : null, hidden: false }); });
      t.ts = iso(addDays(today, msgs[0].day, 10)); t.pinned = !!t.pinned; put('threads', t); }
    save();
  }
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  // ---- команда: карточки. Жёлтая — замечание, красная — серьёзное нарушение, зелёная — похвала, фиолетовая — деньги в фонд команды.
  // Карточки не трогают зарплату: штрафы по ТК запрещены. Связь красных с премией включается настройкой premium_link.
  const cardCfg = () => ({ ...CFG.cards, ...(get('settings', 'cards') || {}), reasons: CFG.cards.reasons });
  const ageDays = c => (now() - new Date(c.ts)) / 864e5;
  const settleCards = () => { const C = cardCfg(), byTs = (a, b) => a.ts < b.ts ? -1 : 1;
    for (const st of col('staff')) { const ys = col('cards').filter(c => !c.void && c.staff === st.id && c.color === 'yellow' && !c.used && ageDays(c) <= C.yellow_days).sort(byTs);
      if (ys.length >= C.yellow_to_red) { const red = put('cards', { id: nid('k'), staff: st.id, color: 'red', reason: `${C.yellow_to_red} жёлтых за ${C.yellow_days} дней`, note: '', auto: true, by: null, ts: iso(now()) });
        ys.slice(0, C.yellow_to_red).forEach(c => { c.used = red.id; put('cards', c); }); } }
    const gs = col('cards').filter(c => !c.void && c.color === 'green' && !c.used).sort(byTs);
    while (gs.length >= C.green_to_purple && col('cards').filter(c => !c.void && c.color === 'purple' && c.ts.slice(0, 7) === month()).length < C.purple_cap) {
      const pu = put('cards', { id: nid('k'), staff: null, color: 'purple', reason: `${C.green_to_purple} зелёных карточек команды`, note: '', auto: true, by: null, rub: C.purple_rub, ts: iso(now()) });
      gs.splice(0, C.green_to_purple).forEach(c => { c.used = pu.id; put('cards', c); }); } };
  const teamView = viewer => { const C = cardCfg(), admin = viewer.role === 'admin', mine = col('staff').find(x => x.user === viewer.id) || null, live = col('cards').filter(c => !c.void);
    const sname = id => (get('staff', id) || {}).name || 'Команда', uname = id => id ? (get('users', id) || {}).name || '' : 'Система';
    const staff = col('staff').map(x => { const cs = live.filter(c => c.staff === x.id), see = admin || (mine && mine.id === x.id);
      const y = cs.filter(c => c.color === 'yellow' && !c.used && ageDays(c) <= C.yellow_days).length, r = cs.filter(c => c.color === 'red' && ageDays(c) <= C.red_days).length;
      return { id: x.id, name: x.name, post: x.post, greens: cs.filter(c => c.color === 'green').length, greens_month: cs.filter(c => c.color === 'green' && c.ts.slice(0, 7) === month()).length,
        ...(see ? { yellows: y, reds: r, alert: r >= C.red_limit, premium: C.premium_link ? Math.max(0, 100 - r * C.premium_cut) : null } : {}) }; });
    const purples = live.filter(c => c.color === 'purple'), total = purples.reduce((a, c) => a + (c.rub || 0), 0), spent = col('fund_spend').reduce((a, x) => a + x.rub, 0);
    const journal = col('cards').filter(c => admin ? true : !c.void && (c.color === 'green' || c.color === 'purple' || (mine && c.staff === mine.id))).sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 80)
      .map(c => ({ ...c, staff_name: c.staff ? sname(c.staff) : 'Команда', by_name: c.auto ? 'Автоматически' : uname(c.by), mine: !!(mine && c.staff === mine.id) }));
    return { cfg: C, admin, me: mine ? mine.id : null, staff, journal, fund: { total, spent, left: total - spent, greens: live.filter(c => c.color === 'green' && !c.used).length, need: C.green_to_purple,
        purples_month: purples.filter(c => c.ts.slice(0, 7) === month()).length, cap: C.purple_cap, rub: C.purple_rub },
      ideas: col('fund_ideas').map(i => ({ id: i.id, title: i.title, who_name: sname(i.who), n: i.votes.length, mine: !!(mine && i.votes.includes(mine.id)) })).sort((a, b) => b.n - a.n), spends: [...col('fund_spend')].reverse(),
      disputes: admin ? col('cards').filter(c => !c.void && c.dispute && c.dispute.status === 'open').length : 0 }; };
  // ---- заказы и оценки. Оценить можно только то, что бармен записал на гостя. Оценки видит только команда.
  const MENU = () => CFG.menu.sides.flatMap(sd => sd.sections.flatMap(sec => sec.items.map(it => ({ name: it[0], price: it[it.length - 1], section: sec.name, side: sd.title.split(' · ')[0] }))));
  const orderView = o => { const rs = col('ratings').filter(r => r.order === o.id);
    return { id: o.id, ts: o.ts, service: o.service || null, skipped: !!o.skipped, items: o.items.map(n => { const r = rs.find(x => x.item === n); return { name: n, stars: r ? r.stars : 0, text: r ? r.text : '' }; }),
      done: !!o.skipped || o.items.every(n => rs.some(x => x.item === n)) }; };
  const toRate = u => col('bar_orders').filter(o => o.user === u.id && ageDays(o) <= 14 && !orderView(o).done).length;
  if (!db || !db.users || db.day !== iso(now()).slice(0, 10)) { seed(); db.day = iso(now()).slice(0, 10); save(); }

  // ---- правила
  const KEYS = CFG.anketa.map(f => f.k);
  const isRes = u => !!u.tier && u.tier_until >= iso(now());
  const tierOf = u => isRes(u) ? CFG.tiers[u.tier] : null;
  const progress = u => Math.round(100 * KEYS.filter(k => (u.anketa[k] || '').trim()).length / KEYS.length);
  const unlocked = (u, w) => u.role === 'admin' || progress(u) >= CFG.unlock[w];
  const month = () => iso(now()).slice(0, 7);
  const regularUsed = (u, m = month()) => col('votes').filter(v => v.user === u.id && v.month === m && !v.bonus).length;
  const votesBase = u => { const t = tierOf(u); return t ? t.votes : CFG.votes_per_month; };
  // Голоса за участие: потратил все голоса месяца — в следующем на один больше (до +3); не голосовал — бонус убывает,
  // но голосов не бывает меньше, чем положено по карте.
  const rollVotes = u => { const m = month(); if (!u || u.vote_month === m) return; const A = CFG.votes_activity || { step: 1, max: 3 }, lvl = u.vote_level || 0;
    if (u.vote_month) { const used = regularUsed(u, u.vote_month); u.vote_level = used >= votesBase(u) + lvl ? Math.min(A.max, lvl + A.step) : used === 0 ? Math.max(0, lvl - A.step) : lvl; }
    u.vote_month = m; put('users', u); };
  const votesCap = u => votesBase(u) + (u.vote_level || 0);
  const votesLeft = u => Math.max(0, votesCap(u) - regularUsed(u)) + (u.bonus_votes || 0);
  const freeLeft = u => { const t = tierOf(u); if (!t || !t.free_entry) return 0; const fm = u.free_month || {}; return Math.max(0, t.visits - (fm.m === month() ? fm.n : 0)); };
  const useFree = (u, k = 1) => { let fm = u.free_month || {}; if (fm.m !== month()) fm = { m: month(), n: 0 }; fm.n = Math.max(0, fm.n + k); u.free_month = fm; };
  const offerOf = u => {
    if (u.tier || u.role !== 'guest') return null;
    // День посещения — сегодня гость прошёл на кассе или у него бронь на сегодняшний вечер. Засчитываем то, что он заплатил за вход:
    // 1 000 ₽ или цену по промокоду. Бронь на другой день зачёта не даёт.
    const today = iso(now()).slice(0, 10);
    const paid = Math.max(0, ...col('tx').filter(x => x.user === u.id && x.kind === 'guest' && x.visit && x.ts.slice(0, 10) === today).map(x => Math.max(x.rub, -x.credits)),
      ...col('bookings').filter(k => k.user === u.id && k.guest && (get('events', k.event) || { start: '' }).start.slice(0, 10) === today).map(k => Math.round(k.paid / (k.size || 1))));
    if (!paid) return null;
    const cr = Math.min(CFG.first_visit_offer.credit, paid);   // гостевой вход засчитывается в любую карту, только в день визита
    return { credit: cr, cards: Object.entries(CFG.tiers).map(([k, t]) => ({ tier: k, name: t.name, full: t.price, price: t.price - cr })) };
  };
  // Строка истории счёта: credits — кредиты, rub — деньги и где заплачены (via), days и inv — визиты и пригласительные; bal и left — что осталось после.
  const tx = (u, o) => put('tx', { id: nid('t'), user: u.id, credits: 0, rub: 0, kind: '', note: '', days: 0, inv: 0, ...o, via: o.via || (o.rub ? 'онлайн' : ''), bal: u.balance || 0, left: u.entries_left || 0, ts: iso(now()) });
  const promoDoc = code => { const p = get('promos', code || ''); return p && p.left > 0 && p.until >= iso(now()) ? p : null; };
  // Вход резидента по времени входа: до 13:00 — утренняя цена, и она действует весь день; после — обычная.
  const resPrice = when => when.slice(11, 16) < CFG.entry.morning_until ? CFG.entry.morning : CFG.entry.resident;
  // Промокод организатора без своей цены — вход по цене резидента в это время: утром 500, днём и вечером 750.
  const promoPrice = (p, when) => p.price == null ? resPrice(when) : p.price;
  const activePromo = u => { const p = u && promoDoc((u.promo || {}).code); return p ? { code: p.code, price: p.price, note: p.note || '', kind: p.kind || 'club', org: p.org || '', event: p.event || null } : null; };
  const checkPromo = (code, u) => {
    code = (code || '').trim().toUpperCase(); if (!code) return null;
    const p = promoDoc(code) || fail(404, 'Промокод не найден или закончился. Проверьте написание или оставьте поле пустым.');
    if (p.kind === 'invite' && u && u.invited_month === month()) fail(409, 'По пригласительному можно прийти раз в месяц. В этом месяце вы уже были у нас по пригласительному.');
    return { code, price: p.price, note: p.note || '', kind: p.kind || 'club', org: p.org || '', event: p.event || null };
  };
  const usePromo = (u, price) => {
    const p = get('promos', (u.promo || {}).code || '');
    if (p) { p.left -= 1; put('promos', p); if (p.kind !== 'invite') put('promo_uses', { id: nid('pu'), code: p.code, user: u.id, price: price ?? promoPrice(p, iso(now())), ts: iso(now()) });
      const inv = get('users', p.by || ''), newGuest = col('tx').filter(t => t.user === u.id && t.kind === 'guest').length <= 1;
      if (p.kind === 'invite') u.invited_month = month();
      if (inv && p.kind === 'invite' && newGuest) { inv.bonus_votes = (inv.bonus_votes || 0) + 1; put('users', inv); tx(inv, { kind: 'club', note: `Голос за приглашённого гостя: ${u.name}` }); } }
    u.promo = null; put('users', u);
  };
  const promoStats = p => { const uses = col('promo_uses').filter(x => x.code === p.code), earned = uses.length * (p.payout || 0);
    return { code: p.code, kind: p.kind, org: p.org || '', contact: p.contact || '', note: p.note || '', price: p.price, prices: [promoPrice(p, '2000-01-01T10:00'), promoPrice(p, '2000-01-01T19:00')], payout: p.payout || 0, prepaid: p.prepaid || 0, total: p.total, left: p.left, until: p.until,
      used: uses.length, collected: uses.reduce((s, x) => s + x.price, 0), earned, paid_out: p.paid_out || 0, due: Math.max(0, earned - (p.paid_out || 0)), token: p.token || '', event: p.event || null }; };
  // Пригласительные — запас на срок карты: карта добавляет свои при покупке и продлении, сверх них пригласительный покупается — 1 визит или вход резидента.
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const invitesLeft = u => isRes(u) ? (u.invites || 0) : 0;
  // Платёж визитами из пакета, если их хватает, иначе кредитами. Один визит — это вход резидента.
  const payDays = (u, days, credits) => {
    if ((u.entries_left || 0) >= days) { u.entries_left -= days; return [days, 0]; }
    if (u.balance < credits) fail(402, `Не хватает: нужно ${days} ${plural(days, 'визит', 'визита', 'визитов')} из пакета или ${credits} кредитов. Пополните счёт или купите пакет визитов.`);
    u.balance -= credits; return [0, credits]; };
  // Бронь резидента: своё место — 1 визит или 500; гость — по пригласительному: из запаса карты бесплатно,
  // запас кончился — пригласительный покупается тут же, 1 визит или 500. Доплата за лекцию — за каждого.
  // Бронь резидента на одно или несколько мест (зал или посадка на балконе): своё место — визит или 500,
  // каждый гость — по пригласительному из запаса карты, а когда запас кончился — пригласительный покупается: визит или 500.
  const paySeats = (u, seats, extra, note, base) => {
    const res = base || CFG.entry.resident, guests = Math.max(0, seats - 1), inv = Math.min(guests, invitesLeft(u)), g = guests - inv;
    const left = u.entries_left || 0, bal = u.balance, ownD = left >= 1 ? 1 : 0, gD = Math.min(g, left - ownD);
    const credits = extra * seats + (ownD ? 0 : res) + res * (g - gD);
    if (bal < credits) fail(402, `Не хватает кредитов: на счёте ${bal}, нужно ${credits}. Пополните счёт или купите пакет визитов.`);
    if (inv) useInvite(u, inv);
    u.entries_left = left - ownD - gD; u.balance = bal - credits; put('users', u);
    const how = [ownD + gD ? `визитов из пакета: ${ownD + gD}` : '', credits ? `кредитов: ${credits}` : ''].filter(Boolean).join(', ');
    tx(u, { credits: -credits, kind: 'entry', days: -(ownD + gD), inv: -inv, note: `${note}${inv ? `, гостей по пригласительным карты: ${inv}` : ''}${g ? `, куплено пригласительных: ${g}` : ''} (${how})` });
    return { cost: credits, days: ownD + gD, invite: inv }; };
  // Оформить карту: продлить срок действующей, начислить кредиты и визиты карты покровителя, заказать подарок.
  const applyCard = (u, tier, price, note) => { const c = CFG.tiers[tier], cur = tierOf(u), base = cur && new Date(u.tier_until) > now() ? new Date(u.tier_until) : now();
    Object.assign(u, { tier, tier_until: iso(addDays(base, c.days)), balance: u.balance + c.credits, entries_left: (u.entries_left || 0) + (c.entries || 0), invites: (u.invites || 0) + c.invites });
    if (u.role === 'guest') u.role = 'resident';
    put('users', u); tx(u, { credits: c.credits, rub: price, kind: 'card', note, days: c.entries || 0, inv: c.invites });
    for (const g of c.gift) put('orders', { id: nid('o'), user: u.id, product: g, price: 0, status: 'ждёт обложку из анкеты', ts: iso(now()) }); };
  const useInvite = (u, k = 1) => { u.invites = Math.max(0, (u.invites || 0) - k); };
  // Карта не продлевается сама: клуб ничего не списывает, по окончании срока человек становится гостем.
  const maybeRenew = u => u;
  const daysLeft = u => u.tier && u.tier_until ? Math.floor((new Date(u.tier_until) - now()) / 864e5) : null;
  // Лента и обсуждения — как на сервере.
  const optUser = tok => { try { return tok ? auth(tok) : null; } catch (e) { return null; } };
  const nameOf = id => { const x = get('users', id) || {}; return (x.anketa || {}).alias || x.name || ''; };
  const reactView = (target, u, kinds, seed) => { const rs = col('reacts').filter(r => r.target === target);
    return [Object.fromEntries(kinds.map(k => [k, ((seed || {})[k] || 0) + rs.filter(r => r.r === k).length])), (rs.find(r => u && r.user === u.id) || {}).r || null]; };
  const toggleReact = (target, u, r, kinds) => { if (!kinds.includes(r)) fail(400, 'Такой реакции нет'); const rid = `${target}:${u.id}`, ex = get('reacts', rid);
    if (ex && ex.r === r) drop('reacts', rid); else put('reacts', { id: rid, target, user: u.id, r }); };
  const threadStats = (tid, ts, u) => { const ms = col('fmsgs').filter(m => m.thread === tid && !m.hidden), seen = u ? ((u.seen || {})[tid] || u.joined || '') : '9999';
    return [ms.length, ms.filter(m => m.user !== (u || {}).id && m.ts > seen).length, ms.reduce((a, m) => m.ts > a ? m.ts : a, ts), ms]; };
  const forumUnread = u => col('threads').filter(t => t.topic !== 'comments').reduce((s, t) => s + threadStats(t.id, t.ts, u)[1], 0);
  const topicOf = k => CFG.forum_topics.find(t => t.k === k) || null;
  const meView = u => {
    const t = tierOf(u); if (t) rollVotes(u);
    return { ...u, to_rate: toRate(u), staff: u.role === 'staff' ? (col('staff').find(x => x.user === u.id) || {}).id || null : null, resident: !!t, tier_name: t ? t.name : null, tier_group: t ? t.group : null, free_entry: !!(t && t.free_entry), window: t ? t.window : 0, progress: progress(u),
      unlock: Object.fromEntries(Object.keys(CFG.unlock).map(k => [k, unlocked(u, k)])), votes_left: t ? votesLeft(u) : 0, votes_cap: t ? votesCap(u) : 0, votes_base: t ? votesBase(u) : 0, vote_level: u.vote_level || 0, free_left: freeLeft(u), visits_cap: t ? t.visits : null, offer: offerOf(u),
      invites_left: invitesLeft(u), my_invites: col('promos').filter(p => p.by === u.id).map(p => ({ code: p.code, left: p.left, kind: p.kind, until: p.until, to: p.to || '' })),
      my_gifts: col('gifts').filter(g => g.by === u.id).map(g => ({ code: g.code, amount: g.amount, tier: g.tier, used: !!g.used_by })), unread: col('messages').filter(m => m.to === u.id && !m.read).length,
      days_left: daysLeft(u), card_ended: !!u.tier && !t, dm: u.dm || 'known', renew_price: u.tier ? CFG.tiers[u.tier].price : 0, promo: t ? null : activePromo(u), bookings: col('bookings').filter(b => b.user === u.id).map(b => b.event), forum_unread: t ? forumUnread(u) : 0 };
  };
  // ---- медиатека: голос за вечер формата. Пластинки — по средам, фильмы — по вторникам, книги — по понедельникам.
  // Голосование закрывается за pick_close_hours до вечера; первый голос за вечер тратит один голос месяца, передумать можно бесплатно.
  const ballot = (e, u) => { const cnt = { ...(e.seed_picks || {}) };
    for (const p of col('picks')) if (p.ballot === e.id) cnt[p.item] = (cnt[p.item] || 0) + 1;
    const items = Object.entries(cnt).sort((a, b) => b[1] - a[1]), lead = items[0] ? get('library', items[0][0]) : null;
    const mine = u ? (get('picks', `${e.id}:${u.id}`) || {}).item || null : null;
    return { counts: cnt, lead, total: items.reduce((s, x) => s + x[1], 0), mine, open: (new Date(e.start) - now()) / 36e5 > (CFG.pick_close_hours || 48) }; };
  const wishView = (w, u, res) => { const vs = col('wish_votes').filter(v => v.wish === w.id), nm = id => { const x = get('users', id) || {}; return (x.anketa || {}).alias || x.name || ''; };
    return { ...w, wants: (w.seed_wants || 0) + vs.length, mine: !!(u && vs.some(v => v.user === u.id)), by_name: nm(w.who), names: res ? vs.map(v => nm(v.user)).filter(Boolean) : [] }; };
  const eventView = (e, u) => {
    const start = new Date(e.start), hours = (start - now()) / 36e5, bks = col('bookings').filter(b => b.event === e.id);
    const taken = e.seed_booked + bks.filter(b => !b.balcony).reduce((s, b) => s + (b.seats ?? 1), 0);
    const bal = Object.fromEntries(CFG.seats.balcony.map(x => [x.k, Math.max(0, x.n - bks.filter(b => b.balcony === x.k).length)]));
    const t = u ? tierOf(u) : null;
    const pr = u && !t ? activePromo(u) : null, promo = pr && (!pr.event || pr.event === e.id) ? pr : null, win = t ? t.window : promo ? CFG.booking.window : 0;
    const sameDay = e.start.slice(0, 10) === iso(now()).slice(0, 10);
    const state = hours <= 0 ? 'past' : e.residents_only && !t ? 'closed' : (t || promo) ? (hours <= win * 24 ? 'open' : 'wait') : sameDay ? 'open' : 'guest_wait';
    const opens = (t || promo) ? iso(addDays(start, -win)) : e.start.slice(0, 10) + 'T00:00', extra = e.extra || 0, res = resPrice(e.start);
    const xg = e.extra_guest ?? extra;   // вечер по отдельной цене: доплата гостя и резидента разная
    let how, my, deposit = 0;
    if (t) { how = t.free_entry && freeLeft(u) ? 'free' : u.entries_left ? 'included' : 'credits'; my = how === 'credits' ? res + extra : extra; }
    else { how = promo ? 'promo' : 'rub'; my = promo ? promoPrice(promo, e.start) + extra : CFG.entry.guest + xg;
      // вечерняя бронь по коду организатора — с депозитом; разница уходит на счёт для бара
      if (promo && promo.kind !== 'invite' && res === CFG.entry.resident && e.start.slice(11, 16) >= '19:00') deposit = Math.max(CFG.booking.deposit, my); }
    const pk = e.pick ? ballot(e) : null;
    return { ...e, ...(pk ? { title: `${e.title}: ${pk.lead ? pk.lead.title : 'выбирают резиденты'}`, pick_open: pk.open, pick_votes: pk.total, base_title: e.title } : {}), hours: Math.round(hours * 10) / 10, taken: Math.min(taken, CFG.seats.hall), free: Math.max(0, CFG.seats.hall - taken), balcony_free: bal, state, opens,
      price_guest: CFG.entry.guest + xg, price_res: res + extra, my_price: deposit || my, deposit, deposit_back: deposit ? deposit - my : 0, how, same_day: sameDay,
      slot: e.start.slice(11, 16) < CFG.entry.morning_until ? 'morning' : 'evening', second_invite: !!(t && invitesLeft(u)), second_price: t ? (invitesLeft(u) ? 0 : res) + extra : null };
  };
  const chargeEntry = (u, extra = 0, note = 'Вход', base) => {
    const t = CFG.tiers[u.tier]; let cost = extra, how;
    const useFreeEntry = t.free_entry && freeLeft(u) > 0, useIncluded = !useFreeEntry && !!u.entries_left;
    if (useFreeEntry) { useFree(u); how = `вход без счёта, осталось в этом месяце ${freeLeft(u)}`; } else if (useIncluded) how = `вход из пакета, осталось ${u.entries_left - 1}`; else { cost += base || resPrice(iso(now())); how = 'со счёта'; }
    if (u.balance < cost) fail(402, `Не хватает кредитов: на счёте ${u.balance}, нужно ${cost}. Пополните счёт в кабинете.`);
    if (useIncluded) u.entries_left -= 1;
    u.balance -= cost; put('users', u); tx(u, { credits: -cost, kind: 'entry', days: useIncluded ? -1 : 0, note: `${note} (${how})` });
    return { cost, used_entry: useIncluded, used_free: useFreeEntry };
  };
  const seededUsers = new Set(SEED.users.map(user => user.id));
  const isPersonalProfile = user => user && !seededUsers.has(user.id) && ['guest', 'resident'].includes(user.role);
  const auth = (tok, need) => {
    const s = tok && get('sessions', tok), u = s && get('users', s.user);
    if (!isPersonalProfile(u)) fail(401, 'Войдите в клуб');
    maybeRenew(u);
    if (need === 'resident' && !isRes(u)) fail(403, 'Раздел открыт резидентам');
    if (need === 'admin' && u.role !== 'admin') fail(403, 'Только для управляющих клуба');
    if (need === 'staff' && !['admin', 'staff'].includes(u.role)) fail(403, 'Только для команды клуба');
    return u;
  };
  const startSession = u => {
    const tok = nid('s'); put('sessions', { id: tok, user: u.id });
    return { token: tok, me: meView(u) };
  };
  // ---- картотека
  const MEET = { 'Музыкантов': ['музык', 'саксофон', 'диджей', 'пианист', 'гитарист'], 'Архитекторов и дизайнеров': ['архитект', 'дизайн'], 'Предпринимателей': ['предприним', 'основател', 'владел'], 'Тех, кто пишет': ['пиш', 'редактор', 'журналист', 'автор'] };
  const publicAnketa = (x, viewer) => viewer.role === 'admin' || viewer.id === x.id ? { ...x.anketa } : Object.fromEntries(Object.entries(x.anketa).filter(([k]) => !(x.hidden || []).includes(k)));
  // Совпадение считается по частям — музыка, кино, вечера, дела, люди, медиатека — чтобы показать, из чего оно сложилось.
  const PART_MAX = { music: 9, cinema: 4, evenings: 6, work: 4, people: 3, library: 5 };
  const affinity = (u, x, projects) => {
    const a = u.anketa, b = publicAnketa(x, u), names = s => Object.fromEntries((s || '').split(',').map(n => n.trim()).filter(n => n && n !== '—').map(n => [n.toLowerCase(), n]));
    const mine = names(a.music), theirs = names(b.music); let score = 0; const common = [], pts = { music: 0, cinema: 0, evenings: 0, work: 0, people: 0, library: 0 };
    const add = (cat, n, text) => { score += n; pts[cat] += n; common.push(text); };
    for (const k in mine) if (theirs[k]) add('music', 3, `Оба слушаете ${theirs[k]}`);
    if (a.evening && a.evening === b.evening) add('evenings', 2, `Любимый вечер у обоих: ${a.evening.toLowerCase()}`);
    if (a.film && a.film.trim().toLowerCase() === (b.film || '').trim().toLowerCase()) add('cinema', 2, `Оба выбрали фильм «${b.film}»`);
    if ((MEET[a.meet] || []).some(w => (b.work || '').toLowerCase().includes(w))) add('work', 2, `Вы хотели встретить: ${a.meet.toLowerCase()}`);
    if ((MEET[b.meet] || []).some(w => (a.work || '').toLowerCase().includes(w))) add('work', 2, `${b.alias || x.name} хочет встретить: ${b.meet.toLowerCase()}`);
    for (const p of projects) if (p.members.includes(u.id) && p.members.includes(x.id)) add('work', 2, `Вместе в проекте «${p.title}»`);
    const mm = friendsOf(u.id).filter(z => z !== x.id && friendsOf(x.id).includes(z));
    if (mm.length) add('people', mm.length, `Общие знакомые: ${mm.map(nameOf).join(', ')}`);
    if (x.show_plans !== false) { const mine = plansOf(u.id).map(e => e.id); for (const e of plansOf(x.id)) if (mine.includes(e.id)) add('evenings', 2, `Оба идёте: «${eventView(e).title}», ${WDN[new Date(e.start).getDay()]}`); }
    const VERB = { vinyl: 'послушать', film: 'посмотреть', book: 'обсудить' };
    for (const p of col('picks').filter(p => p.user === x.id)) if (col('picks').some(q => q.user === u.id && q.item === p.item)) { const it = get('library', p.item); if (it) add(it.kind === 'film' ? 'cinema' : 'library', 2, `Оба хотите ${VERB[it.kind]} «${it.title}»`); }
    for (const v of col('wish_votes').filter(v => v.user === x.id)) if (col('wish_votes').some(q => q.user === u.id && q.wish === v.wish)) { const w = get('wishes', v.wish); if (w) add('library', 1, `Оба хотите в коллекцию «${w.title}»`); }
    const parts = Object.fromEntries(Object.entries(pts).map(([k, v]) => [k, Math.min(100, Math.round(100 * v / PART_MAX[k]))]));
    return [score, [...new Set(common)], parts, Math.max(4, Math.min(97, Math.round(100 * (1 - Math.exp(-score / 5)))))];
  };
  const WDN = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];
  const friendsOf = id => col('links').filter(l => l.ok && (l.a === id || l.b === id)).map(l => l.a === id ? l.b : l.a);
  const plansOf = id => col('bookings').filter(b => b.user === id).map(b => get('events', b.event)).filter(e => e && new Date(e.start) > now()).sort((a, b) => a.start < b.start ? -1 : 1);
  const wantsOf = id => [...col('picks').filter(p => p.user === id).map(p => get('library', p.item)).filter(Boolean).map(i => ({ kind: i.kind, title: i.title, by: i.by })),
    ...col('wish_votes').filter(v => v.user === id).map(v => get('wishes', v.wish)).filter(w => w && w.status === 'open').map(w => ({ kind: w.kind, title: w.title, by: w.by, wish: true }))];
  const linkOf = (me, other) => { const l = col('links').find(l => (l.a === me && l.b === other) || (l.a === other && l.b === me)); return !l ? 'none' : l.ok ? 'mutual' : l.a === me ? 'sent' : 'incoming'; };
  const canWrite = (u, x) => { const dm = x.dm || 'known'; return dm === 'all' || (dm === 'known' && linkOf(u.id, x.id) === 'mutual') || col('messages').some(m => m.from === x.id && m.to === u.id); };
  const hasOnline = u => !!u.online_until && u.online_until >= iso(now());
  const doorCharge = (u, note) => {
    if (isRes(u)) { const r = chargeEntry(u, 0, note); return `Резидент «${CFG.tiers[u.tier].name}»: ` + (r.cost ? `списано ${r.cost} кредитов` : r.used_entry ? 'включённый вход' : `вход без счёта, в этом месяце осталось ${freeLeft(u)}`); }
    const promo = activePromo(u), price = promo ? promoPrice(promo, iso(now())) : CFG.entry.guest;
    tx(u, { rub: price, kind: 'guest', visit: true, via: 'касса', note: `${note}: гостевой вход на кассе` + (promo ? `, промокод ${promo.code}` : '') });
    if (promo) usePromo(u, price);
    return `Гость: ${price} ₽ на кассе` + (promo ? `, промокод ${promo.code}` : '');
  };

  // ---- предложения встреч и расписание
  const IDEA_KINDS = { study: 'Мастер-класс или учимся вместе', club: 'Клуб по интересам', lecture: 'Лекция', talk: 'Дискуссия', cinema: 'Показ', vinyl: 'Прослушивание', set: 'Живое выступление', projects: 'Свой проект' };
  const ideaView = (i, u) => { const vs = col('idea_votes').filter(x => x.idea === i.id), mine = (vs.find(x => u && x.user === u.id) || {}).v || 0;
    return { ...i, kind_name: IDEA_KINDS[i.kind] || 'Встреча', yes: vs.filter(x => x.v > 0).length, no: vs.filter(x => x.v < 0).length, my_vote: mine }; };
  const offerView = (o, u) => { const au = get('users', o.by) || {};
    return { ...o, by_name: au.name || '', by_work: (au.anketa || {}).work || '', wants: (o.wants || []).length, wanted: !!(u && (o.wants || []).includes(u.id)), mine: !!(u && u.id === o.by) }; };
  const SLOTS = { morning: ['10:30', '12:30'], evening: ['19:00', '22:00'] };
  const slotOf = hhmm => hhmm < CFG.entry.morning_until ? 'morning' : 'evening';
  const busy = (date, slot, skip) => col('events').find(e => e.start.slice(0, 10) === date && slotOf(e.start.slice(11, 16)) === slot && e.id !== skip);
  // ---- маршруты
  const R = {
    'GET /api/public': () => ({ config: CFG, events: col('events').map(e => eventView(e)).filter(e => e.state !== 'past').sort((a, b) => a.start < b.start ? -1 : 1),
      media: col('media') }),
    'POST /api/auth/register': (t, b) => {
      if (!(b.name || '').trim()) fail(400, 'Напишите, как к вам обращаться');
      if (!b.consent_pd || !b.consent_rules) fail(400, 'Чтобы зарегистрироваться, отметьте согласие на обработку персональных данных и правила клуба.');
      const promo = checkPromo(b.promo), stamp = iso(now());
      const u = put('users', { consents: { pd: stamp, rules: stamp, news: b.consent_news ? stamp : null, photo: null, social: null }, dm: 'known', promo, id: nid('u'), name: b.name.trim(), phone: b.phone || '', provider: b.provider || 'phone', role: 'guest', tier: null, tier_until: null,
        balance: 0, bonus_votes: 0, nfc: null, anketa: {}, hidden: [...CFG.anketa_hidden_default], entries_left: 0, joined: iso(now()), owned: [], online_until: null });
      return startSession(u);
    },
    'POST /api/auth/login': (t, b) => {
      const u = col('users').find(user => isPersonalProfile(user) && user.phone && user.phone === b.phone);
      if (!u) fail(404, 'Такого участника нет');
      return startSession(u);
    },
    'GET /api/me': t => meView(auth(t)),
    'PUT /api/anketa': (t, b) => {
      const u = auth(t, 'resident'), before = progress(u);
      for (const k in b) if (KEYS.includes(k)) u.anketa[k] = String(b[k]).slice(0, 400);
      if (Array.isArray(b._hidden)) u.hidden = b._hidden.filter(k => KEYS.includes(k) && k !== 'alias');
      put('users', u); const after = progress(u);
      return { me: meView(u), opened: Object.keys(CFG.unlock).filter(k => before < CFG.unlock[k] && CFG.unlock[k] <= after) };
    },
    'POST /api/nfc/bind': (t, b) => { const u = auth(t); u.nfc = b.uid || [0, 0, 0, 0].map(() => pad(Math.floor(Math.random() * 99))).join(':'); put('users', u); return meView(u); },
    'POST /api/cards/buy': (t, b) => {
      const u = auth(t), c = CFG.tiers[b.tier] || fail(400, 'Нет такой карты'), cur = tierOf(u);
      let price = c.price, note = `Карта «${c.name}»`;
      if (b.offer) { const o = offerOf(u); if (!o) fail(409, 'Гостевой вход засчитывается в карту только в день визита, до закрытия клуба.');
        price = c.price - o.credit; note = `Карта «${c.name}»: ${price} ₽, гостевой вход ${o.credit} ₽ засчитан`; }
      if (cur && c.rank < cur.rank) { const d = new Date(u.tier_until); fail(409, `У вас действует карта «${cur.name}» до ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. Карту младше можно оформить после её окончания.`); }
      applyCard(u, b.tier, price, note); return meView(get('users', u.id));
    },
    'POST /api/balance/topup': (t, b) => {
      const u = auth(t), amount = parseInt(b.amount) || 0;
      if (amount < 500) fail(400, 'Пополнение — от 500 ₽');
      u.balance += amount; put('users', u);   // без бонусов: кредит равен рублю
      tx(u, { credits: amount, rub: amount, kind: 'topup', note: 'Пополнение счёта' });
      return { me: meView(u), bonus: 0 };
    },
    'GET /api/tx': t => { const u = auth(t); return col('tx').filter(x => x.user === u.id).reverse().slice(0, 500); },
    'POST /api/promo/redeem': (t, b) => {
      const u = auth(t);
      if (isRes(u)) fail(409, `Промокод — для гостей. Резидент и так платит за вход ${CFG.entry.resident} кредитов.`);
      u.promo = checkPromo(b.code, u) || fail(400, 'Введите промокод'); put('users', u);
      return { me: meView(u) };
    },
    'POST /api/invites': (t, b = {}) => {   // пригласительный: из запаса карты бесплатно, сверх — 1 визит или вход резидента
      const u = auth(t, 'resident'), free = invitesLeft(u) > 0; let days = 0, credits = 0;
      if (free) useInvite(u); else [days, credits] = payDays(u, 1, CFG.entry.resident);
      const code = 'GOST-' + hex() + hex().slice(0, 2), to = (b.to || '').trim().slice(0, 60);
      put('promos', { id: code, code, price: 0, total: 1, left: 1, until: iso(addDays(now(), CFG.invite_days)), kind: 'invite', by: u.id, created: iso(now()), to, text: (b.text || '').trim().slice(0, 280), note: `Пригласительный от ${u.anketa.alias || u.name}` });
      put('users', u); const paid = free ? 'из запаса карты' : days ? `${days} ${plural(days, 'визит', 'визита', 'визитов')} из пакета` : `${credits} кредитов`;
      tx(u, { credits: -credits, kind: 'invite', days: -days, inv: free ? -1 : 0, note: `Пригласительный ${code}${to ? ` для: ${to}` : ''}, ${paid}` });
      return { code, free, paid, me: meView(u) };
    },
    'GET /api/invite/:id': (t, b, code) => {   // страница пригласительного открыта без входа
      const p = get('promos', (code || '').toUpperCase()); if (!p || p.kind !== 'invite') fail(404, 'Такого пригласительного нет. Проверьте ссылку.');
      const by = get('users', p.by) || {}, a = by.anketa || {}, hid = by.hidden || [], show = k => a[k] && !hid.includes(k) ? a[k] : null, tt = by.id ? tierOf(by) : null;
      return { code: p.code, to: p.to || '', text: p.text || '', until: p.until, used: p.left <= 0, expired: p.until < iso(now()),
        by: { name: a.alias || by.name || '', tier: tt ? tt.name : null, about: ['work', 'music', 'film'].map(show).filter(Boolean), cover: Object.fromEntries(['alias', 'mood', 'music', 'work'].map(k => [k, show(k) || ''])) },
        events: col('events').filter(e => e.start > iso(now()) && !e.residents_only).sort((x, y) => x.start < y.start ? -1 : 1).slice(0, 3).map(e => ({ id: e.id, title: e.title, start: e.start, theme: e.theme || '' })) };
    },
    'GET /api/residents': t => { const u = auth(t, 'resident'); return col('users').filter(x => isRes(x) && x.id !== u.id).map(x => ({ id: x.id, name: x.anketa.alias || x.name })); },
    'POST /api/packs/give': (t, b) => {   // подарить визиты другому резиденту
      const u = auth(t, 'resident'), n = parseInt(b.n) || 1, to = get('users', b.to || '') || fail(404, 'Нет такого резидента');
      if (to.id === u.id || !isRes(to)) fail(409, 'Визиты можно подарить только другому резиденту.');
      if (n < 1 || (u.entries_left || 0) < n) fail(409, `В пакете ${u.entries_left || 0} ${plural(u.entries_left || 0, 'визит', 'визита', 'визитов')}.`);
      u.entries_left -= n; to.entries_left = (to.entries_left || 0) + n; put('users', u); put('users', to);
      const days = `${n} ${plural(n, 'визит', 'визита', 'визитов')}`, nm = x => x.anketa.alias || x.name;
      tx(u, { kind: 'pack', days: -n, note: `Подарили ${days} резиденту ${nm(to)}` }); tx(to, { kind: 'pack', days: n, note: `${nm(u)} дарит вам ${days}` });
      return { me: meView(u) };
    },
    'POST /api/packs/buy': (t, b) => {
      const u = auth(t, 'resident'), pk = CFG.packs.find(p => p.k === b.pack) || fail(404, 'Нет такого пакета'), price = pk.paid * CFG.entry.resident, n = pk.paid + pk.bonus;
      let cur = 'credits'; u.entries_left = (u.entries_left || 0) + n;
      if (u.balance >= price) { u.balance -= price; tx(u, { credits: -price, kind: 'pack', days: n, note: `Пакет «${pk.name}»: ${pk.paid} + ${pk.bonus} в подарок` }); }
      else { cur = 'rub'; tx(u, { rub: price, kind: 'pack', days: n, note: `Пакет «${pk.name}»: ${pk.paid} + ${pk.bonus} в подарок` }); }
      put('users', u);
      return { me: meView(u), cur, paid: price, n };
    },
    'POST /api/gift': (t, b) => {
      const u = auth(t), tier = b.tier ? CFG.tiers[b.tier] || fail(400, 'Нет такой карты') : null, amount = tier ? tier.price : parseInt(b.amount) || 0;
      if (!tier && !CFG.gift_amounts.includes(amount)) fail(400, 'Выберите сумму подарочной карты из списка');
      const code = 'GIFT-' + hex() + hex().slice(0, 2);   // клубную карту тоже можно подарить: получатель активирует её кодом
      put('gifts', { id: code, code, amount: tier ? 0 : amount, tier: b.tier || null, by: u.id, used_by: null, ts: iso(now()) });
      tx(u, { rub: amount, kind: 'gift', note: tier ? `Карта «${tier.name}» в подарок` : `Подарочная карта на ${amount} кредитов` });
      return { code, me: meView(u) };
    },
    'POST /api/gift/redeem': (t, b) => {
      const u = auth(t), g = get('gifts', (b.code || '').trim().toUpperCase()) || fail(404, 'Подарочная карта не найдена. Проверьте код.');
      if (g.used_by) fail(409, 'Эта подарочная карта уже использована.');
      if (g.tier) { const c = CFG.tiers[g.tier], cur = tierOf(u);
        if (cur && c.rank < cur.rank) fail(409, `У вас действует карта «${cur.name}». Подарок можно активировать после её окончания.`);
        g.used_by = u.id; put('gifts', g); applyCard(u, g.tier, 0, `Карта «${c.name}» в подарок`); return { amount: 0, tier: c.name, me: meView(get('users', u.id)) }; }
      g.used_by = u.id; put('gifts', g); u.balance += g.amount; put('users', u); tx(u, { credits: g.amount, kind: 'gift', note: 'Подарочная карта' });
      return { amount: g.amount, me: meView(u) };
    },
    'PUT /api/settings': (t, b) => {
      const u = auth(t);
      if (['all', 'known', 'none'].includes(b.dm)) u.dm = b.dm;
      if (typeof b.show_plans === 'boolean') u.show_plans = b.show_plans;
      if (typeof b.here === 'boolean') u.here_day = b.here ? iso(now()).slice(0, 10) : null;   // «я сегодня в клубе» — только на сегодня
      for (const k of ['news', 'photo', 'social']) if (b.consents && k in b.consents) (u.consents = u.consents || {})[k] = b.consents[k] ? iso(now()) : null;
      put('users', u); return meView(u);
    },
    'GET /api/messages/:id': (t, b, id) => {
      const u = auth(t, 'resident'), x = get('users', id) || fail(404, 'Нет такого резидента'), list = [];
      for (const m of col('messages')) if ((m.from === u.id && m.to === id) || (m.from === id && m.to === u.id)) { if (m.to === u.id) m.read = true; list.push({ mine: m.from === u.id, text: m.text, ts: m.ts }); }
      return { list, can_write: canWrite(u, x) };
    },
    'POST /api/messages/:id': (t, b, id) => {
      const u = auth(t, 'resident'), x = get('users', id) || fail(404, 'Нет такого резидента');
      if (!canWrite(u, x)) fail(403, 'Этот резидент не открыл сообщения. Отметьте «Мы знакомы» — после его подтверждения переписка откроется.');
      const text = (b.text || '').trim().slice(0, 1000) || fail(400, 'Напишите сообщение');
      put('messages', { id: nid('msg'), from: u.id, to: id, text, read: false, ts: iso(now()) });
      return { ok: true };
    },
    'GET /api/feed': t => {
      const u = optUser(t), kinds = CFG.reactions.post;
      const out = col('posts').map(p => { const [cnt, mine] = reactView(p.id, u, kinds, p.react); let poll = null;
        if (p.poll) { const votes = col('poll_votes').filter(v => v.post === p.id), sd = p.poll.seed || p.poll.options.map(() => 0);
          const n = p.poll.options.map((o, i) => sd[i] + votes.filter(v => v.opt === i).length);
          poll = { q: p.poll.q, options: p.poll.options.map((o, i) => ({ t: o, n: n[i] })), total: n.reduce((a, b) => a + b, 0), mine: (votes.find(v => u && v.user === u.id) || { opt: null }).opt }; }
        const au = get('users', p.by || '');
        return { id: p.id, ts: p.ts, title: p.title || '', text: p.text, pinned: !!p.pinned, tag: p.tag || null, img: p.img || null, by: p.by || null, by_name: au && au.role !== 'admin' ? au.name : 'Клуб Коко',
          club: !au || au.role === 'admin', reacts: cnt, mine, comments: threadStats('c_' + p.id, p.ts, u)[0], poll }; });
      const posts = [...out.filter(p => p.pinned), ...out.filter(p => !p.pinned).sort((a, b) => a.ts < b.ts ? 1 : -1)];
      return { posts, ideas: col('ideas').filter(i => i.status === 'voting').map(i => ideaView(i, u)), offers: [...col('offers')].reverse().filter(o => o.status === 'open').map(o => offerView(o, u)),
        can_post: !!(u && (isRes(u) || u.role === 'admin')), admin: !!(u && u.role === 'admin'), can_comment: !!(u && isRes(u)), can_react: !!u, can_vote: !!(u && isRes(u)) };
    },
    'POST /api/feed': (t, b) => {   // пишут резиденты и команда клуба: новость клуба — с заголовком, разговор резидента — просто текст
      const u = auth(t), admin = u.role === 'admin'; if (!admin && !isRes(u)) fail(403, 'Писать в ленту могут резиденты');
      const title = (b.title || '').trim(), text = (b.text || '').trim(); if (!text) fail(400, 'Напишите текст');
      const opts = (b.poll || []).map(o => o.trim()).filter(Boolean).slice(0, 6);
      const p = put('posts', { id: nid('p'), ts: iso(now()), title: title.slice(0, 140), text: text.slice(0, 4000), pinned: admin && !!b.pinned, by: u.id, tag: admin ? 'Клуб' : 'Разговор',
        poll: opts.length >= 2 ? { q: (b.poll_q || 'Ваш выбор').trim().slice(0, 140), options: opts } : null });
      put('threads', { id: 'c_' + p.id, topic: 'comments', by: u.id, title: p.title || text.slice(0, 60), pinned: false, ts: p.ts });
      return { id: p.id };
    },
    // ---- свои для своих: резиденты предлагают друг другу своё; «Хочу» — сообщение автору
    'GET /api/offers': t => { const u = auth(t, 'resident'); return [...col('offers')].reverse().filter(o => o.status === 'open' || o.by === u.id).map(o => offerView(o, u)); },
    'POST /api/offers': (t, b) => {
      const u = auth(t, 'resident'), title = (b.title || '').trim(); if (title.length < 4) fail(400, 'Коротко напишите, что вы предлагаете');
      const days = Math.max(7, Math.min(180, parseInt(b.days) || 60));
      return offerView(put('offers', { id: nid('o'), by: u.id, title: title.slice(0, 120), text: (b.text || '').trim().slice(0, 800), terms: (b.terms || '').trim().slice(0, 200),
        until: iso(addDays(now(), days)), status: 'open', wants: [], ts: iso(now()) }), u);
    },
    'POST /api/offers/:id/want': (t, b, id) => {
      const u = auth(t, 'resident'), o = get('offers', id) || fail(404, 'Нет такого предложения');
      if (o.by === u.id) fail(409, 'Это ваше предложение'); if (o.wants.includes(u.id)) fail(409, 'Вы уже откликнулись. Автор напишет вам.');
      o.wants.push(u.id); put('offers', o);
      put('messages', { id: nid('msg'), from: u.id, to: o.by, text: `Здравствуйте! Мне интересно ваше предложение «${o.title}».`, read: false, ts: iso(now()) });
      return offerView(o, u);
    },
    'POST /api/offers/:id/close': (t, b, id) => {
      const u = auth(t, 'resident'), o = get('offers', id) || fail(404, 'Нет такого предложения');
      if (o.by !== u.id && u.role !== 'admin') fail(403, 'Закрыть может только автор'); o.status = 'closed'; put('offers', o); return offerView(o, u);
    },
    'POST /api/feed/:id/react': (t, b, id) => { const u = auth(t); get('posts', id) || fail(404, 'Нет такого поста'); toggleReact(id, u, b.r, CFG.reactions.post); return { ok: true }; },
    'POST /api/feed/:id/poll': (t, b, id) => {
      const u = auth(t), p = get('posts', id) || fail(404, 'Нет такого поста'), opt = parseInt(b.opt);
      if (!p.poll || !(opt >= 0 && opt < p.poll.options.length)) fail(400, 'Нет такого варианта');
      if (get('poll_votes', `${id}:${u.id}`)) fail(409, 'Вы уже проголосовали в этом опросе');
      put('poll_votes', { id: `${id}:${u.id}`, post: id, user: u.id, opt }); return { ok: true };
    },
    'GET /api/forum': t => { const u = auth(t, 'resident'), text = Object.values(u.anketa).join(' ').toLowerCase(), stars = u.topic_stars || [];
      // Сферы сверху вниз — по близости к резиденту: звёздочка, совпадение с анкетой, свои сообщения.
      const score = (tp, mine) => tp.kind !== 'sphere' ? 0 : (stars.includes(tp.k) ? 100 : 0) + 10 * (tp.kw || []).filter(w => text.includes(w)).length + 3 * mine;
      const out = CFG.forum_topics.map(tp => { const th = col('threads').filter(x => x.topic === tp.k), ids = new Set(th.map(x => x.id)), ts = th.map(x => threadStats(x.id, x.ts, u));
        const mine = col('fmsgs').filter(m => ids.has(m.thread) && m.user === u.id).length;
        return { ...tp, threads: ts.length, msgs: ts.reduce((s, x) => s + x[0], 0), unread: ts.reduce((s, x) => s + x[1], 0), last: ts.reduce((a, x) => x[2] > a ? x[2] : a, ''), star: stars.includes(tp.k), score: score(tp, mine) }; });
      const spheres = out.filter(x => x.kind === 'sphere').sort((a, b) => b.score - a.score || (a.day ?? 9) - (b.day ?? 9));
      return { topics: [...spheres, ...out.filter(x => x.kind !== 'sphere')], week: CFG.week }; },
    'POST /api/forum/:id/star': (t, b, k) => { const u = auth(t, 'resident'); topicOf(k) || fail(404, 'Нет такой темы'); const st = u.topic_stars || [];
      u.topic_stars = st.includes(k) ? st.filter(x => x !== k) : [...st, k]; put('users', u); return { star: u.topic_stars.includes(k) }; },
    'GET /api/forum/:id': (t, b, k) => {
      const u = auth(t, 'resident'), tp = topicOf(k); if (k !== 'all' && !tp) fail(404, 'Нет такой темы');
      const out = col('threads').filter(x => x.topic !== 'comments' && (k === 'all' || x.topic === k)).map(x => { const [n, unread, last, ms] = threadStats(x.id, x.ts, u);
        const first = [...ms].sort((a, b) => a.ts < b.ts ? -1 : 1)[0];
        return { id: x.id, title: x.title, topic: x.topic, topic_name: (topicOf(x.topic) || {}).name || '', by: nameOf(x.by), n, unread, last, pinned: !!x.pinned,
          first: first ? first.text.slice(0, 300) : '', texts: ms.map(m => m.text).join(' ').slice(0, 3000) }; });
      out.sort((a, b) => a.last < b.last ? 1 : -1); out.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      return { topic: tp, threads: out };
    },
    'POST /api/forum/:id': (t, b, k) => {
      const u = auth(t, 'resident'); topicOf(k) || fail(404, 'Нет такой темы');
      const title = (b.title || '').trim(), text = (b.text || '').trim(); if (!title || !text) fail(400, 'Напишите название ветки и первое сообщение');
      const th = put('threads', { id: nid('t'), topic: k, by: u.id, title: title.slice(0, 140), pinned: false, ts: iso(now()) });
      put('fmsgs', { id: nid('m'), thread: th.id, user: u.id, text: text.slice(0, 2000), ts: iso(now()), reply_to: null, hidden: false });
      return { id: th.id };
    },
    'GET /api/threads/:id': (t, b, tid) => {
      const th = get('threads', tid) || fail(404, 'Нет такой ветки'), u = optUser(t);
      if (th.topic !== 'comments' && !(u && isRes(u))) fail(403, 'Обсуждения открыты резидентам');
      const ms = col('fmsgs').filter(m => m.thread === tid).sort((a, b) => a.ts < b.ts ? -1 : 1);
      const msgs = ms.map(m => { const [cnt, mine] = reactView(m.id, u, CFG.reactions.msg), rp = ms.find(x => x.id === m.reply_to);
        return { id: m.id, name: nameOf(m.user), mine: !!(u && m.user === u.id), ts: m.ts, hidden: !!m.hidden, text: m.hidden ? '' : m.text, reacts: cnt, my: mine,
          reply: rp ? { name: nameOf(rp.user), text: rp.hidden ? 'Сообщение скрыто' : rp.text.slice(0, 140) } : null }; });
      if (u) { u.seen = { ...(u.seen || {}), [tid]: iso(now()) }; put('users', u); }
      const tp = topicOf(th.topic);
      return { thread: { id: th.id, title: th.title, topic: th.topic, topic_name: tp ? tp.name : 'Комментарии', pinned: !!th.pinned }, msgs, can_write: !!(u && isRes(u)), admin: !!(u && u.role === 'admin') };
    },
    'POST /api/threads/:id': (t, b, tid) => {
      const u = auth(t, 'resident'); get('threads', tid) || fail(404, 'Нет такой ветки');
      const text = (b.text || '').trim().slice(0, 2000) || fail(400, 'Напишите сообщение');
      const rt = b.reply_to && (get('fmsgs', b.reply_to) || {}).thread === tid ? b.reply_to : null;
      put('fmsgs', { id: nid('m'), thread: tid, user: u.id, text, ts: iso(now()), reply_to: rt, hidden: false });
      u.seen = { ...(u.seen || {}), [tid]: iso(now()) }; put('users', u); return { ok: true };
    },
    'POST /api/fmsgs/:id/react': (t, b, id) => { const u = auth(t, 'resident'); get('fmsgs', id) || fail(404, 'Нет такого сообщения'); toggleReact(id, u, b.r, CFG.reactions.msg); return { ok: true }; },
    'POST /api/fmsgs/:id/report': (t, b, id) => { const u = auth(t, 'resident'), m = get('fmsgs', id) || fail(404, 'Нет такого сообщения');
      put('reports', { id: `${id}:${u.id}`, msg: id, thread: m.thread, user: u.id, ts: iso(now()) }); return { ok: true }; },
    'POST /api/admin/threads/:id/pin': (t, b, id) => { auth(t, 'admin'); const th = get('threads', id) || fail(404, 'Нет такой ветки'); th.pinned = !th.pinned; put('threads', th); return { pinned: th.pinned }; },
    'POST /api/admin/fmsgs/:id/hide': (t, b, id) => { auth(t, 'admin'); const m = get('fmsgs', id) || fail(404, 'Нет такого сообщения'); m.hidden = !m.hidden; put('fmsgs', m);
      if (m.hidden) db.reports = col('reports').filter(r => r.msg !== id); return { hidden: m.hidden }; },
    'GET /api/events': t => { const u = auth(t); return col('events').map(e => eventView(e, u)).filter(e => e.state !== 'past').sort((a, b) => a.start < b.start ? -1 : 1); },
    'POST /api/events/:id/book': (t, b, id) => {
      const u = auth(t), e = get('events', id) || fail(404, 'Нет такого вечера'), v = eventView(e, u);
      const spot = CFG.seats.balcony.find(x => x.k === b.balcony) || null, seats = spot ? 0 : b.plus_one && isRes(u) ? 2 : 1, size = spot ? spot.size : seats;
      if (col('bookings').some(x => x.user === u.id && x.event === id)) fail(409, 'Место уже за вами');
      if (v.state !== 'open') fail(409, 'Бронь на этот вечер сейчас закрыта');
      if (spot && v.balcony_free[spot.k] <= 0) fail(409, `${spot.name} на этот вечер уже занята. Посмотрите другие места на балконе.`);
      if (!spot && v.free < seats) fail(409, v.free ? `В зале осталось мест: ${v.free}. Посмотрите балкон.` : 'Места в зале закончились. Посмотрите балкон.');
      const extra = e.extra || 0; let paid, cur, used = false, usedFree = false, usedGuest = null;
      if (isRes(u)) {
        const c = tierOf(u);
        if (!unlocked(u, 'book')) fail(403, 'Бронь откроется, когда анкета заполнена на 30%');
        if (c.free_entry && col('bookings').filter(x => x.user === u.id && get('events', x.event).start > iso(now())).length >= CFG.booking.unlimited_active)
          fail(409, `По безлимитной карте можно держать не больше ${CFG.booking.unlimited_active} броней сразу. Отмените одну или дождитесь вечера.`);
        const r = paySeats(u, size, spot ? 0 : extra, spot ? `Бронь на балконе: ${spot.name.toLowerCase()}, ${e.title}` : `Бронь: ${e.title}`, resPrice(e.start)); paid = r.cost; cur = 'credits'; used = r.days; usedGuest = r.invite;
      } else {
        paid = v.my_price + (size - 1) * v.price_guest;
        if (u.balance >= paid) { u.balance -= paid; put('users', u); cur = 'credits'; tx(u, { credits: -paid, kind: 'guest', note: `Гостевой вход кредитами: ${e.title}` }); }
        else { cur = 'rub'; tx(u, { rub: paid, kind: 'guest', note: `Гостевой вход: ${e.title}` }); }
        if (v.deposit_back) { u.balance += v.deposit_back; put('users', u); tx(u, { credits: v.deposit_back, kind: 'refund', note: `Депозит брони: ${v.deposit_back} на счёт для бара` }); }   // депозит вечерней брони по коду: сверх входа — на счёт
        if (v.how === 'promo') usePromo(u, v.my_price - v.deposit_back);
      }
      put('bookings', { id: nid('b'), user: u.id, event: id, paid, cur, balcony: spot ? spot.k : null, seats, size, used_entry: used, used_free: usedFree, used_invite: usedGuest, guest: !isRes(u), deposit: v.deposit_back, arrived: false, burned: false, ts: iso(now()) });
      return { me: meView(get('users', u.id)), paid, cur, used_entry: used, used_free: usedFree, used_invite: usedGuest, balcony: !!spot };
    },
    'DELETE /api/events/:id/book': (t, b, id) => {
      const u = auth(t), bk = col('bookings').find(x => x.user === u.id && x.event === id) || fail(404, 'Брони нет');
      const refund = eventView(get('events', id), u).hours > CFG.booking.refund_hours && !bk.guest;
      if (refund) { if (bk.cur !== 'rub') u.balance += bk.paid;
        if (bk.used_entry) u.entries_left = (u.entries_left || 0) + (+bk.used_entry); if (bk.used_free) useFree(u, -1); if (bk.used_invite) useInvite(u, -(+bk.used_invite)); put('users', u);
        if (bk.cur !== 'rub' && (bk.paid || bk.used_entry || bk.used_free || bk.used_invite)) tx(u, { credits: bk.paid, kind: 'refund', days: +bk.used_entry || 0, inv: +bk.used_invite || 0, note: 'Возврат за отменённую бронь' + (bk.used_entry ? `, визиты вернулись в пакет: ${+bk.used_entry}` : '') + (bk.used_invite ? `, пригласительных вернулось: ${+bk.used_invite}` : '') }); }
      drop('bookings', bk.id);
      return { me: meView(u), refund, guest: !!bk.guest };
    },
    'GET /api/votes': t => {
      const u = auth(t, 'resident'), allv = col('votes'); rollVotes(u);
      const name = id => { const x = get('users', id) || {}; return (x.anketa || {}).alias || x.name || ''; };
      const proposals = col('proposals').map(p => ({ ...p, votes: p.seed_votes + allv.filter(v => v.proposal === p.id).length,
        mine: allv.filter(v => v.proposal === p.id && v.user === u.id).length, by_name: name(p.by) })).sort((a, b) => b.votes - a.votes);
      return { proposals, left: votesLeft(u), library: col('library') };
    },
    'POST /api/proposals': (t, b) => {
      const u = auth(t, 'resident');
      if (!unlocked(u, 'propose')) fail(403, 'Предлагать можно, когда анкета заполнена полностью');
      if (!['listen', 'film', 'buy'].includes(b.kind) || !(b.title || '').trim()) fail(400, 'Напишите, что предлагаете');
      if (b.kind === 'listen' && !col('library').some(l => `${l.artist} — ${l.title}` === b.title)) fail(400, 'Слушаем то, что есть в медиатеке клуба. Новое — во вкладке «Покупаем».');
      return put('proposals', { id: nid('p'), kind: b.kind, title: b.title.trim().slice(0, 120), link: (b.link || '').slice(0, 300), by: u.id, seed_votes: 0, status: 'open' });
    },
    'POST /api/proposals/:id/vote': (t, b, id) => {
      const u = auth(t, 'resident');
      if (!unlocked(u, 'vote')) fail(403, 'Голосование откроется, когда анкета заполнена на 30%');
      const p = get('proposals', id); if (!p || p.status !== 'open') fail(404, 'Голосование закрыто');
      rollVotes(u); const bonus = regularUsed(u) >= votesCap(u);
      if (bonus) { if ((u.bonus_votes || 0) <= 0) fail(409, 'Голоса на этот месяц закончились. Кто тратит все голоса месяца, в следующем получает на один больше.'); u.bonus_votes -= 1; put('users', u); }
      put('votes', { id: nid('v'), user: u.id, proposal: id, month: month(), bonus });
      return { left: votesLeft(u) };
    },
    // ---- медиатека: коллекция, вечера с голосованием, «купить в коллекцию»
    'GET /api/library': t => {
      const u = optUser(t), res = !!(u && isRes(u)); if (res) rollVotes(u);
      const evs = col('events').filter(e => e.pick && new Date(e.start) > now()).sort((a, b) => a.start < b.start ? -1 : 1)
        .map(e => { const b = ballot(e, u); return { id: e.id, kind: e.pick, start: e.start, title: e.title, counts: b.counts, total: b.total, mine: b.mine, open: b.open, lead: b.lead && b.lead.id }; });
      return { items: col('library'), evenings: evs, wishes: col('wishes').map(w => wishView(w, u, res)).sort((a, b) => (a.status === 'bought') - (b.status === 'bought') || b.wants - a.wants),
        goal: CFG.wish_goal || 10, left: res ? votesLeft(u) : null, can_pick: !!(res && unlocked(u, 'vote')), can_wish: !!(res && unlocked(u, 'propose')), admin: !!(u && u.role === 'admin') };
    },
    'POST /api/library/pick': (t, b) => {
      const u = auth(t, 'resident'); if (!unlocked(u, 'vote')) fail(403, 'Голосование откроется, когда анкета заполнена на 30%');
      const e = get('events', b.event || '') || fail(404, 'Нет такого вечера'), it = get('library', b.item || '') || fail(404, 'Этого нет в коллекции клуба');
      if (!e.pick || e.pick !== it.kind) fail(400, 'Этот вечер выбирают из другой полки');
      if (!ballot(e).open) fail(409, `Голосование закрыто: выбор фиксируем за ${(CFG.pick_close_hours || 48) / 24} дня до вечера`);
      const pid = `${e.id}:${u.id}`, had = get('picks', pid);
      if (!had) { rollVotes(u); const bonus = regularUsed(u) >= votesCap(u);
        if (bonus) { if ((u.bonus_votes || 0) <= 0) fail(409, 'Голоса на этот месяц закончились. Кто тратит все голоса месяца, в следующем получает на один больше.'); u.bonus_votes -= 1; put('users', u); }
        put('votes', { id: nid('v'), user: u.id, proposal: 'pick:' + e.id, month: month(), bonus }); }
      put('picks', { id: pid, ballot: e.id, item: it.id, user: u.id });
      return { left: votesLeft(u), changed: !!had, title: it.title };
    },
    'POST /api/library/wishes': (t, b) => {
      const u = auth(t, 'resident'); if (!unlocked(u, 'propose')) fail(403, 'Предлагать можно, когда анкета заполнена полностью');
      if (!['vinyl', 'film', 'book'].includes(b.kind) || !(b.title || '').trim()) fail(400, 'Напишите, что купить');
      const w = put('wishes', { id: nid('w'), kind: b.kind, by: (b.by || '').trim().slice(0, 80), title: b.title.trim().slice(0, 120), who: u.id, seed_wants: 0, status: 'open', ts: iso(now()) });
      put('wish_votes', { id: `${w.id}:${u.id}`, wish: w.id, user: u.id }); return wishView(w, u, true);
    },
    'POST /api/library/wishes/:id/want': (t, b, id) => {
      const u = auth(t, 'resident'); if (!unlocked(u, 'vote')) fail(403, 'Голосование откроется, когда анкета заполнена на 30%');
      const w = get('wishes', id) || fail(404, 'Нет такого предложения'); if (w.status !== 'open') fail(409, 'Уже купили');
      const vid = `${id}:${u.id}`; if (get('wish_votes', vid)) drop('wish_votes', vid); else put('wish_votes', { id: vid, wish: id, user: u.id });
      return wishView(w, u, true);
    },
    'POST /api/admin/wishes/:id/bought': (t, b, id) => {
      auth(t, 'admin'); const w = get('wishes', id) || fail(404, 'Нет такого предложения'); w.status = 'bought'; put('wishes', w);
      const it = put('library', { id: nid('l'), kind: w.kind, by: w.by, artist: w.kind === 'vinyl' ? w.by : undefined, title: w.title, year: '', genre: 'Новое', note: 'Купили по просьбе резидентов', fresh: true });
      return { text: `«${w.title}» — в коллекции клуба`, item: it };
    },
    'GET /api/members': t => {
      const u = auth(t, 'resident');
      if (!unlocked(u, 'members')) fail(403, 'Картотека откроется, когда анкета заполнена на 60%');
      const projects = col('projects');
      const list = col('users').filter(x => x.id !== u.id && isRes(x) && x.anketa.alias).map(x => { const [score, common, parts, match] = affinity(u, x, projects);
        const lk = col('links').find(l => (l.a === u.id && l.b === x.id) || (l.a === x.id && l.b === u.id));
        return { id: x.id, tier_name: CFG.tiers[x.tier].name, tier: x.tier, anketa: publicAnketa(x, u), score, parts, match, here: x.here_day === iso(now()).slice(0, 10), orbit: score >= 5 ? 1 : score >= 2 ? 2 : 3, common, link: linkOf(u.id, x.id), can_write: canWrite(u, x), unread: col('messages').filter(m => m.from === x.id && m.to === u.id && !m.read).length,
          note: lk && !lk.ok ? lk.note || '' : '', mutual: friendsOf(u.id).filter(z => z !== x.id && friendsOf(x.id).includes(z)).map(nameOf), friends: friendsOf(x.id).length,
          plans: x.show_plans === false ? null : plansOf(x.id).slice(0, 3).map(e => ({ id: e.id, title: eventView(e).title, start: e.start })), wants: wantsOf(x.id).slice(0, 6) }; }).sort((a, b) => b.score - a.score);
      const ids = list.map(m => m.id);
      return { me: { id: u.id, anketa: u.anketa, hidden: u.hidden || [], tier_name: CFG.tiers[u.tier].name, show_plans: u.show_plans !== false, friends: friendsOf(u.id).length, here: u.here_day === iso(now()).slice(0, 10) }, list, links: col('links').filter(l => l.ok && ids.includes(l.a) && ids.includes(l.b)).map(l => [l.a, l.b]) };
    },
    'POST /api/members/:id/know': (t, b, id) => {
      const u = auth(t, 'resident'), x = get('users', id) || fail(404, 'Нет такого резидента'), state = linkOf(u.id, id);
      if (state === 'incoming') { const l = col('links').find(l => (l.a === id && l.b === u.id)); l.ok = true; put('links', l); }
      else if (state === 'none') put('links', { id: `${u.id}-${id}`, a: u.id, b: id, ok: false, note: (b.note || '').trim().slice(0, 300) });
      // знакомство принято: записка становится первым сообщением переписки
      if (state === 'incoming') { const l = col('links').find(l => l.a === id && l.b === u.id); if (l && l.note) put('messages', { id: nid('msg'), from: id, to: u.id, text: l.note, read: true, ts: l.ts || iso(now()) }); }
      return { link: linkOf(u.id, id), name: x.anketa.alias || x.name };
    },
    // «Не сейчас»: входящую просьбу можно отклонить — линия не появится, человек об этом не узнает
    'POST /api/members/:id/decline': (t, b, id) => {
      const u = auth(t, 'resident'), l = col('links').find(l => l.a === id && l.b === u.id && !l.ok) || fail(404, 'Просьбы нет');
      drop('links', l.id); return { link: 'none' };
    },
    'GET /api/projects': t => {
      auth(t, 'resident'); const name = id => { const x = get('users', id) || {}; return (x.anketa || {}).alias || x.name || ''; };
      return col('projects').map(p => ({ ...p, owner_name: name(p.owner), member_names: p.members.map(name) }));
    },
    'POST /api/projects': (t, b) => {
      const u = auth(t, 'resident');
      if (!unlocked(u, 'projects')) fail(403, 'Вести проект можно, когда анкета заполнена полностью');
      if (!(b.title || '').trim()) fail(400, 'Назовите проект');
      return put('projects', { id: nid('j'), title: b.title.slice(0, 80), about: (b.about || '').slice(0, 400), need: (b.need || '').slice(0, 120),
        give: (b.give || '').slice(0, 120), status: 'идея', owner: u.id, members: [u.id] });
    },
    'POST /api/projects/:id/join': (t, b, id) => { const u = auth(t, 'resident'), p = get('projects', id) || fail(404, 'Нет такого проекта'); if (!p.members.includes(u.id)) { p.members.push(u.id); put('projects', p); } return p; },
    'GET /api/media': () => col('media').map(m => ({ ...m, can_play: true })),   // записи клуба бесплатны для всех: они нужны для рассказа о клубе
    'GET /api/shop': t => { const u = auth(t); return { products: col('products'), orders: col('orders').filter(o => o.user === u.id) }; },
    'POST /api/shop/:id/order': (t, b, id) => {
      const u = auth(t), p = get('products', id) || get('media', id) || fail(404, 'Нет такого товара');
      if ((p.for === 'guest' || id.startsWith('m')) && isRes(u)) fail(409, 'Резидентам записи открыты бесплатно.');
      if (p.for === 'resident' && !isRes(u)) fail(403, 'Пластинку с портретом делаем только резидентам.');
      if (p.for === 'resident' && !unlocked(u, 'cover')) fail(403, 'Обложку собираем по анкете. Сначала заполните её до конца.');
      if (u.balance < p.price) fail(402, `Не хватает кредитов: на счёте ${u.balance}, нужно ${p.price}. Пополните счёт в кабинете.`);
      u.balance -= p.price; let status = 'принят';
      if (id === 'online') { const base = hasOnline(u) ? new Date(u.online_until) : now(); u.online_until = iso(addDays(base, CFG.online_days)); status = 'доступ открыт'; }
      else if (id.startsWith('m')) { u.owned.push(id); status = 'доступ открыт'; }
      put('users', u); tx(u, { credits: -p.price, kind: 'shop', note: p.title });
      put('orders', { id: nid('o'), user: u.id, product: id, title: p.title, price: p.price, status, ts: iso(now()) });
      return { me: meView(u), status };
    },
    // ---- заказы: бармен записывает заказ на гостя — после визита гость оценивает именно его
    'POST /api/admin/orders': (t, b) => {
      const w = auth(t, 'staff'), u = get('users', b.user || '') || fail(404, 'Выберите гостя'), names = MENU().map(m => m.name), items = [...new Set(b.items || [])].filter(n => names.includes(n));
      if (!items.length) fail(400, 'Отметьте, что заказали');
      const o = put('bar_orders', { id: nid('bo'), user: u.id, items, by: (col('staff').find(x => x.user === w.id) || {}).id || null, service: null, ts: iso(now()) });
      return { id: o.id, name: u.name, text: `Заказ записан: ${items.length} поз. Гость сможет оценить его в кабинете.` };
    },
    'GET /api/orders/mine': t => { const u = auth(t); return { orders: col('bar_orders').filter(o => o.user === u.id).sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 12).map(orderView) }; },
    'POST /api/orders/:id/rate': (t, b, id) => {
      const u = auth(t), o = get('bar_orders', id) || fail(404, 'Нет такого заказа'); if (o.user !== u.id) fail(403, 'Это не ваш заказ');
      if (b.skip) { o.skipped = true; put('bar_orders', o); return { order: orderView(o), me: meView(u) }; }
      for (const [item, r] of Object.entries(b.items || {})) { const st = Math.round(+r.stars || 0); if (!o.items.includes(item) || st < 1 || st > 5) continue;
        put('ratings', { id: `${o.id}:${item}`, order: o.id, user: u.id, item, stars: st, text: (r.text || '').trim().slice(0, 300), ts: iso(now()) }); }
      const sv = Math.round(+b.service || 0); if (sv >= 1 && sv <= 5) o.service = sv;
      // пять звёзд за обслуживание — зелёная карточка тому, кто вёл заказ; одна на заказ
      if (o.service === 5 && o.by && !o.green) { o.green = true; put('cards', { id: nid('k'), staff: o.by, color: 'green', reason: 'Гость поставил пять звёзд за обслуживание', note: '', auto: true, by: null, ts: iso(now()) }); settleCards(); }
      put('bar_orders', o); return { order: orderView(o), me: meView(u) };
    },
    'GET /api/admin/people': t => { auth(t, 'staff'); return { users: col('users').filter(u => u.role !== 'staff').map(u => ({ id: u.id, name: u.name, resident: isRes(u) })) }; },
    'GET /api/admin/ratings': t => {
      auth(t, 'staff'); const all = col('ratings'), seed = SEED.rating_seed || {}, cn = col('council');
      const items = MENU().map(m => { const sd = seed[m.name] || { n: [0, 0, 0, 0, 0], comments: [] }, dist = [...sd.n]; const mine = all.filter(r => r.item === m.name); mine.forEach(r => { dist[r.stars - 1]++; });
        const n = dist.reduce((a, x) => a + x, 0), c = cn.find(x => x.item === m.name && x.status === 'open');
        return { ...m, n, avg: n ? Math.round(10 * dist.reduce((a, x, i) => a + x * (i + 1), 0) / n) / 10 : null, dist, council: c ? c.id : null,
          comments: [...mine.filter(r => r.text).map(r => ({ stars: r.stars, text: r.text, ts: r.ts })), ...sd.comments.map(c => ({ stars: c.stars, text: c.text, ts: iso(addDays(now(), c.day)) }))].sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 6) }; });
      const sv = [...(SEED.service_seed || []), ...col('bar_orders').map(o => o.service).filter(Boolean)];
      return { items, min: CFG.rating_min || 5, service: { n: sv.length, avg: sv.length ? Math.round(10 * sv.reduce((a, x) => a + x, 0) / sv.length) / 10 : null, dist: [1, 2, 3, 4, 5].map(k => sv.filter(x => x === k).length) },
        orders: col('bar_orders').sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 12).map(o => ({ ...orderView(o), name: (get('users', o.user) || {}).name || '', by: (get('staff', o.by) || {}).name || '' })) };
    },
    // ---- совет меню: резиденты решают, что оставить, что доработать и что добавить. Оценок здесь не видно.
    'GET /api/council': t => {
      const u = optUser(t), res = !!(u && isRes(u));
      const items = col('council').map(c => { const cnt = { ...c.seed }; col('council_votes').filter(v => v.council === c.id).forEach(v => { cnt[v.choice] = (cnt[v.choice] || 0) + 1; });
        return { id: c.id, item: c.item, status: c.status, decision: c.decision || '', counts: cnt, total: cnt.keep + cnt.fix + cnt.drop, mine: u ? (get('council_votes', `${c.id}:${u.id}`) || {}).choice || null : null, ts: c.ts }; }).sort((a, b) => a.ts < b.ts ? 1 : -1);
      const wishes = col('menu_wishes').map(w => { const vs = col('menu_wish_votes').filter(v => v.wish === w.id); return { ...w, wants: (w.seed_wants || 0) + vs.length, mine: !!(u && vs.some(v => v.user === u.id)), by_name: nameOf(w.who) }; })
        .sort((a, b) => (a.status !== 'open') - (b.status !== 'open') || b.wants - a.wants);
      return { items, wishes, goal: CFG.menu_wish_goal || 10, can_vote: res, admin: !!(u && u.role === 'admin') };
    },
    'POST /api/council/:id/vote': (t, b, id) => {
      const u = auth(t, 'resident'), c = get('council', id) || fail(404, 'Нет такого вопроса'); if (c.status !== 'open') fail(409, 'Решение уже принято');
      if (!['keep', 'fix', 'drop'].includes(b.choice)) fail(400, 'Выберите вариант'); put('council_votes', { id: `${id}:${u.id}`, council: id, user: u.id, choice: b.choice }); return { ok: true };
    },
    'POST /api/council/wishes': (t, b) => {
      const u = auth(t, 'resident'); if (!(b.title || '').trim()) fail(400, 'Напишите, что добавить');
      const w = put('menu_wishes', { id: nid('mw'), title: b.title.trim().slice(0, 80), note: (b.note || '').trim().slice(0, 160), who: u.id, seed_wants: 0, status: 'open', ts: iso(now()) });
      put('menu_wish_votes', { id: `${w.id}:${u.id}`, wish: w.id, user: u.id }); return { ok: true };
    },
    'POST /api/council/wishes/:id/want': (t, b, id) => {
      const u = auth(t, 'resident'), w = get('menu_wishes', id) || fail(404, 'Нет такого предложения'); if (w.status !== 'open') fail(409, 'Уже в меню');
      const vid = `${id}:${u.id}`; if (get('menu_wish_votes', vid)) drop('menu_wish_votes', vid); else put('menu_wish_votes', { id: vid, wish: id, user: u.id }); return { mine: !!get('menu_wish_votes', vid) };
    },
    'POST /api/admin/council': (t, b) => {
      auth(t, 'admin'); if (!MENU().some(m => m.name === b.item)) fail(404, 'Нет такой позиции'); if (col('council').some(c => c.item === b.item && c.status === 'open')) fail(409, 'Эта позиция уже на совете');
      put('council', { id: nid('c'), item: b.item, status: 'open', seed: { keep: 0, fix: 0, drop: 0 }, decision: '', ts: iso(now()) }); return { text: `«${b.item}» вынесли на совет меню` };
    },
    'POST /api/admin/council/:id/close': (t, b, id) => {
      auth(t, 'admin'); const c = get('council', id) || fail(404, 'Нет такого вопроса'); c.status = 'closed'; c.decision = (b.decision || '').trim().slice(0, 200) || 'Решение принято'; put('council', c); return { text: 'Решение записано' };
    },
    'POST /api/admin/council/wishes/:id/done': (t, b, id) => {
      auth(t, 'admin'); const w = get('menu_wishes', id) || fail(404, 'Нет такого предложения'); w.status = 'done'; put('menu_wishes', w); return { text: `«${w.title}» — в меню` };
    },
    // ---- команда: карточки сотрудников, фонд команды, настройки порогов
    'GET /api/team': t => teamView(auth(t, 'staff')),
    'POST /api/team/cards': (t, b) => {
      const u = auth(t, 'admin'), C = cardCfg(); get('staff', b.staff || '') || fail(404, 'Выберите сотрудника');
      if (!['yellow', 'red', 'green'].includes(b.color)) fail(400, 'Выберите карточку'); if (!(b.reason || '').trim()) fail(400, 'Укажите причину — без неё карточку выдать нельзя');
      put('cards', { id: nid('k'), staff: b.staff, color: b.color, reason: b.reason.trim().slice(0, 120), note: (b.note || '').trim().slice(0, 300), by: u.id, ts: iso(now()) }); settleCards(); return teamView(u);
    },
    'POST /api/team/cards/:id/dispute': (t, b, id) => {
      const u = auth(t, 'staff'), c = get('cards', id) || fail(404, 'Нет такой карточки'), mine = col('staff').find(x => x.user === u.id);
      if (!mine || c.staff !== mine.id) fail(403, 'Ответить можно только на свою карточку'); if (!(b.text || '').trim()) fail(400, 'Напишите, с чем не согласны');
      c.dispute = { text: b.text.trim().slice(0, 300), status: 'open', ts: iso(now()) }; put('cards', c); return teamView(u);
    },
    'POST /api/team/cards/:id/resolve': (t, b, id) => {
      const u = auth(t, 'admin'), c = get('cards', id) || fail(404, 'Нет такой карточки');
      if (b.void) { c.void = true; if (c.dispute) c.dispute.status = 'accepted'; } else if (c.dispute) c.dispute.status = 'kept';
      put('cards', c); return teamView(u);
    },
    'PUT /api/team/settings': (t, b) => {
      const u = auth(t, 'admin'), cur = get('settings', 'cards') || { id: 'cards' };
      for (const k of ['yellow_to_red', 'red_limit', 'green_to_purple', 'purple_rub', 'yellow_days', 'purple_cap', 'premium_cut']) { const v = Math.round(+b[k]); if (v > 0) cur[k] = v; }
      if (typeof b.premium_link === 'boolean') cur.premium_link = b.premium_link;
      put('settings', cur); settleCards(); return teamView(u);
    },
    'POST /api/team/staff': (t, b) => { const u = auth(t, 'admin'); if (!(b.name || '').trim()) fail(400, 'Имя сотрудника'); put('staff', { id: nid('s'), name: b.name.trim().slice(0, 40), post: (b.post || '').trim().slice(0, 40) }); return teamView(u); },
    'POST /api/team/ideas': (t, b) => {
      const u = auth(t, 'staff'), mine = col('staff').find(x => x.user === u.id); if (!(b.title || '').trim()) fail(400, 'На что потратить');
      put('fund_ideas', { id: nid('fi'), title: b.title.trim().slice(0, 120), who: mine ? mine.id : null, votes: mine ? [mine.id] : [] }); return teamView(u);
    },
    'POST /api/team/ideas/:id/vote': (t, b, id) => {
      const u = auth(t, 'staff'), mine = col('staff').find(x => x.user === u.id) || fail(403, 'Голосуют сотрудники'), i = get('fund_ideas', id) || fail(404, 'Нет такой идеи');
      i.votes = i.votes.includes(mine.id) ? i.votes.filter(x => x !== mine.id) : [...i.votes, mine.id]; put('fund_ideas', i); return teamView(u);
    },
    'POST /api/team/spend': (t, b) => {
      const u = auth(t, 'admin'), rub = Math.round(+b.rub || 0), v = teamView(u); if (rub <= 0 || !(b.title || '').trim()) fail(400, 'Сумма и на что потратили');
      if (rub > v.fund.left) fail(409, `В фонде ${v.fund.left} ₽`); put('fund_spend', { id: nid('fs'), title: b.title.trim().slice(0, 120), rub, ts: iso(now()) }); return teamView(u);
    },
    'GET /api/admin/overview': t => {
      auth(t, 'admin'); const users = col('users').filter(u => u.role !== 'staff'), txs = col('tx'), res = users.filter(isRes), cnt = a => a.reduce((o, i) => (o[i] = (o[i] || 0) + 1, o), {});
      return { residents: res.length, guests: users.length - res.length, balances: users.reduce((s, u) => s + u.balance, 0),
        rub_today: txs.filter(x => x.ts.slice(0, 10) === iso(now()).slice(0, 10)).reduce((s, x) => s + x.rub, 0),
        by_tier: Object.fromEntries(Object.entries(CFG.tiers).map(([k, c]) => [c.name, res.filter(u => u.tier === k).length])),
        sources: cnt(users.map(u => u.anketa.source).filter(Boolean)),
        users: users.map(u => ({ id: u.id, name: u.name, role: u.role, tier: u.tier, balance: u.balance, nfc: u.nfc, progress: progress(u), resident: isRes(u), entries_left: u.entries_left || 0 })),
        visits: col('visits').filter(v => v.status === 'open'),
        balcony_today: col('bookings').filter(k => k.balcony && !k.arrived && !k.burned && (get('events', k.event) || { start: '' }).start.slice(0, 10) === iso(now()).slice(0, 10)).map(k => ({ id: k.id, name: (get('users', k.user) || {}).name || '', deposit: k.deposit || 0, spot: (CFG.seats.balcony.find(x => x.k === k.balcony) || {}).name || '' })),
        promos: col('promos').map(promoStats), host: [...col('host_requests')].reverse(), events_next: col('events').filter(e => e.start > iso(now())).sort((x, y) => x.start < y.start ? -1 : 1).slice(0, 21).map(e => ({ id: e.id, title: e.title, start: e.start })),
        schedule: col('events').filter(e => e.start >= iso(addDays(now(), -14)) && e.start <= iso(addDays(now(), 42))).sort((x, y) => x.start < y.start ? -1 : 1)
          .map(e => ({ ...Object.fromEntries(['id', 'title', 'start', 'end', 'kind', 'note', 'host', 'host_user', 'gift', 'promo', 'extra', 'extra_guest', 'residents_only', 'idea'].map(k => [k, e[k] ?? null])),
            booked: col('bookings').filter(x => x.event === e.id).reduce((s, x) => s + (x.size || 1), 0) + (e.seed_booked || 0) })),
        ideas: [...col('ideas')].reverse().map(i => ideaView(i)), idea_kinds: IDEA_KINDS, orders: col('orders'), tx: [...txs].reverse().slice(0, 30),
        reports: col('reports').map(r => ({ msg: r.msg, thread: r.thread, text: ((get('fmsgs', r.msg) || {}).text || '').slice(0, 200), by: (get('users', r.user) || {}).name || '' })) };
    },
    // Промокод организатора: гости встречи проходят по цене резидента (или по цене, которую задал клуб),
    // каждый вход по коду записывается, организатору начисляется выплата с каждого гостя. Пустая цена — вход резидента.
    'POST /api/admin/promos': (t, b) => {
      auth(t, 'admin'); const code = (b.code || '').trim().toUpperCase().replace(/[^A-ZА-Я0-9-]/g, '') || 'KOKO-' + hex(), O = CFG.org || {};
      if (get('promos', code)) fail(409, `Промокод ${code} уже есть. Придумайте другой или оставьте поле пустым.`);
      const total = parseInt(b.total) || O.uses || 20, price = b.price === '' || b.price == null ? null : Math.max(0, parseInt(b.price) || 0), ev = b.event ? get('events', b.event) : null;
      const until = ev ? ev.start.slice(0, 10) + 'T23:59' : iso(addDays(now(), parseInt(b.days) || O.days || 14));
      return promoStats(put('promos', { id: code, code, price, total, left: total, kind: (b.org || '').trim() ? 'event' : 'club', by: null, created: iso(now()), until, note: (b.note || (ev ? ev.title : '')).slice(0, 80),
        org: (b.org || '').trim().slice(0, 80), contact: (b.contact || '').trim().slice(0, 80), payout: Math.max(0, parseInt(b.payout) || 0), prepaid: Math.max(0, parseInt(b.prepaid) || 0), event: ev ? ev.id : null, token: 'R' + hex() + hex(), paid_out: 0 }));
    },
    'POST /api/admin/promos/:id/payout': (t, b, id) => {
      auth(t, 'admin'); const p = get('promos', id) || fail(404, 'Нет такого промокода'), s = promoStats(p), amount = parseInt(b.amount) || s.due;
      if (amount <= 0) fail(409, 'Выплачивать нечего: всё начисленное уже выплачено.');
      p.paid_out = (p.paid_out || 0) + amount; put('promos', p); put('payouts', { id: nid('po'), code: p.code, org: p.org, amount, ts: iso(now()) });
      return promoStats(p);
    },
    'GET /api/code/:id': (t, b, code) => {   // страница промокода для гостей встречи: открыта без входа
      const p = get('promos', (code || '').toUpperCase()); if (!p || p.kind === 'invite') fail(404, 'Такого промокода нет. Проверьте ссылку.');
      const ev = p.event ? get('events', p.event) : null;
      return { code: p.code, price: p.price, prices: [promoPrice(p, '2000-01-01T10:00'), promoPrice(p, '2000-01-01T19:00')], deposit: CFG.booking.deposit, guest: CFG.entry.guest, note: p.note || '', org: p.org || '', until: p.until, left: p.left, expired: p.until < iso(now()), event: ev ? { id: ev.id, title: ev.title, start: ev.start } : null };
    },
    'GET /api/org/:id': (t, b, token) => {   // отчёт организатора по секретной ссылке: сколько гостей прошло по коду и сколько ему причитается
      const p = col('promos').find(x => x.token === token) || fail(404, 'Отчёт не найден. Проверьте ссылку.');
      const ev = p.event ? get('events', p.event) : null;
      return { ...promoStats(p), event: ev ? { title: ev.title, start: ev.start } : null, payouts: col('payouts').filter(x => x.code === p.code).map(x => ({ amount: x.amount, ts: x.ts })),
        uses: col('promo_uses').filter(x => x.code === p.code).map((x, i) => ({ n: i + 1, ts: x.ts, price: x.price })) };
    },
    'POST /api/host': (t, b) => {   // заявка на свою встречу: форма открыта без входа
      if (!(b.name || '').trim() || !(b.contact || '').trim()) fail(400, 'Напишите имя и как с вами связаться');
      put('host_requests', { id: nid('h'), name: b.name.trim().slice(0, 80), contact: b.contact.trim().slice(0, 80), way: b.way || '', slot: b.slot || '', guests: parseInt(b.guests) || 0, about: (b.about || '').trim().slice(0, 600), ts: iso(now()) });
      return { ok: true };
    },
    'POST /api/admin/checkin': (t, b) => {
      auth(t, 'admin');
      let u = get('users', b.user || '') || col('users').find(x => x.nfc && x.nfc === b.nfc) || fail(404, 'Карта не найдена');
      const today = iso(now()).slice(0, 10);
      const bk = col('bookings').find(k => k.user === u.id && get('events', k.event).start.slice(0, 10) === today);
      if (bk) return { name: u.name, text: 'Вход по брони, уже оплачен', balance: u.balance };
      if (b.mode === 'day') { put('visits', { id: nid('s'), user: u.id, name: u.name, ts: iso(now()), status: 'open' }); return { name: u.name, text: 'Выданы песочные часы: первые полчаса бесплатно', balance: u.balance }; }
      const ev = col('events').filter(e => e.start.slice(0, 10) === today).sort((a, b) => a.start < b.start ? -1 : 1)[0];
      if (ev && eventView(ev, u).free <= 0) return { name: u.name, text: 'Зал полон: свободных мест на вечер нет.', balance: u.balance };
      const text = doorCharge(u, 'Вход без брони');
      if (ev) put('bookings', { id: nid('b'), user: u.id, event: ev.id, paid: 0, cur: 'door', balcony: null, seats: 1, size: 1, used_entry: false, guest: true, ts: iso(now()) });
      u = get('users', u.id);
      return { name: u.name, text, balance: u.balance };
    },
    'POST /api/admin/bookings/:id/noshow': (t, b, id) => {
      auth(t, 'admin'); const k = get('bookings', id) || fail(404, 'Нет такой брони'), u = get('users', k.user);
      tx(u, { kind: 'noshow', note: 'Неявка на балкон: опоздание больше получаса, оплата не возвращается' }); drop('bookings', id);
      return { name: u.name, text: 'не пришёл: посадка свободна, оплата не возвращается' };
    },
    'POST /api/admin/visits/:id': (t, b, id) => {
      auth(t, 'admin'); const v = get('visits', id) || fail(404, 'Нет такого визита'), u = get('users', v.user);
      const text = b.stay ? doorCharge(u, 'Дневной визит') : 'Ушёл в первые полчаса: бесплатно';
      v.status = 'closed'; put('visits', v);
      return { name: u.name, text };
    },
    'POST /api/admin/credit': (t, b) => {
      auth(t, 'admin'); const u = get('users', b.user || '') || fail(404, 'Участник не найден');
      let amount = parseInt(b.amount) || 0;
      u.balance += amount; u.bonus_votes = (u.bonus_votes || 0) + (parseInt(b.votes) || 0); put('users', u);
      tx(u, { credits: amount, kind: 'club', note: b.note || 'Кредиты от клуба' });
      return { amount, balance: u.balance };
    },
    'POST /api/admin/proposals/:id/win': (t, b, id) => {
      auth(t, 'admin'); const p = get('proposals', id) || fail(404, 'Нет такого предложения'); p.status = 'won'; put('proposals', p);
      if (p.kind === 'buy') return { text: `«${p.title}» — в списке закупки` };
      const start = addDays(now(), parseInt(b.in_days) || 27); start.setHours(19, 0, 0, 0);
      const film = p.kind === 'film';
      put('events', { id: nid('e'), time: '19:00', kind: film ? 'cinema' : 'vinyl', title: (film ? 'Кино у камина: ' : 'Альбом целиком: ') + p.title,
        note: 'Победитель голосования резидентов', extra: 0, start: iso(start), seed_booked: 0 });
      return { text: `«${p.title}» — в календаре на ${pad(start.getDate())}.${pad(start.getMonth() + 1)}` };
    },
    // ---- предложения встреч: любой гость предлагает → команда смотрит → резиденты голосуют «за» и «против» → команда ставит в расписание
    'POST /api/ideas': (t, b) => {
      let u = null; if (t) { try { u = auth(t); } catch (e) { u = null; } }
      const title = (b.title || '').trim(); if (title.length < 4) fail(400, 'Напишите, как называется встреча');
      const name = (b.name || (u ? u.name : '')).trim(), contact = (b.contact || (u ? u.phone || '' : '')).trim();
      if (!u && (!name || !contact)) fail(400, 'Напишите имя и как с вами связаться');
      if (!u && !b.pd) fail(400, 'Нужно согласие на обработку имени и контакта');
      const i = put('ideas', { id: nid('i'), by: u ? u.id : null, name: name.slice(0, 80), contact: contact.slice(0, 80), title: title.slice(0, 120), about: (b.about || '').trim().slice(0, 1200),
        kind: IDEA_KINDS[b.kind] ? b.kind : 'club', slot: ['morning', 'evening'].includes(b.slot) ? b.slot : 'any', when: (b.when || '').trim().slice(0, 120),
        series: Math.max(1, Math.min(12, parseInt(b.series) || 1)), host: (b.host || name).trim().slice(0, 80), guests: Math.max(0, parseInt(b.guests) || 0),
        needs: (b.needs || '').trim().slice(0, 300), status: 'new', reason: '', ts: iso(now()), vote_until: null, events: [] });
      return ideaView(i, u);
    },
    'GET /api/ideas': t => { const u = auth(t), all = col('ideas');
      return { voting: all.filter(i => i.status === 'voting').map(i => ideaView(i, u)), mine: [...all].reverse().filter(i => i.by === u.id).map(i => ideaView(i, u)), can_vote: isRes(u), kinds: IDEA_KINDS }; },
    'POST /api/ideas/:id/vote': (t, b, id) => {
      const u = auth(t, 'resident'), i = get('ideas', id) || fail(404, 'Нет такого предложения');
      if (i.status !== 'voting') fail(409, 'Голосование по этой встрече закрыто');
      const v = (parseInt(b.v) || 0) > 0 ? 1 : -1, key = `${id}:${u.id}`, old = get('idea_votes', key);
      if (old && old.v === v) drop('idea_votes', key); else put('idea_votes', { id: key, idea: id, user: u.id, v, ts: iso(now()) });
      return ideaView(i, u);
    },
    'POST /api/admin/ideas/:id': (t, b, id) => {
      auth(t, 'admin'); const i = get('ideas', id) || fail(404, 'Нет такого предложения');
      if (b.action === 'vote') Object.assign(i, { status: 'voting', vote_until: iso(addDays(now(), parseInt(b.days) || 7)), reason: '' });
      else if (b.action === 'reject') Object.assign(i, { status: 'rejected', reason: (b.reason || '').trim().slice(0, 300) || 'Не подходит клубу' });
      else if (b.action === 'new') Object.assign(i, { status: 'new', reason: '' });
      else fail(400, 'Неизвестное действие');
      put('ideas', i); return ideaView(i);
    },
    'POST /api/admin/events': (t, b) => {
      auth(t, 'admin'); const title = (b.title || '').trim(); if (title.length < 3) fail(400, 'Напишите название события');
      if (!/^\d{4}-\d\d-\d\d/.test(b.date || '')) fail(400, 'Выберите дату');
      const slot = SLOTS[b.slot] ? b.slot : 'evening', t0 = (b.time || SLOTS[slot][0]).slice(0, 5), t1 = (b.end || SLOTS[slot][1]).slice(0, 5);
      if (slotOf(t0) !== slot) fail(400, 'Время не совпадает с частью дня: утро — до 13:00, вечер — после');
      const n = Math.max(1, Math.min(12, parseInt(b.repeat) || 1)), first = new Date(b.date.slice(0, 10) + 'T12:00');
      const dates = Array.from({ length: n }, (_, k) => iso(addDays(first, 7 * k)).slice(0, 10));
      const clash = dates.map(d => [d, busy(d, slot)]).find(([, e]) => e);
      if (clash) fail(409, `${slot === 'morning' ? 'Утро' : 'Вечер'} ${clash[0].slice(8, 10)}.${clash[0].slice(5, 7)} уже занято: «${clash[1].title}»`);
      const extra = Math.max(0, parseInt(b.extra) || 0), extraGuest = Math.max(0, parseInt(b.extra_guest) || extra), hostUser = b.host_user || null;
      const host = (b.host || (get('users', hostUser || '') || {}).name || '').trim().slice(0, 80);
      const out = dates.map((d, k) => put('events', { id: nid('e'), title: n > 1 ? `${title}, встреча ${k + 1}` : title, kind: b.kind || 'lecture', note: (b.note || '').trim().slice(0, 300),
        start: `${d}T${t0}`, time: t0, end: t1, extra, extra_guest: extraGuest, theme: slot === 'evening' ? CFG.week[(new Date(d + 'T12:00').getDay() + 6) % 7].name : 'Мастер-классы и клубы',
        host, host_user: hostUser, residents_only: !!b.residents_only, seed_booked: 0, idea: b.idea || null, gift: null, status: 'scheduled' }));
      let promo = null; const org = (b.org || '').trim().slice(0, 80);
      if (org && (parseInt(b.quota) || 0) > 0) {
        let code = (b.code || '').trim().toUpperCase().replace(/[^A-ZА-Я0-9-]/g, '') || 'KOKO-' + hex(); if (get('promos', code)) code += '-' + hex().slice(0, 2);
        const q = parseInt(b.quota);
        promo = put('promos', { id: code, code, price: null, total: q, left: q, kind: 'event', by: null, created: iso(now()), until: dates[n - 1] + 'T23:59', note: title.slice(0, 80), org,
          contact: (b.contact || '').trim().slice(0, 80), payout: 0, prepaid: 0, event: n === 1 ? out[0].id : null, token: 'R' + hex() + hex(), paid_out: 0 });
        out.forEach(e => { e.promo = code; put('events', e); });
      }
      if (b.idea) { const i = get('ideas', b.idea); if (i) { i.status = 'scheduled'; i.events = out.map(e => e.id); put('ideas', i); } }
      return { events: out, promo: promo ? promoStats(promo) : null };
    },
    'PUT /api/admin/events/:id': (t, b, id) => {
      auth(t, 'admin'); const e = get('events', id) || fail(404, 'Нет такого события');
      for (const k of ['title', 'note', 'host', 'kind']) if (b[k] != null) e[k] = String(b[k]).trim().slice(0, 300);
      if (b.date || b.time) { const d = (b.date || e.start.slice(0, 10)).slice(0, 10), t0 = (b.time || e.start.slice(11, 16)).slice(0, 5), other = busy(d, slotOf(t0), id);
        if (other) fail(409, `Это время уже занято: «${other.title}»`); e.start = `${d}T${t0}`; e.time = t0; }
      for (const k of ['extra', 'extra_guest']) if (b[k] !== undefined && b[k] !== '') e[k] = Math.max(0, parseInt(b[k]) || 0);
      if ('residents_only' in b) e.residents_only = !!b.residents_only;
      return put('events', e);
    },
    'DELETE /api/admin/events/:id': (t, b, id) => {   // отмена: всем записавшимся возвращаем то, чем платили; гостям рубли — кредитами на счёт
      auth(t, 'admin'); const e = get('events', id) || fail(404, 'Нет такого события'); let n = 0;
      for (const bk of col('bookings').filter(x => x.event === id)) {
        const u = get('users', bk.user); if (bk.used_entry) u.entries_left = (u.entries_left || 0) + +bk.used_entry; if (bk.used_invite) u.invites = (u.invites || 0) + +bk.used_invite;
        const back = (bk.paid || 0) - (bk.deposit || 0); u.balance += back; put('users', u);
        tx(u, { credits: back, kind: 'refund', note: `Событие отменено: ${e.title}`, days: +bk.used_entry || 0, inv: +bk.used_invite || 0 }); drop('bookings', bk.id); n++; }
      drop('events', id); return { refunded: n };
    },
    'POST /api/admin/events/:id/gift': (t, b, id) => {   // подарок ведущему: ведущим не платим, в клубе все равны
      auth(t, 'admin'); const e = get('events', id) || fail(404, 'Нет такого события'), g = CFG.host_gifts.find(x => x.k === b.gift) || fail(400, 'Выберите подарок');
      const u = get('users', e.host_user || ''), text = `Подарок клуба: ${g.name.toLowerCase()}`;
      if (u) {
        if (g.k === 'month') { if (isRes(u)) u.tier_until = iso(addDays(new Date(u.tier_until), 30)); else Object.assign(u, { tier: 'month', tier_until: iso(addDays(now(), 30)), invites: (u.invites || 0) + CFG.tiers.month.invites }); }
        if (g.k === 'invites') { if (!isRes(u)) fail(409, `${u.name} пока не резидент: пригласительные работают с клубной картой. Подарите месяц в клубе.`); u.invites = (u.invites || 0) + 2; }
        put('users', u); tx(u, { kind: 'club', note: `${text} — за встречу «${e.title}»`, inv: g.k === 'invites' ? 2 : 0 });
      }
      e.gift = { k: g.k, name: g.name, ts: iso(now()) }; put('events', e);
      return { text: `${e.host || 'Ведущий'}: ${text}` + (u ? '' : ' (ведущий без аккаунта — вручите лично)') };
    },
    'POST /api/admin/reset': t => { auth(t, 'admin'); seed(); db.day = iso(now()).slice(0, 10); return { ok: true }; },
  };
  const table = Object.entries(R).map(([k, fn]) => { const [m, p] = k.split(' '); return { m, re: new RegExp('^' + p.replace(':id', '([^/]+)') + '$'), fn }; });
  return async function (method, path, body, token) {
    for (const r of table) { const mt = r.m === method && path.match(r.re); if (mt) { const out = r.fn(token, body || {}, mt[1]); save(); return JSON.parse(JSON.stringify(out)); } }
    throw new Fail(404, 'Нет такого адреса: ' + path);
  };
};
