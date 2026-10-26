import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { MemberShort } from "../types";

// Тонкие линейные иконки в одном стиле: штрих currentColor, без заливок.
const ICONS: Record<string, ReactNode> = {
  chess: (
    <>
      <circle cx="24" cy="12" r="4.5" />
      <path d="M19 19h10M20.5 19c0 7-3 12-5.5 16h18c-2.5-4-5.5-9-5.5-16" />
      <path d="M13 35h22v4H13z" />
    </>
  ),
  film: (
    <>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="24" r="2" />
      <circle cx="24" cy="15" r="3.5" />
      <circle cx="24" cy="33" r="3.5" />
      <circle cx="15" cy="24" r="3.5" />
      <circle cx="33" cy="24" r="3.5" />
      <path d="M39 24h5" />
    </>
  ),
  vinyl: (
    <>
      <circle cx="24" cy="24" r="16" />
      <circle cx="24" cy="24" r="11" />
      <circle cx="24" cy="24" r="5" />
      <circle cx="24" cy="24" r="1" />
      <path d="M36 6l4 4-9 11" />
    </>
  ),
  work: (
    <>
      <path d="M11 14h26v17H11z" />
      <path d="M6 35h36l-3 3H9z" />
      <path d="M17 21h8M17 25h14" />
    </>
  ),
  stage: (
    <>
      <rect x="18" y="6" width="12" height="18" rx="6" />
      <path d="M13 20c0 6.5 5 11 11 11s11-4.5 11-11M24 31v8M17 40h14" />
    </>
  ),
  coffee: (
    <>
      <path d="M10 20h24v8c0 6-5 11-12 11s-12-5-12-11z" />
      <path d="M34 23h3a4 4 0 0 1 0 8h-4" />
      <path d="M17 7c-2 3 2 5 0 8M24 7c-2 3 2 5 0 8" />
    </>
  ),
  whisky: (
    <>
      <path d="M12 12h24l-3 27H15z" />
      <path d="M13.5 24h21" />
      <path d="M19 27l6-2 2 6-6 2z" />
    </>
  ),
  style: (
    <>
      <path d="M24 24L8 15v18zM24 24l16-9v18z" />
      <rect x="21" y="20.5" width="6" height="7" rx="1.5" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="l-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// Герб клуба: щит с монограммой, лавры и лента — как на клубном блейзере.
function Crest() {
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg className="crest" viewBox="0 0 160 170" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M80 8l4 7h-8zM66 14l3 5h-6zM94 14l3 5h-6z" fill="currentColor" stroke="none" />
      <path d="M48 26h64v46c0 30-32 48-32 48S48 102 48 72z" />
      <path d="M54 32h52v40c0 25-26 41-26 41S54 97 54 72z" strokeWidth="0.7" />
      <text x="80" y="86" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Playfair Display, serif" fontStyle="italic" fontSize="44">
        К
      </text>
      {leaves.map((i) => {
        const a = (200 - i * 17) * (Math.PI / 180);
        const x = 80 + Math.cos(a) * 54;
        const y = 70 - Math.sin(a) * 54;
        const r = 270 - (200 - i * 17) + 40;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx="3.4" ry="8" transform={`rotate(${-r} ${x} ${y})`} />
            <ellipse cx={160 - x} cy={y} rx="3.4" ry="8" transform={`rotate(${r} ${160 - x} ${y})`} />
          </g>
        );
      })}
      <path d="M22 136c20 8 96 8 116 0l-6 14c-24 8-80 8-104 0z" fill="var(--bg)" />
      <path d="M22 136l-10 6 8 4M138 136l10 6-8 4" />
      <text x="80" y="148" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Manrope, sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="3.5">
        КОКО · КЛУБ
      </text>
    </svg>
  );
}

const ROOMS = [
  { icon: "chess", title: "Шахматы", text: "Доски на каждом столе, вечерние партии и турниры для своих. Блиц под виски — наша классика." },
  { icon: "film", title: "Кино", text: "Закрытые показы: нуар, авторское, большое кино на большом экране. После — разговор." },
  { icon: "vinyl", title: "Музыка", text: "Винил, джаз, соул и всё, что звучит тепло. Приносите свои пластинки." },
  { icon: "work", title: "Коворкинг", text: "Днём клуб — кабинет: тишина, хороший свет, быстрый интернет и соседи по делу." },
  { icon: "stage", title: "Сцена", text: "Концерты, лекции, стендап и камерные выступления — для своих и от своих." },
  { icon: "coffee", title: "Кофе", text: "Зерно спешелти, бариста, который помнит, как вы пьёте." },
  { icon: "whisky", title: "Виски", text: "Коллекция односолодовых и купажей. Подскажем, с чего начать и чем продолжить." },
  { icon: "style", title: "Стиль", text: "Кожа Честерфилдов, тёмное дерево, латунь и шотландка. Детали — не мелочи." },
];

const DAY = [
  { time: "Днём", title: "Кофе и работа", text: "Ноутбук, капучино, тишина. Встречи — здесь же, за соседним столом." },
  { time: "Вечером", title: "Партия и фильм", text: "Шахматы у окна, показ в зале, пластинка на проигрывателе." },
  { time: "Ночью", title: "Сцена и виски", text: "Живой звук, бокал в руке, разговоры, ради которых сюда и приходят." },
];

const STEPS = [
  { title: "Войдите по номеру", text: "Код придёт в SMS. Заполните анкету: кто вы, чем занимаетесь, о чём с вами поговорить." },
  { title: "Получите карту", text: "Клубная карта — на баре, 1 500 ₽. Бариста привяжет её к вашему профилю." },
  { title: "Приложите у входа", text: "Карта открывает клуб. Вы — в каталоге участников, и вам можно написать." },
];

// Появление блоков при прокрутке; без анимаций, если человек их отключил.
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const items = root.current?.querySelectorAll(".reveal");
    if (!items) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("shown");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return root;
}

export default function Landing() {
  const { me } = useAuth();
  const [inside, setInside] = useState<number | null>(null);
  const root = useReveal();

  useEffect(() => {
    api
      .get<MemberShort[]>("/members/?in_club=1")
      .then((list) => setInside(list.length))
      .catch(() => {});
  }, []);

  const join = me ? (
    <Link to="/people" className="btn">
      К участникам
    </Link>
  ) : (
    <Link to="/login" className="btn">
      Стать членом клуба
    </Link>
  );

  return (
    <div className="landing" ref={root}>
      {/* ─── Первый экран ─── */}
      <section className="l-hero">
        <div className="l-hero-board tartan" aria-hidden />
        <div className="l-hero-inner">
          <div className="l-hero-text">
            <div className="l-eyebrow">Частный клуб</div>
            <h1 className="l-title">
              Коко<em>клуб</em>
            </h1>
            <p className="l-lead">
              Шахматы, кино, винил и виски. Коворкинг днём, сцена вечером. Место, где всё — на&nbsp;стиле.
            </p>
            <div className="l-actions">
              {join}
              <a href="#inside" className="btn btn-ghost">
                Что внутри
              </a>
            </div>
            {inside !== null && inside > 0 && (
              <div className="l-live">
                <span className="l-live-dot" />
                Сейчас в клубе — {inside}
              </div>
            )}
          </div>

          <div className="l-record" aria-hidden>
            <div className="l-record-disc">
              <div className="l-record-label">
                <span>коко</span>
                <small>side a · 33⅓</small>
              </div>
            </div>
            <div className="l-record-arm" />
          </div>
        </div>
        <div className="l-scroll" aria-hidden>
          листайте
        </div>
      </section>

      {/* ─── Бегущая строка ─── */}
      <div className="l-marquee" aria-hidden>
        <div className="l-marquee-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {["Шахматы", "Кино", "Винил", "Коворкинг", "Сцена", "Кофе", "Виски", "Стиль"].map((w) => (
                <span key={w}>
                  {w}
                  <i>✦</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="rep-stripe" aria-hidden />

      {/* ─── Манифест ─── */}
      <section className="l-section l-manifest reveal">
        <div className="l-num">I</div>
        <p>
          Мы собрали в одном зале то, ради чего стоит выходить из дома: хорошую партию, хороший фильм, хорошую музыку
          и хороших людей. <em>Без суеты, без случайных.</em>
        </p>
      </section>

      {/* ─── Что внутри ─── */}
      <section className="l-section" id="inside">
        <div className="l-head reveal">
          <div className="l-num">II</div>
          <h2>Что внутри</h2>
        </div>
        <div className="l-rooms">
          {ROOMS.map((r, i) => (
            <article key={r.title} className="l-room reveal" style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
              <Icon name={r.icon} />
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ─── День в клубе ─── */}
      <section className="l-section">
        <div className="l-head reveal">
          <div className="l-num">III</div>
          <h2>День в клубе</h2>
        </div>
        <div className="l-day">
          {DAY.map((d) => (
            <div key={d.time} className="l-day-item reveal">
              <div className="l-day-time">{d.time}</div>
              <h3>{d.title}</h3>
              <p>{d.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Дресс-код ─── */}
      <section className="l-dress reveal">
        <div className="l-dress-inner">
          <div className="l-dress-pattern tartan" aria-hidden />
          <div className="l-dress-text">
            <div className="l-num">Дресс-код</div>
            <h2>
              Smart <em>casual</em>
            </h2>
            <p>
              Интерьер в духе старого английского клуба: зелёные стены, бордовая кожа, полированное дерево и мягкий
              латунный свет. Хочется соответствовать.
            </p>
            <ul className="l-dress-list">
              <li>Твид, кашемир, оксфорды</li>
              <li>Пиджак — всегда к месту</li>
              <li>Спортивное — для спортзала</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Цитата ─── */}
      <section className="l-quote reveal">
        <blockquote>
          «Стиль — это способ сказать, кто ты, <em>не произнося ни слова</em>»
        </blockquote>
        <cite>— Рэйчел Зои</cite>
      </section>

      {/* ─── Как вступить ─── */}
      <section className="l-section">
        <div className="l-head reveal">
          <div className="l-num">IV</div>
          <h2>Как стать своим</h2>
        </div>
        <ol className="l-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="reveal">
              <span className="l-step-n">0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── Финал ─── */}
      <section className="l-final reveal">
        <Crest />
        <h2>
          Ваш стол <em>уже ждёт</em>
        </h2>
        <p>Участники клуба видят друг друга, пишут друг другу и знают, кто сейчас внутри.</p>
        <div className="l-actions l-actions-center">
          {join}
          <Link to="/people" className="btn btn-ghost">
            Кто в клубе
          </Link>
        </div>
      </section>

      <footer className="l-footer">
        <div className="logo">
          коко<span>клуб</span>
        </div>
        <div className="muted small">Частный клуб. Только для своих.</div>
        <Link to="/staff/login" className="muted small">
          Вход для персонала
        </Link>
      </footer>
    </div>
  );
}
