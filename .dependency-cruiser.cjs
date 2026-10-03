const layer = (name) => `^src/${name}/`;
module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "core-is-independent",
      severity: "error",
      from: { path: layer("core"), pathNot: "\\.test\\.tsx?$" },
      to: { pathNot: layer("core") },
    },
    {
      name: "core-tests-use-only-core-and-vitest",
      severity: "error",
      from: { path: "^src/core/.*\\.test\\.tsx?$" },
      to: { pathNot: "(^src/core/|(^|/)node_modules/vitest/)" },
    },
    ...["scale", "platform"].map((name) => ({
      name: `${name}-depends-only-on-core-or-itself`,
      severity: "error",
      from: { path: layer(name) },
      to: { path: "^src/", pathNot: `^src/(${name}|core)/` },
    })),
    {
      name: "ui-uses-app-or-core-types",
      severity: "error",
      from: { path: layer("ui") },
      to: { path: "^src/", pathNot: "^src/(ui|app|core)/" },
    },
    {
      name: "ui-core-imports-are-types",
      severity: "error",
      from: { path: layer("ui") },
      to: { path: layer("core"), dependencyTypesNot: ["type-only"] },
    },
    {
      name: "app-does-not-depend-on-entry",
      severity: "error",
      from: { path: layer("app") },
      to: { path: "^src/main\\." },
    },
    {
      name: "native-bluetooth-only-in-transport",
      severity: "error",
      from: { pathNot: layer("scale/transport") },
      to: { path: "(capacitor-community/bluetooth-le|cordova-plugin-ble)" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".json"],
      conditionNames: ["import", "default"],
    },
  },
};
