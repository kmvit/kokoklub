import { api } from '../src/api';

export function marketScreen({ S, band, pageHead, blockTitle, esc, cr, rub, A, F, modal, closeModal, draw, toast }) {
  let current;
  A.orderproduct = el => {
    const row = current.products.find(p => p.id === Number(el.dataset.id));
    if (!row) return;
    modal(`<h2 class="t-block">${esc(row.title)}</h2><p>С клубного счёта спишется ${cr(row.price)}.</p>
      <form data-form="orderproduct" data-id="${row.id}" data-price="${row.price}" data-reference="${crypto.randomUUID()}"><button class="btn primary">Подтвердить заказ</button></form>`);
  };
  F.orderproduct = async (_, form) => {
    await api.post(`/shop/${form.dataset.id}/order/`, {reference:form.dataset.reference, price:+form.dataset.price});
    closeModal(); await draw(); toast('Заказ принят.');
  };
  F.giftcheckout = async (data, form) => {
    const amount = data.purpose === 'gift_tokens' ? Number(data.amount) : S.cfg.tiers[data.purpose.slice(5)].price;
    const fingerprint = data.purpose + '-' + amount;
    if (form.dataset.quote !== fingerprint) {
      form.dataset.quote = fingerprint;
      form.dataset.reference = crypto.randomUUID();
    }
    const order = await api.post('/me/payments/tbank/', {purpose:data.purpose,amount,reference:form.dataset.reference});
    location.assign(order.payment_url);
  };
  F.redeemvoucher = async data => { await api.post('/gift/redeem/', {code:data.code}); await draw(); toast('Подарок получен.'); };
  F.givevisits = async (data, form) => {
    await api.post('/packs/give/', {member:Number(data.member), quantity:Number(data.quantity), reference:form.dataset.reference});
    await draw(); toast('Визиты переданы.');
  };
  return async () => {
    const [store, directory] = await Promise.all([api.get('/shop/'), S.me.resident && S.places.visits ? api.get('/directory/') : null]);
    current = store;
    return band(pageHead('shop','Лавка','Заказы, подарочные карты и пакетные визиты.') +
      '<div class="grid g3">' + store.products.map(p => `<article class="card"><h2 class="t-card">${esc(p.title)}</h2><p>${esc(p.description)}</p><p class="price">${cr(p.price)}</p>
        <button class="btn primary" data-act="orderproduct" data-id="${p.id}">Заказать</button></article>`).join('') + '</div>' +
      (store.orders.length ? blockTitle('Ваши заказы') + store.orders.map(o => `<p>${esc(o.title)} · ${cr(o.price)} · ${esc(o.status)}</p>`).join('') : '') +
      blockTitle('Подарочные карты') + (store.bank ? `<form class="form" data-form="giftcheckout"><label>Подарок<select name="purpose"><option value="gift_tokens">Кредиты</option>${['month','half','year'].map(k => `<option value="gift_${k}">${esc(S.cfg.tiers[k].name)} · ${rub(S.cfg.tiers[k].price)}</option>`).join('')}</select></label><label>Номинал подарка в кредитах<input name="amount" type="number" min="1" max="1000000" value="1000" required></label><button class="btn">Перейти к оплате в Т-Банке</button></form>` : '<p>Онлайн-оплата подарочных карт пока недоступна.</p>') +
      store.gifts.map(g => `<p>${rub(g.amount)} · ${g.redeemed_at ? 'Получен' : `Код подарка <b>${esc(g.gift_code)}</b>`}</p>`).join('') +
      '<form class="form" data-form="redeemvoucher"><label>Код подарка<input name="code" required></label><button class="btn">Получить подарок</button></form>' +
      (directory?.list.length ? `<details class="fold"><summary>Подарить визиты</summary><form class="form" data-form="givevisits" data-reference="${crypto.randomUUID()}"><label>Резидент<select name="member">${directory.list.map(m => `<option value="${m.id}">${esc(m.anketa.alias)}</option>`).join('')}</select></label><label>Количество<input name="quantity" type="number" value="1" min="1" max="${S.places.visits}" required></label><button class="btn">Передать визиты</button></form></details>` : '') +
      '<div id="club-workspace"></div>');
  };
}
