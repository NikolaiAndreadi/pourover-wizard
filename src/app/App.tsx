import { useEffect, useState } from "react";
import { Shell } from "@/ui/Shell";
import { routeFromHash } from "./routes";
import { useBrew } from "./useBrew";
export function App() {
  const brew = useBrew();
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => {
      brew.releaseHold();
      setRoute(routeFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return <Shell route={route} brew={brew} />;
}
