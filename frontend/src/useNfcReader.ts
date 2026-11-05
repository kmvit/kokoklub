import { useCallback, useEffect, useRef, useState } from "react";

type Reader = {
  scan: (options: { signal: AbortSignal }) => Promise<void>;
  onreading: ((event: { serialNumber: string }) => void) | null;
  onreadingerror: (() => void) | null;
};

export function useNfcReader() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async (onScan: (uid: string) => void) => {
    setError("");
    if (!window.isSecureContext || !("NDEFReader" in window)) {
      setError("Считывание NFC доступно в Chrome на Android через HTTPS. Можно использовать внешний ридер или ввести UID вручную.");
      return;
    }
    stop();
    const NDEFReader = (window as Window & { NDEFReader: new () => Reader }).NDEFReader;
    const next = new AbortController();
    controller.current = next;
    setScanning(true);
    const reader = new NDEFReader();
    reader.onreadingerror = () => setError("Не удалось прочитать метку. Попробуйте приложить её ещё раз.");
    reader.onreading = ({ serialNumber }) => {
      if (!serialNumber) {
        setError("Телефон не передал номер метки. Попробуйте другую метку или внешний ридер.");
        return;
      }
      stop();
      onScan(serialNumber);
    };
    try {
      await reader.scan({ signal: next.signal });
    } catch (e) {
      if (next.signal.aborted) return;
      stop();
      setError((e as DOMException).name === "NotAllowedError"
        ? "Разрешите сайту доступ к NFC в настройках браузера."
        : "Не удалось включить NFC. Проверьте, что он включён на телефоне.");
    }
  }, [stop]);

  return { scanning, error, start, stop };
}
