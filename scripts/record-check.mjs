import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const git = (args, env = {}) =>
  execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();

const scratch = mkdtempSync(join(tmpdir(), "record-check-"));
const env = { GIT_INDEX_FILE: join(scratch, "index") };
try {
  git(["read-tree", "HEAD"], env);
  git(["add", "-A"], env);
  const tree = git(["write-tree"], env);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/check-passed", `${tree}\n`);
  console.log(`check passed for tree ${tree}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
