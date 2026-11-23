import { useState } from "react";

const slides = [
  ["chandelier.jpg", "Вечер в клубе"],
  ["cv_vinyl.webp", "Винил целиком"],
  ["cv_cocktails.webp", "Авторские коктейли"],
  ["cv_fireplace.webp", "Камин"],
  ["cv_live.webp", "Живые выступления"],
  ["cv_lecture.webp", "Лекции и разговоры"],
  ["cv_work.webp", "Работа днём"],
  ["cv_cinema.webp", "Кино"],
] as const;

export default function ClubCover({ firstName, target }: { firstName?: string; target: string }) {
  const [slide, setSlide] = useState(0);
  const [file, caption] = slides[slide];
  const today = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Moscow",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => today.find((item) => item.type === type)?.value;

  return <section className="edition-cover" aria-labelledby="cover-title">
    <div className="edition-mast">
      <div className="edition-date"><strong>{part("day")}</strong><span>{part("month")}<br />{part("weekday")}</span></div>
      <img src="/brand/koko_E_mark_on-green.svg" width="56" height="56" alt="" />
      <span>Пятигорск</span>
    </div>
    <div className="edition-rule">Клуб Коко</div>
    <div className="edition-grid">
      <figure className="edition-gallery">
        <div className="edition-art"><img src={`/brand/art/${file}`} className={slide === 0 ? "chandelier" : undefined} alt="" fetchPriority="high" /></div>
        <div className="edition-dots" role="group" aria-label="Что есть в клубе">
          {slides.map(([, label], i) => <button key={label} type="button" aria-label={label} aria-pressed={i === slide} onClick={() => setSlide(i)} />)}
        </div>
        <figcaption aria-live="polite">{caption}</figcaption>
      </figure>
      <div className="edition-copy">
        {firstName && <p className="eyebrow">Рады видеть вас, {firstName}</p>}
        <h1 id="cover-title">{firstName ? "Свои люди. Общие планы." : "Клуб, где искусство звучит"}</h1>
        <p>Музыка, кино, книги и люди — в Пятигорске.</p>
        <a href={target} className="btn">Выбрать вечер <span aria-hidden="true">↓</span></a>
      </div>
    </div>
  </section>;
}
