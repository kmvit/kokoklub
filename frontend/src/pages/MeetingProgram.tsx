import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type Idea = { id: number; title: string; description: string; interest: number; selected: boolean };
type Program = { ideas: Idea[]; mine: { title: string; stage: string; review: string; event_id: number | null }[] };
const stages: Record<string, string> = { new: "На рассмотрении", open: "Сбор интереса", declined: "Отклонена" };

export default function MeetingProgram() {
  const { me } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<Program>("/proposals/").then(setProgram).catch(e => setNotice(e.message)); }, [me?.id]);

  async function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await api.post("/proposals/", Object.fromEntries(new FormData(form)));
      form.reset(); setNotice("Заявка передана команде клуба.");
      setProgram(await api.get<Program>("/proposals/"));
    } catch (err) { setNotice((err as Error).message); } finally { setBusy(false); }
  }
  async function vote(idea: Idea) {
    setBusy(true);
    try {
      const result = await api.post<Pick<Idea, "interest" | "selected">>(`/proposals/${idea.id}/interest/`, { interested: !idea.selected });
      setProgram(current => current && { ...current, ideas: current.ideas.map(item => item.id === idea.id ? { ...item, ...result } : item) });
    } catch (err) { setNotice((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="card"><h2>Предложения встреч</h2>
    {program?.ideas.map(idea => <article key={idea.id}><h3>{idea.title}</h3><p>{idea.description}</p><p>Пойдут: {idea.interest}</p>
      {me?.is_member && <button className="btn btn-ghost" disabled={busy} onClick={() => vote(idea)}>{idea.selected ? "Отозвать голос" : "Пойду"}</button>}</article>)}
    {program?.mine.map((item, i) => <p key={i}>{item.title} · {item.event_id ? "В расписании" : stages[item.stage]} {item.review}</p>)}
    <details><summary>Предложить свою встречу</summary><form className="form" onSubmit={propose}>
      <label>Тема<input className="input" name="title" required maxLength={150} /></label>
      <label>Как пройдёт встреча<textarea className="input" name="description" required maxLength={2400} /></label>
      <label>Как с вами связаться<input className="input" name="contact" required maxLength={200} /></label>
      <button className="btn" disabled={busy}>Отправить заявку</button>
    </form></details>{notice && <p role="status">{notice}</p>}
  </section>;
}
