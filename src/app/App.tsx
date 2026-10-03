import { useEffect, useState } from "react";
import { Shell } from "@/ui/Shell";
import { routeFromHash } from "./routes";
export function App() {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return <Shell route={route} />;
}
