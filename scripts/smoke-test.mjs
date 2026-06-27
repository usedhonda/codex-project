#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(root, "bin", "init-cdxapp.mjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-cdxapp-smoke-"));

try {
  testFreshInitAndVault();
  testTrackedLocalStops();
  testMissingKeyAndReset();
  console.log("smoke tests passed");
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

function testFreshInitAndVault() {
  const home = path.join(tmpRoot, "home-fresh");
  const project = path.join(tmpRoot, "project-fresh");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "README.md"), "# Demo\n");

  run(project, home, ["Demo app. api_key=abc123"], {
    CODEX_THREAD_ID: "thread-smoke-001",
  });

  assert.ok(fs.existsSync(path.join(project, ".local", "project.md")));
  assert.ok(fs.existsSync(path.join(project, ".local", "chats", "thread-smoke-001", "initial-request.md")));
  assert.ok(fs.existsSync(path.join(project, ".local", "vault", "secrets.json.enc")));
  assert.match(fs.readFileSync(path.join(project, ".gitignore"), "utf8"), /^\.local\/$/m);

  run(project, home, ["secret", "set", "demo_token"], {}, "dummy-secret-value");
  const list = run(project, home, ["secret", "list"]);
  assert.match(list, /^demo_token$/m);
  assert.match(list, /^initial_api_key$/m);
  const value = run(project, home, ["secret", "get", "demo_token"]);
  assert.equal(value, "dummy-secret-value");
  run(project, home, ["secret", "delete", "demo_token"]);
  const listAfterDelete = run(project, home, ["secret", "list"]);
  assert.doesNotMatch(listAfterDelete, /^demo_token$/m);

  const searchable = collectText(project, [".local", "AGENTS.md", ".gitignore"]);
  assert.equal(searchable.includes("abc123"), false);
  assert.equal(searchable.includes("dummy-secret-value"), false);

  const keyPath = run(project, home, ["vault", "key", "path"]).trim();
  assert.ok(fs.existsSync(keyPath));
  const keyExport = run(project, home, ["vault", "key", "export"]).trim();
  assert.equal(Buffer.from(keyExport, "base64").length, 32);
}

function testTrackedLocalStops() {
  const home = path.join(tmpRoot, "home-tracked");
  const project = path.join(tmpRoot, "project-tracked");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(project, ".local"), { recursive: true });
  fs.writeFileSync(path.join(project, ".local", "secret.txt"), "tracked\n");
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("git", ["add", ".local/secret.txt"], { cwd: project });

  const result = runRaw(project, home, []);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.local is already tracked by git/);
  assert.match(result.stderr, /git rm --cached -r \.local/);
}

function testMissingKeyAndReset() {
  const home = path.join(tmpRoot, "home-reset");
  const project = path.join(tmpRoot, "project-reset");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  run(project, home, []);
  run(project, home, ["secret", "set", "demo"], {}, "dummy-secret-value");
  const keyPath = run(project, home, ["vault", "key", "path"]).trim();
  fs.renameSync(keyPath, `${keyPath}.saved`);

  const missing = runRaw(project, home, ["secret", "list"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /vault key is missing/);
  assert.match(missing.stderr, /vault reset --yes/);

  run(project, home, ["vault", "reset", "--yes"]);
  assert.ok(fs.existsSync(path.join(project, ".local", "vault", "lost")));
  assert.ok(fs.existsSync(keyPath));
  assert.equal(run(project, home, ["secret", "list"]), "");
}

function run(cwd, home, args, extraEnv = {}, input = "") {
  const result = runRaw(cwd, home, args, extraEnv, input);
  if (result.status !== 0) {
    throw new Error(`command failed: ${args.join(" ")}\n${result.stderr}`);
  }
  return result.stdout;
}

function runRaw(cwd, home, args, extraEnv = {}, input = "") {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function collectText(base, includePaths) {
  const chunks = [];
  for (const rel of includePaths) {
    const full = path.join(base, rel);
    if (!fs.existsSync(full)) {
      continue;
    }
    walk(full, chunks);
  }
  return chunks.join("\n");
}

function walk(target, chunks) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      walk(path.join(target, entry), chunks);
    }
    return;
  }
  if (stat.isFile()) {
    const data = fs.readFileSync(target);
    if (!data.includes(0)) {
      chunks.push(data.toString("utf8"));
    }
  }
}
