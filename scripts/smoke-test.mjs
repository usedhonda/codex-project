#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(root, "bin", "codex-project.mjs");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-project-smoke-"));

try {
  testHelpDoesNotInit();
  testFreshInitAndVault();
  testTrackedLocalStops();
  testMissingKeyAndReset();
  console.log("smoke tests passed");
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

function testHelpDoesNotInit() {
  const home = path.join(tmpRoot, "home-help");
  const project = path.join(tmpRoot, "project-help");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  const help = run(project, home, ["--help"]);
  assert.match(help, /codex-project init/);
  assert.match(help, /codex-project hooks/);
  assert.equal(fs.existsSync(path.join(project, ".local")), false);

  const unknown = runRaw(project, home, ["--not-a-real-option"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown option/);
  assert.equal(fs.existsSync(path.join(project, ".local")), false);
}

function testFreshInitAndVault() {
  const home = path.join(tmpRoot, "home-fresh");
  const project = path.join(tmpRoot, "project-fresh");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "README.md"), "# Demo\n");

  const initOutput = run(project, home, ["init", "Demo app. api_key=abc123"], {
    CODEX_THREAD_ID: "thread-smoke-001",
  });
  assert.equal(initOutput.includes("vault_key"), false);

  assert.ok(fs.existsSync(path.join(project, ".local", "project.md")));
  assert.ok(fs.existsSync(path.join(project, ".codex", "config.toml")));
  assert.ok(fs.existsSync(path.join(project, ".codex", "hooks.json")));
  assert.ok(fs.existsSync(path.join(project, ".codex", "hooks", "codex-project-context-hook.mjs")));
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

  run(project, home, ["memory", "set", "account"], {}, "sensitive shared note");
  const memoryList = run(project, home, ["memory", "list"]);
  assert.match(memoryList, /^account$/m);
  const context = run(project, home, ["context"]);
  assert.equal(context.includes("vault_key"), false);
  assert.match(context, /encrypted_notes:/);
  assert.match(context, /- account/);
  assert.equal(context.includes("sensitive shared note"), false);
  assert.equal(run(project, home, ["memory", "get", "account"]), "sensitive shared note");
  fs.mkdirSync(path.join(project, ".local", "inbox", "pending"), { recursive: true });
  fs.writeFileSync(path.join(project, ".local", "inbox", "pending", "001.md"), "Read README later\n");
  const hookContext = run(project, home, ["context", "--hook"]);
  assert.match(hookContext, /^\[codex-project context\]/m);
  assert.match(hookContext, /encrypted_notes: account/);
  assert.match(hookContext, /secrets: initial_api_key/);
  assert.match(hookContext, /inbox_pending: 1/);
  assert.equal(hookContext.includes("sensitive shared note"), false);
  assert.equal(hookContext.includes("abc123"), false);
  const hooksStatus = run(project, home, ["hooks", "status"]);
  assert.match(hooksStatus, /project_hooks: installed/);
  run(project, home, ["hooks", "remove"]);
  const hooksStatusAfterRemove = run(project, home, ["hooks", "status"]);
  assert.match(hooksStatusAfterRemove, /project_hooks: not_installed/);
  run(project, home, ["hooks", "install"]);
  const searchableAfterMemory = collectText(project, [".local", ".codex", "AGENTS.md", ".gitignore"]);
  assert.equal(searchableAfterMemory.includes("sensitive shared note"), false);

  const keyPath = run(project, home, ["vault", "key", "path"]).trim();
  assert.ok(fs.existsSync(keyPath));
  const keyExport = run(project, home, ["vault", "key", "export"]).trim();
  assert.equal(Buffer.from(keyExport, "base64").length, 32);

  const legacyKeyPath = keyPath.replace(
    `${path.sep}.codex${path.sep}codex-project${path.sep}`,
    `${path.sep}.codex${path.sep}init-codex-project${path.sep}`,
  );
  fs.mkdirSync(path.dirname(legacyKeyPath), { recursive: true });
  fs.renameSync(keyPath, legacyKeyPath);
  assert.match(run(project, home, ["secret", "list"]), /^initial_api_key$/m);
  assert.ok(fs.existsSync(keyPath));
}

function testTrackedLocalStops() {
  const home = path.join(tmpRoot, "home-tracked");
  const project = path.join(tmpRoot, "project-tracked");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(project, ".local"), { recursive: true });
  fs.writeFileSync(path.join(project, ".local", "secret.txt"), "tracked\n");
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("git", ["add", ".local/secret.txt"], { cwd: project });

  const result = runRaw(project, home, ["init"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.local is already tracked by git/);
  assert.match(result.stderr, /git rm --cached -r \.local/);
}

function testMissingKeyAndReset() {
  const home = path.join(tmpRoot, "home-reset");
  const project = path.join(tmpRoot, "project-reset");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  run(project, home, ["init"]);
  run(project, home, ["secret", "set", "demo"], {}, "dummy-secret-value");
  const keyPath = run(project, home, ["vault", "key", "path"]).trim();
  fs.renameSync(keyPath, `${keyPath}.saved`);

  const missing = runRaw(project, home, ["secret", "list"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /encrypted storage cannot be opened/);
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
