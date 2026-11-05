export default function StaffPhoto({ name, photo }: { name: string; photo: string | null }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  return (
    <div className="staff-photo">
      {photo ? <img src={photo} alt={name} decoding="async" /> : <span aria-label={`Фото ${name} не загружено`}>{initials || "?"}</span>}
    </div>
  );
}
