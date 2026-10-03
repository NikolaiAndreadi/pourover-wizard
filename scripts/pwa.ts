import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

// Native assets already ship inside the IPA; only the web build needs a worker.
export function offlinePwa(): Plugin {
  let base = "";
  let root = "";
  return {
    name: "offline-pwa",
    apply: "build",
    configResolved(config) {
      base = config.base;
      root = config.root;
    },
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        if (base !== "/pourover-wizard/") return;
        const manifest = {
          name: "Pourover Wizzard",
          short_name: "Pourover",
          id: base,
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#f6f3ed",
          theme_color: "#f6f3ed",
          icons: [192, 512].map((size) => ({
            src: `icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            purpose: "any",
          })),
        };
        this.emitFile({
          type: "asset",
          fileName: "manifest.webmanifest",
          source: JSON.stringify(manifest),
        });
        for (const size of [192, 512]) {
          this.emitFile({
            type: "asset",
            fileName: `icon-${size}.png`,
            source: readFileSync(
              new URL(`../pwa/icon-${size}.png`, import.meta.url),
            ),
          });
        }
        const html = bundle["index.html"];
        if (html?.type !== "asset") throw new Error("Missing PWA entry page");
        html.source = String(html.source).replace(
          "</head>",
          '<link rel="manifest" href="./manifest.webmanifest" /><link rel="apple-touch-icon" href="./icon-192.png" /></head>',
        );
        const hash = createHash("sha256");
        hash.update(JSON.stringify(manifest));
        for (const size of [192, 512])
          hash.update(readFileSync(resolve(root, `pwa/icon-${size}.png`)));
        for (const [name, entry] of Object.entries(bundle).sort()) {
          hash.update(name);
          hash.update(entry.type === "chunk" ? entry.code : entry.source);
        }
        hash.update(readFileSync(resolve(root, "scripts/pwa.ts")));
        const assets = [
          ...Object.keys(bundle),
          "manifest.webmanifest",
          "icon-192.png",
          "icon-512.png",
        ].map((name) => `${base}${name}`);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE = "pourover-wizard-${hash.digest("hex").slice(0, 20)}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // A partial download never replaces the working offline version.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
  })());
});
// Deliberately no skipWaiting: every tab keeps its version until all close.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("pourover-wizard-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const asset = event.request.mode === "navigate" && url.pathname.startsWith(${JSON.stringify(base)})
    ? ${JSON.stringify(`${base}index.html`)} : url.pathname;
  if (!ASSETS.includes(asset)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(asset)) || fetch(event.request);
  })());
});
`,
        });
      },
    },
  };
}
