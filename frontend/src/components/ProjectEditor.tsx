import { useState } from "react";
import { api } from "../api";
import { PROJECT_STAGES, type Project, type ProjectImage } from "../types";

const DIRECTIONS = ["Искусство", "Дизайн", "Музыка", "Кино", "Фото", "Ремесло", "Технологии", "Образование", "События"];

export function newProject(): Project {
  return {
    title: "", summary: "", description: "", url: "", directions: [],
    author_role: "", stage: "", looking_for: "", links: [], images: [],
  };
}

type Props = {
  project: Project;
  busy: boolean;
  onChange: (fields: Partial<Project>) => void;
  onRemove: () => void;
  onGalleryBusy: (busy: boolean) => void;
};

export default function ProjectEditor({ project, busy, onChange, onRemove, onGalleryBusy }: Props) {
  const [error, setError] = useState("");
  const [direction, setDirection] = useState("");
  const addDirection = () => {
    const value = direction.trim();
    if (!value || project.directions.length >= 5 || project.directions.includes(value)) return;
    onChange({ directions: [...project.directions, value] });
    setDirection("");
  };

  const updateGallery = async (request: () => Promise<ProjectImage[]>) => {
    setError("");
    onGalleryBusy(true);
    try {
      onChange({ images: await request() });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      onGalleryBusy(false);
    }
  };

  const galleryPath = `/me/projects/${project.id}/images/`;
  return (
    <fieldset className="project-editor" disabled={busy}>
      <legend>{project.title || "Новый проект"}</legend>
      <label className="field"><span>Название *</span>
        <input className="input" required maxLength={150} value={project.title}
          onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="field"><span>Короткое описание{!project.id && " *"}</span>
        <textarea className="input" rows={2} maxLength={240} required={!project.id} value={project.summary}
          onChange={(e) => onChange({ summary: e.target.value })} placeholder="Расскажите о проекте в одной-двух фразах" />
      </label>
      <label className="field"><span>Подробнее о проекте</span>
        <textarea className="input" rows={4} maxLength={5000} value={project.description}
          onChange={(e) => onChange({ description: e.target.value })} />
      </label>
      <label className="field"><span>Направление</span>
        <input className="input" list="project-directions" maxLength={40} value={direction}
          placeholder="Выберите из списка или укажите своё"
          onChange={(e) => setDirection(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDirection(); } }} />
      </label>
      <button type="button" className="btn btn-ghost" disabled={!direction.trim() || project.directions.length >= 5}
        onClick={addDirection}>Добавить направление</button>
      <div className="project-tags">
        {project.directions.map((value) => <button type="button" className="chip" key={value}
          aria-label={`Убрать направление «${value}»`}
          onClick={() => onChange({ directions: project.directions.filter((item) => item !== value) })}>{value} ×</button>)}
      </div>
      <div className="row">
        <label className="field"><span>Ваша роль</span>
          <input className="input" maxLength={120} value={project.author_role}
            onChange={(e) => onChange({ author_role: e.target.value })} placeholder="Например, куратор выставки" />
        </label>
        <label className="field"><span>Стадия</span>
          <select className="input" value={project.stage}
            onChange={(e) => onChange({ stage: e.target.value as Project["stage"] })}>
            <option value="">Не указана</option>
            {Object.entries(PROJECT_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Ищу для проекта</span>
        <input className="input" maxLength={300} value={project.looking_for}
          onChange={(e) => onChange({ looking_for: e.target.value })} placeholder="Например, площадку для выставки" />
      </label>
      <h3>Галерея</h3>
      {!project.id ? <p className="muted">Сохраните проект, чтобы добавить изображения.</p> : <>
        <div className="project-gallery">
          {project.images.map((image, index) => (
            <div key={image.id}>
              <img src={image.image} alt={`Изображение ${index + 1}`} loading="lazy" />
              {index === 0 ? <span className="small">Обложка</span> :
                <button type="button" className="link" onClick={() =>
                  void updateGallery(() => api.patch<ProjectImage[]>(`${galleryPath}${image.id}/`, {}))}>На обложку</button>}
              {" "}<button type="button" className="link" aria-label={`Удалить изображение ${index + 1}`} onClick={() =>
                void updateGallery(() => api.del<ProjectImage[]>(`${galleryPath}${image.id}/`))}>Удалить</button>
            </div>
          ))}
        </div>
        <label className="field"><span>Добавить изображение ({project.images.length} из 8, до 10 МБ)</span>
          <input className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={project.images.length >= 8}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const data = new FormData();
              data.append("photo", file);
              void updateGallery(() => api.post<ProjectImage[]>(galleryPath, data));
            }} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
      </>}
      <h3>Ссылки</h3>
      {project.url && <label className="field"><span>Основная ссылка</span>
        <input className="input" type="url" maxLength={200} value={project.url} onChange={(e) => onChange({ url: e.target.value })} />
      </label>}
      {project.links.map((link, index) => {
        const editLink = (fields: Partial<typeof link>) => onChange({
          links: project.links.map((item, i) => i === index ? { ...item, ...fields } : item),
        });
        return <div className="project-link-editor" key={index}>
          <div className="row">
            <label className="field"><span>Подпись</span><input className="input" required maxLength={60} value={link.label}
              placeholder="Портфолио, видео, билеты" onChange={(e) => editLink({ label: e.target.value })} /></label>
            <label className="field"><span>Адрес</span><input className="input" type="url" required maxLength={500} value={link.url}
              placeholder="https://" onChange={(e) => editLink({ url: e.target.value })} /></label>
          </div>
          <button type="button" className="link" onClick={() =>
            onChange({ links: project.links.filter((_, i) => i !== index) })}>Убрать ссылку</button>
        </div>;
      })}
      <div className="project-editor-actions">
        <button type="button" className="btn btn-ghost" disabled={project.links.length >= 6}
          onClick={() => onChange({ links: [...project.links, { label: "", url: "" }] })}>Добавить ссылку</button>
        <button type="button" className="link" onClick={onRemove}>Удалить проект</button>
      </div>
    </fieldset>
  );
}

export function ProjectDirections() {
  return <datalist id="project-directions">{DIRECTIONS.map((value) => <option key={value} value={value} />)}</datalist>;
}
