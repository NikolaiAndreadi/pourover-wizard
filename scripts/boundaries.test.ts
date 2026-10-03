import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("rejects forbidden dependency edges, cycles, DOM core code, and Bluetooth access", () => {
  const root = process.cwd();
  const fixture = mkdtempSync(path.join(tmpdir(), "brew-boundaries-"));
  const write = (name: string, source: string) => {
    const target = path.join(fixture, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  };
  const run = (args: string[]) =>
    spawnSync(process.execPath, args, { cwd: fixture, encoding: "utf8" });
  try {
    symlinkSync(
      path.join(root, "node_modules"),
      path.join(fixture, "node_modules"),
      "dir",
    );
    for (const file of [
      ".dependency-cruiser.cjs",
      "tsconfig.json",
      "tsconfig.core.json",
    ])
      write(file, readFileSync(path.join(root, file), "utf8"));
    write("src/app/index.ts", "export const app = 1;");
    const depcruise = path.join(
      root,
      "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
    );
    const architecture = () =>
      run([depcruise, "src", "--config", ".dependency-cruiser.cjs"]);
    write("src/core/value.ts", "export const value = 1;");
    write(
      "src/core/value.test.ts",
      "import { expect } from 'vitest'; import { value } from './value'; expect(value).toBe(1);",
    );
    const allowed = architecture();
    expect(allowed.status, allowed.stdout + allowed.stderr).toBe(0);
    for (const source of [
      "import { app } from '@/app'; export const invalid = app;",
      "export { app } from '../app';",
      "export const invalid = import('../app');",
    ]) {
      write("src/core/invalid.ts", source);
      const result = architecture();
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("core-is-independent");
    }
    rmSync(path.join(fixture, "src/core"), { recursive: true });
    write("src/app/a.ts", "import './b';");
    write("src/app/b.ts", "import './a';");
    const cycle = architecture();
    expect(cycle.status, cycle.stdout + cycle.stderr).not.toBe(0);
    expect(cycle.stdout + cycle.stderr).toContain("no-cycles");
    rmSync(path.join(fixture, "src/app/a.ts"));
    rmSync(path.join(fixture, "src/app/b.ts"));
    write("src/core/invalid.ts", "export const invalid = document.title;");
    const core = run([path.join(root, "scripts/check-core.mjs")]);
    expect(core.status, core.stdout + core.stderr).not.toBe(0);
    expect(core.stdout + core.stderr).toContain("Cannot find name 'document'");
    const nativeCore = run([
      path.join(root, "node_modules/@typescript/native/bin/tsc"),
      "-p",
      "tsconfig.core.json",
    ]);
    expect(nativeCore.status, nativeCore.stdout + nativeCore.stderr).not.toBe(
      0,
    );
    expect(nativeCore.stdout + nativeCore.stderr).toContain(
      "Cannot find name 'document'",
    );
    rmSync(path.join(fixture, "src/core"), { recursive: true });
    write("tsconfig.core.json", "{ broken");
    expect(run([path.join(root, "scripts/check-core.mjs")]).status).not.toBe(0);
    for (const source of [
      "navigator.bluetooth;",
      "navigator['bluetooth'];",
      "const { bluetooth: adapter } = navigator;",
      "let device: BluetoothDevice;",
    ]) {
      write("src/app/invalid.ts", source);
      const result = run([path.join(root, "scripts/check-bluetooth.mjs")]);
      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stderr).toContain("Bluetooth API access belongs");
    }
    write("src/app/invalid.ts", "const prose = 'bluetooth';");
    write("src/scale/transport/browser.ts", "navigator.bluetooth;");
    expect(run([path.join(root, "scripts/check-bluetooth.mjs")]).status).toBe(
      0,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}, 20000);
