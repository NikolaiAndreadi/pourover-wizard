import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    maxWorkers: 2,
    reporters: ["default", "junit"],
    outputFile: { junit: "reports/unit.xml" },
  },
});
