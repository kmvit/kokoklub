// Schedule administration and the organizer's own codes share the original cards and form controls.
import { api } from '../src/api';
export function scheduleScreens({ esc, band, pageHead, draw, modal, closeModal, toast, A, F }) {
  let state;
  const field = (key, label, type, value, extra = '') => `<label class="field">${label}<input type="${type}" name="${key}" value="${esc(value ?? '')}" ${extra}></label>`;
  const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  A.editschedule = el => {
    const event = state.events.find(e => String(e.id) === el.dataset.id) || {};
    const local = event.starts_at && new Date(Date.parse(event.starts_at) + 10800000).toISOString().slice(0, 16);
    const quota = (k, label) => field(k, label, 'number', event[k] ?? 0, 'min="0" required');
    modal(`<h2 class="t-block">${event.id ? 'Изменить встречу' : 'Новая встреча'}</h2><form class="form" data-form="schedule" data-id="${event.id || ''}">
      ${field('title', 'Название', 'text', event.title, 'required maxlength="150"')}${field('starts_at','Начало по Москве','datetime-local',local,'required')}
      ${field('description','Описание','text',event.description)}${field('location','Место','text',event.location)}
      ${quota('resident_seats','Мест резидентов')}${quota('guest_seats','Мест гостей')}${quota('invite_seats','Мест по приглашению')}
      ${field('resident_price','Цена резидента в кредитах','number',event.resident_price,'min="0"')}${quota('guest_extra','Доплата гостя за программу')}
      ${field('organizer','Номер участника-организатора','number',event.organizer,'min="1"')}
      <label><input type="checkbox" name="accepts_pack" ${event.accepts_pack ? 'checked' : ''}> Принимать пакетные визиты</label>
      ${event.id ? '' : field('weekly_count','Число еженедельных встреч','number',1,'min="1" max="12"')}
      <button class="btn primary">Сохранить в афише</button></form>`);
  };
  F.schedule = async (data, form) => {
    await api.post('/staff/schedule/' + (form.dataset.id ? form.dataset.id + '/' : ''), { ...data, starts_at: data.starts_at + ':00+03:00',
      organizer: data.organizer || null, resident_price: data.resident_price || null, accepts_pack: !!data.accepts_pack });
    closeModal(); await draw();
  };
  A.cancelschedule = el => modal(`<h2 class="t-block">Отменить встречу?</h2><p>Активные брони будут освобождены. Кредиты, визиты и пригласительные вернутся участникам.</p>
    <form data-form="cancelschedule" data-id="${el.dataset.id}"><button class="btn primary">Подтвердить отмену встречи</button></form>`);
  F.cancelschedule = async (_, form) => { await api.post(`/staff/schedule/${form.dataset.id}/`, {action:'cancel'}); closeModal(); await draw(); };
  F.review = async (data, form) => { await api.post(`/staff/proposals/${form.dataset.id}/`, {...data, event:data.event || null}); await draw(); toast('Решение сохранено.'); };
  F.issuecode = async (d, form) => { await api.post(`/staff/schedule/${form.dataset.id}/codes/`, d); toast('Код доступен организатору.'); };
  return {
    async staff() {
      state = await api.get('/staff/schedule/');
      return band(pageHead('cinema','Программа клуба','') +
        (state.create ? '<button class="btn primary" data-act="editschedule">Добавить встречу</button>' : '') +
        state.events.map(e => `<article class="card"><h2>${esc(e.title)}</h2><p>${date(e.starts_at)}</p>${state.issue_codes && e.organizer ? `<details><summary>Выдать промокод</summary><form class="form" data-form="issuecode" data-id="${e.id}">${field('code','Промокод','text','','pattern="[a-zA-Z0-9_-]+" required')}${field('limit','Число входов','number',1,'min="1" required')}<button class="btn">Выдать</button></form></details>` : ''}${state.change ? `<div class="actions"><button class="btn" data-act="editschedule" data-id="${e.id}">Изменить</button><button class="btn" data-act="cancelschedule" data-id="${e.id}">Отменить</button></div>` : ''}</article>`).join('') +
        state.proposals.map(p => `<article class="card"><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><p>${esc(p.contact)}</p><form class="form" data-form="review" data-id="${p.id}">
          <label>Решение<select name="stage">${[['new','На рассмотрении'],['open','Открыть сбор интереса'],['declined','Отклонить']].map(([v,t]) => `<option value="${v}" ${p.stage===v?'selected':''}>${t}</option>`).join('')}</select></label>
          <label>Встреча<select name="event"><option value="">Без привязки</option>${state.events.map(e => `<option value="${e.id}" ${p.event_id===e.id?'selected':''}>${esc(e.title)}</option>`).join('')}</select></label>
          ${field('review','Ответ автору','text',p.review)}<button class="btn">Сохранить решение</button></form></article>`).join(''));
    },
    async organizer() {
      const events = await api.get('/me/organizing/');
      return band(pageHead('cinema','Мои встречи','Коды на вход для гостей организатора.') +
        (events.map(e => `<article class="card"><h2>${esc(e.title)}</h2><p>${date(e.starts_at)}</p>${e.codes.map(c => `<p><a href="#code/${encodeURIComponent(c.code)}">${esc(c.code)}</a> · использовано ${c.used} из ${c.limit} · ${c.enabled ? 'действует' : 'закрыт'}</p>`).join('') || '<p>Кодов пока нет.</p>'}</article>`).join('') || '<p>У вас пока нет встреч в программе.</p>'));
    }
  };
}
