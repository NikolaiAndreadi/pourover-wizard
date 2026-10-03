import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
      maxWorkers: 2,
      reporters: ["default", "junit"],
      outputFile: { junit: "reports/unit.xml" },
      coverage: {
        provider: "v8",
        include: ["src/core/**/*.ts", "src/scale/bookoo/codec.ts"],
        exclude: ["**/*.test.ts"],
        reporter: ["text", "html", "json", "json-summary"],
        reportsDirectory: "reports/coverage",
      },
    },
  }),
);
