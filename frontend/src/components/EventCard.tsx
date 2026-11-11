export type ClubEvent = { id: number; title: string; description: string; starts_at: string; location: string };

const datePart = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleString("ru-RU", { ...options, timeZone: "Europe/Moscow" });

export default function EventCard({ event, index = 0 }: { event: ClubEvent; index?: number }) {
  return <article className={`event-poster event-tone-${index % 3}`}>
    <div className="event-poster-top">
      <time dateTime={event.starts_at}><strong>{datePart(event.starts_at, { day: "2-digit" })}</strong><span>{datePart(event.starts_at, { month: "long" })}</span></time>
      <span className="event-time">{datePart(event.starts_at, { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <h3>{event.title}</h3>
    <p className="pre">{event.description}</p>
    <div className="event-poster-bottom"><span>{event.location || "Коко клуб"}</span></div>
  </article>;
}
