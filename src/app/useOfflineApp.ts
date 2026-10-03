import { useEffect, useState } from "react";

export function useOfflineApp() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      import.meta.env.BASE_URL !== "/pourover-wizard/" ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const refresh = () => {
      if (disposed || !registration) return;
      setOfflineReady(Boolean(registration.active));
      setUpdateReady(Boolean(registration.waiting && registration.active));
    };
    const installing = () => {
      registration?.installing?.addEventListener("statechange", refresh);
      refresh();
    };
    const check = () => {
      if (navigator.onLine) void registration?.update().catch(() => {});
    };
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((result) => {
        if (disposed) return;
        registration = result;
        result.addEventListener("updatefound", installing);
        installing();
        check();
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", refresh);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", installing);
      navigator.serviceWorker.removeEventListener("controllerchange", refresh);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return { offlineReady, updateReady };
}
