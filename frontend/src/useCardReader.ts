import { useEffect, useRef } from "react";

// USB-ридер NFC в режиме клавиатуры «печатает» номер карты и жмёт Enter.
// Отличаем его от человека по скорости: ридер выдаёт символы чаще,
// чем раз в 80 мс. Поле ввода в фокусе держать не нужно.
const MAX_GAP_MS = 80;
const MIN_LENGTH = 8;

export function useCardReader(onScan: (uid: string) => void, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      if (now - last > MAX_GAP_MS) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.replace(/:/g, "").length >= MIN_LENGTH) {
          e.preventDefault();
          handler.current(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length === 1 && /[0-9a-fA-F:]/.test(e.key)) buffer += e.key;
      else if (e.key.length === 1) buffer = "";
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
}
