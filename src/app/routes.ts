export type Route = "home" | "about" | "scale-lab";
export const routeHrefs = {
  home: "#/",
  about: "#/about",
  "scale-lab": "#/scale-lab",
} as const satisfies Record<Route, `#/${string}`>;

export function routeFromHash(hash: string): Route {
  return hash === routeHrefs["scale-lab"]
    ? "scale-lab"
    : hash === routeHrefs.about
      ? "about"
      : "home";
}
