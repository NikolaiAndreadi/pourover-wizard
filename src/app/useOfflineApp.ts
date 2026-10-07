import { useEffect, useRef, useState } from "react";

export function useOfflineApp(idle: boolean) {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [stale, setStale] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      import.meta.env.BASE_URL !== "/pourover-wizard/" ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    let hadWorker = Boolean(navigator.serviceWorker.controller);
    const refresh = () => {
      const current = registration.current;
      if (disposed || !current) return;
      setOfflineReady(Boolean(current.active));
      setUpdateReady(Boolean(current.waiting && current.active));
    };
    const installing = () => {
      registration.current?.installing?.addEventListener(
        "statechange",
        refresh,
      );
      refresh();
    };
    const check = () => {
      if (navigator.onLine) void registration.current?.update().catch(() => {});
    };
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    const controllerChanged = () => {
      if (hadWorker && !disposed) setStale(true);
      hadWorker = true;
      refresh();
    };
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((result) => {
        if (disposed) return;
        registration.current = result;
        hadWorker ||= Boolean(result.active);
        result.addEventListener("updatefound", installing);
        installing();
        check();
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      registration.current?.removeEventListener("updatefound", installing);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (!idle) return;
    if (stale) window.location.reload();
    else if (updateReady)
      registration.current?.waiting?.postMessage("apply-update");
  }, [idle, stale, updateReady]);
  return { offlineReady, updateReady: updateReady || stale };
}
