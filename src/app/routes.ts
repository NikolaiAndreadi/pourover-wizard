export type Route = "home" | "about";
export const routeHrefs = {
  home: "#/",
  about: "#/about",
} as const satisfies Record<Route, `#/${string}`>;

export function routeFromHash(hash: string): Route {
  return hash === routeHrefs.about ? "about" : "home";
}
