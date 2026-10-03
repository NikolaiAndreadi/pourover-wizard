import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  base: "/pourover-wizard/",
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
