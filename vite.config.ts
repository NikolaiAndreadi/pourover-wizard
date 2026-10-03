import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { offlinePwa } from "./scripts/pwa.ts";
export default defineConfig({
  base: "/pourover-wizard/",
  plugins: [react(), offlinePwa()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
