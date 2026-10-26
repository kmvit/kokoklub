export type Status = "open" | "busy" | "dnd";

export const STATUS_LABEL: Record<Status, string> = {
  open: "Готов общаться",
  busy: "Занят",
  dnd: "Не беспокоить",
};

export interface Activity {
  id: number;
  name: string;
}

export interface MemberShort {
  id: number;
  full_name: string;
  photo: string | null;
  activity: string | null;
  occupation: string;
  hobbies: string[];
  status: Status;
  status_text: string;
  in_club: boolean;
}

export interface MemberDetail extends MemberShort {
  about: string;
  can_help: string;
  looking_for: string;
  contacts: { phone: string | null; telegram: string | null } | null;
  member_since: string | null;
}

export interface Me {
  id: number;
  phone: string;
  full_name: string;
  photo: string | null;
  activity: number | null;
  occupation: string;
  hobbies: string[];
  about: string;
  can_help: string;
  looking_for: string;
  telegram: string;
  show_phone: boolean;
  status: Status;
  status_text: string;
  has_consent: boolean;
  is_member: boolean;
  in_club: boolean;
  profile_complete: boolean;
  is_staff: boolean;
  is_hidden: boolean;
  unread: number;
}

export interface ChatMessage {
  id: number;
  text: string;
  created_at: string;
  mine: boolean;
  read: boolean;
}

export interface ChatSummary {
  id: number;
  other: MemberShort;
  last: ChatMessage | null;
  unread: number;
}

export interface StaffMember {
  id: number;
  phone: string;
  full_name: string;
  photo: string | null;
  activity: string | null;
  occupation: string;
  profile_complete: boolean;
  is_hidden: boolean;
  card: { uid: string; issued_at: string } | null;
  in_club: boolean;
  date_joined: string;
}

export interface InsideVisit {
  id: number;
  entered_at: string;
  member: MemberShort & { phone: string };
}

export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length !== 11) return phone;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
