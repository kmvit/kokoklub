import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { STATUS_LABEL, type Status } from "../types";

// ─────────── Тост ───────────
type ToastKind = "plain" | "ok" | "bad";
type Notify = (message: string, kind?: ToastKind) => void;
const ToastContext = createContext<Notify>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback<Notify>((text, kind = "plain") => {
    window.clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ─────────── Окно ───────────
// Подтверждения — только своим окном: нативные confirm() глушатся в киоск-браузерах.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────── Аватар ───────────
export function Avatar({ name, photo, size = 56 }: { name: string; photo: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return photo ? (
    <img className="avatar" src={photo} alt={name} style={{ width: size, height: size }} />
  ) : (
    <div className="avatar avatar-empty" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials || "?"}
    </div>
  );
}

// ─────────── Статус, как в ICQ ───────────
export function StatusDot({ status }: { status: Status }) {
  return <span className={`dot dot-${status}`} aria-hidden />;
}

export function StatusLine({ status, text, inClub }: { status: Status; text?: string; inClub?: boolean }) {
  return (
    <div className="status-line">
      <StatusDot status={status} />
      <span>{text || STATUS_LABEL[status]}</span>
      {inClub && <span className="badge-club">в клубе</span>}
    </div>
  );
}
