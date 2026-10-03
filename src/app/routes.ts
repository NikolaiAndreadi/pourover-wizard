export type Route = "home" | "about";
export function routeFromHash(hash: string): Route {
  return hash === "#/about" ? "about" : "home";
}
