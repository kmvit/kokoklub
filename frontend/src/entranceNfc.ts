// Сканирование запускается прямо в обработчике клика по ссылке на экран входа.
// Web NFC требует пользовательского действия; запуск после перехода не гарантирован.
type Reader = {
  scan: (options: { signal: AbortSignal }) => Promise<void>;
  onreading: ((event: { serialNumber: string }) => void) | null;
  onreadingerror: (() => void) | null;
};

type Snapshot = { status: "idle" | "scanning" | "read" | "error"; uid?: string; error?: string };
let snapshot: Snapshot = { status: "idle" };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function update(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getEntranceNfc() { return snapshot; }
export function subscribeEntranceNfc(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function stopEntranceNfc() {
  controller?.abort();
  controller = null;
  update({ status: "idle" });
}

export function beginEntranceNfc() {
  if (controller) return;
  if (!window.isSecureContext || !("NDEFReader" in window)) {
    update({ status: "error", error: "NFC доступен в Chrome на Android через HTTPS. Используйте внешний ридер или поиск гостя." });
    return;
  }
  const NDEFReader = (window as Window & { NDEFReader: new () => Reader }).NDEFReader;
  const next = new AbortController();
  controller = next;
  const reader = new NDEFReader();
  reader.onreadingerror = () => {
    next.abort();
    controller = null;
    update({ status: "error", error: "Не удалось прочитать метку. Нажмите кнопку и попробуйте ещё раз." });
  };
  reader.onreading = ({ serialNumber }) => {
    if (!serialNumber) {
      next.abort();
      controller = null;
      update({ status: "error", error: "Телефон не передал UID метки. Попробуйте другой телефон или внешний ридер." });
      return;
    }
    next.abort();
    controller = null;
    update({ status: "read", uid: serialNumber });
  };
  update({ status: "scanning" });
  void reader.scan({ signal: next.signal }).catch((error: DOMException) => {
    if (next.signal.aborted) return;
    controller = null;
    update({ status: "error", error: error.name === "NotAllowedError"
      ? "Разрешите сайту доступ к NFC и коснитесь экрана ещё раз."
      : "Не удалось включить NFC. Проверьте NFC на телефоне и коснитесь экрана ещё раз." });
  });
}
