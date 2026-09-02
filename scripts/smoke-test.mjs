#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(root, "bin", "codex-project.mjs");
const skillInstaller = path.join(root, "scripts", "install-skill.mjs");
const legacyHookCommand = 'root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; node "$root/.codex/hooks/codex-project-context-hook.mjs" "$root"';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-project-smoke-"));

try {
  testHelpDoesNotInit();
  testFreshInitAndVault();
  testProjectIdentityMigrationAndMove();
  testInvalidProjectIdentityStops();
  testTrackedLocalStops();
  testMissingKeyAndReset();
  testSkillInstaller();
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
  assert.match(help, /codex-project learn/);
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
  execFileSync("git", ["init", "-q"], { cwd: project });
  fs.mkdirSync(path.join(project, ".codex"), { recursive: true });
  fs.writeFileSync(
    path.join(project, ".codex", "hooks.json"),
    `${JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "node existing-hook.mjs" }] }],
      },
    }, null, 2)}\n`,
  );

  const initOutput = run(project, home, ["init", "Demo app. api_key=abc123"], {
    CODEX_THREAD_ID: "thread-smoke-001",
  });
  assert.equal(initOutput.includes("vault_key"), false);

  assert.ok(fs.existsSync(path.join(project, ".local", "project.md")));
  const projectId = fs.readFileSync(path.join(project, ".local", "project-id"), "utf8").trim();
  assert.match(projectId, /^[a-f0-9]{32}$/);
  assert.match(fs.readFileSync(path.join(project, ".local", "project.md"), "utf8"), new RegExp(`project_id: ${projectId}`));
  assert.ok(fs.existsSync(path.join(project, ".local", "learn", "candidates")));
  assert.ok(fs.existsSync(path.join(project, ".local", "learn", "rules")));
  assert.ok(fs.existsSync(path.join(project, ".codex", "config.toml")));
  assert.ok(fs.existsSync(path.join(project, ".codex", "hooks.json")));
  assert.equal(fs.existsSync(path.join(project, ".codex", "hooks", "codex-project-context-hook.mjs")), false);
  assert.ok(fs.existsSync(path.join(project, ".local", "chats", "thread-smoke-001", "initial-request.md")));
  assert.ok(fs.existsSync(path.join(project, ".local", "vault", "secrets.json.enc")));
  assert.match(fs.readFileSync(path.join(project, ".gitignore"), "utf8"), /^\.local\/$/m);
  const agentsContract = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
  assert.match(agentsContract, /Deterministic Local Project Contract/);
  assert.match(agentsContract, /Treat built-in local memory as useful recall/);
  assert.match(agentsContract, /Never ask the user to paste a secret into chat for storage/);
  assert.doesNotMatch(agentsContract, /If the user provides passwords/);
  const hooksJson = JSON.parse(fs.readFileSync(path.join(project, ".codex", "hooks.json"), "utf8"));
  const hookEntries = hooksJson.hooks.UserPromptSubmit.flatMap((group) => group.hooks || []);
  assert.ok(hookEntries.some((hook) => hook.command === "node existing-hook.mjs"));
  assert.ok(hookEntries.some((hook) =>
    hook.command === "codex-project hook" && hook.commandWindows === "codex-project.cmd hook"
  ));

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
  run(project, home, ["learn", "add", "mistake", "READMEには未実装機能を既存機能のように書かない"]);
  const learnList = run(project, home, ["learn", "list"]);
  assert.match(learnList, /mistake/);
  assert.match(learnList, /READMEには未実装機能/);
  const sensitiveLearn = run(project, home, ["learn", "add", "instruction", "api_key=do-not-store"]);
  assert.match(sensitiveLearn, /sensitive-looking text/);
  const learnId = learnList.split(/\s+/)[0];
  const fullContextAfterLearn = run(project, home, ["context"]);
  assert.match(fullContextAfterLearn, /project_learning:/);
  assert.match(fullContextAfterLearn, /candidate mistake/);
  const hookContextAfterLearn = run(project, home, ["context", "--hook"]);
  assert.match(hookContextAfterLearn, /learning_notes:/);
  assert.match(hookContextAfterLearn, /candidate mistake/);
  const nestedDir = path.join(project, "nested");
  fs.mkdirSync(nestedDir);
  const internalHookContext = run(nestedDir, home, ["hook"]);
  assert.match(internalHookContext, /^\[codex-project context\]/m);
  assert.equal(fs.existsSync(path.join(nestedDir, ".local")), false);
  run(project, home, ["learn", "promote", learnId]);
  const hookContextAfterPromote = run(project, home, ["context", "--hook"]);
  assert.match(hookContextAfterPromote, /mistake: READMEには未実装機能/);
  fs.appendFileSync(
    path.join(project, ".local", "chats", "thread-smoke-001", "conversation.md"),
    "- ユーザー指示: コピー用本文はpbcopyを使う\n- ユーザー指示: api_key=do-not-capture\n",
  );
  run(project, home, ["learn", "capture"]);
  const capturedList = run(project, home, ["learn", "list"]);
  assert.match(capturedList, /コピー用本文はpbcopy/);
  assert.equal(capturedList.includes("do-not-capture"), false);
  const hooksStatus = run(project, home, ["hooks", "status"]);
  assert.match(hooksStatus, /project_hooks: installed/);
  run(project, home, ["hooks", "remove"]);
  const hooksStatusAfterRemove = run(project, home, ["hooks", "status"]);
  assert.match(hooksStatusAfterRemove, /project_hooks: not_installed/);
  assert.ok(readHookEntries(project).some((hook) => hook.command === "node existing-hook.mjs"));
  installLegacyHook(project);
  const legacyHooksStatus = run(project, home, ["hooks", "status"]);
  assert.match(legacyHooksStatus, /project_hooks: outdated/);
  run(project, home, ["hooks", "install"]);
  assert.equal(fs.existsSync(path.join(project, ".codex", "hooks", "codex-project-context-hook.mjs")), false);
  assert.match(run(project, home, ["hooks", "status"]), /project_hooks: installed/);
  assert.ok(readHookEntries(project).some((hook) => hook.command === "node existing-hook.mjs"));
  const searchableAfterMemory = collectText(project, [".local", ".codex", "AGENTS.md", ".gitignore"]);
  assert.equal(searchableAfterMemory.includes("sensitive shared note"), false);

  const keyPath = run(project, home, ["vault", "key", "path"]).trim();
  assert.ok(fs.existsSync(keyPath));
  const keyExport = run(project, home, ["vault", "key", "export"]).trim();
  assert.equal(Buffer.from(keyExport, "base64").length, 32);
  assertWindowsPrivateAcl(keyPath);
  assertWindowsPrivateAcl(path.join(project, ".local"));

  const legacyKeyPath = keyPath.replace(
    `${path.sep}.codex${path.sep}codex-project${path.sep}`,
    `${path.sep}.codex${path.sep}init-codex-project${path.sep}`,
  );
  fs.mkdirSync(path.dirname(legacyKeyPath), { recursive: true });
  fs.renameSync(keyPath, legacyKeyPath);
  assert.match(run(project, home, ["secret", "list"]), /^initial_api_key$/m);
  assert.ok(fs.existsSync(keyPath));
}

function testProjectIdentityMigrationAndMove() {
  const home = path.join(tmpRoot, "home-project-move");
  const original = path.join(tmpRoot, "project-before-move");
  const moved = path.join(tmpRoot, "project-after-move");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(original, { recursive: true });

  run(original, home, ["init"]);
  run(original, home, ["secret", "set", "move_test"], {}, "survives-move");
  const originalId = fs.readFileSync(path.join(original, ".local", "project-id"), "utf8").trim();
  const originalKeyPath = run(original, home, ["vault", "key", "path"]).trim();

  fs.unlinkSync(path.join(original, ".local", "project-id"));
  fs.renameSync(original, moved);

  assert.match(run(moved, home, ["context"]), /move_test/);
  assert.equal(run(moved, home, ["secret", "get", "move_test"]), "survives-move");
  assert.equal(fs.readFileSync(path.join(moved, ".local", "project-id"), "utf8").trim(), originalId);
  assert.equal(run(moved, home, ["vault", "key", "path"]).trim(), originalKeyPath);

  run(moved, home, ["init"]);
  assert.match(
    fs.readFileSync(path.join(moved, ".local", "project.md"), "utf8"),
    new RegExp(`^- root: ${escapeRegExp(fs.realpathSync(moved))}$`, "m"),
  );
}

function testInvalidProjectIdentityStops() {
  const home = path.join(tmpRoot, "home-invalid-project-id");
  const project = path.join(tmpRoot, "project-invalid-project-id");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  run(project, home, ["init"]);
  fs.writeFileSync(path.join(project, ".local", "project-id"), "invalid\n");
  const result = runRaw(project, home, ["context"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid project identity/);
  assert.equal(fs.existsSync(path.join(project, ".local", "vault", "lost")), false);
}

function testTrackedLocalStops() {
  const home = path.join(tmpRoot, "home-tracked");
  const project = path.join(tmpRoot, "project-tracked");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(project, ".local"), { recursive: true });
  fs.writeFileSync(path.join(project, ".local", "secret.txt"), "tracked\n");
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("git", ["add", "-f", ".local/secret.txt"], { cwd: project });

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

  const hook = runRaw(project, home, ["hook"]);
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
  assert.match(hook.stderr, /context_unavailable: missing_vault_key/);
  assert.match(hook.stderr, /run `codex-project context`/);
  assert.equal(hook.stderr.includes(keyPath), false);

  run(project, home, ["vault", "reset", "--yes"]);
  assert.ok(fs.existsSync(path.join(project, ".local", "vault", "lost")));
  assert.ok(fs.existsSync(keyPath));
  assert.equal(run(project, home, ["secret", "list"]), "");
}

function testSkillInstaller() {
  const home = path.join(tmpRoot, "home-installer");
  const skillsDir = path.join(home, ".agents", "skills");
  const legacyLink = path.join(skillsDir, "init-codex-project");
  const installed = path.join(skillsDir, "codex-project");
  const staleSource = path.join(home, "stale-codex-project");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(staleSource);
  fs.symlinkSync(
    path.join(root, ".agents", "skills", "codex-project"),
    legacyLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  fs.symlinkSync(staleSource, installed, process.platform === "win32" ? "junction" : "dir");

  runInstaller(home);
  runInstaller(home);
  assert.ok(fs.lstatSync(installed).isSymbolicLink());
  assert.equal(fs.realpathSync(installed), fs.realpathSync(path.join(root, ".agents", "skills", "codex-project")));
  assert.equal(fs.existsSync(legacyLink), false);

  const conflictHome = path.join(tmpRoot, "home-installer-conflict");
  const conflictPath = path.join(conflictHome, ".agents", "skills", "codex-project");
  fs.mkdirSync(conflictPath, { recursive: true });
  const conflict = runInstallerRaw(conflictHome);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /not a managed link/);
  assert.ok(fs.statSync(conflictPath).isDirectory());
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
      USERPROFILE: home,
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runInstaller(home) {
  const result = runInstallerRaw(home);
  if (result.status !== 0) {
    throw new Error(`skill installer failed\n${result.stderr}`);
  }
}

function runInstallerRaw(home) {
  return spawnSync(process.execPath, [skillInstaller], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

function installLegacyHook(project) {
  const hooksDir = path.join(project, ".codex", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(project, ".codex", "hooks.json"),
    `${JSON.stringify({
      hooks: {
        UserPromptSubmit: [{
          hooks: [
            { type: "command", command: "node existing-hook.mjs" },
            { type: "command", command: legacyHookCommand },
          ],
        }],
      },
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(hooksDir, "codex-project-context-hook.mjs"),
    `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const root = process.argv[2] || process.cwd();
spawnSync("codex-project", ["learn", "capture", "--hook"], {
  cwd: root,
  encoding: "utf8",
});
const result = spawnSync("codex-project", ["context", "--hook"], {
  cwd: root,
  encoding: "utf8",
});

if (result.status === 0 && result.stdout) {
  process.stdout.write(result.stdout);
}
`,
  );
}

function readHookEntries(project) {
  const hooksJson = JSON.parse(fs.readFileSync(path.join(project, ".codex", "hooks.json"), "utf8"));
  return (hooksJson.hooks?.UserPromptSubmit || []).flatMap((group) => group.hooks || []);
}

function assertWindowsPrivateAcl(targetPath) {
  if (process.platform !== "win32") {
    return;
  }
  const command = [
    "$target = $env:CODEX_PROJECT_ACL_TARGET",
    "$acl = if ([System.IO.Directory]::Exists($target)) { [System.IO.Directory]::GetAccessControl($target) } else { [System.IO.File]::GetAccessControl($target) }",
    "$allowed = @([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')",
    "if (-not $acl.AreAccessRulesProtected) { exit 2 }",
    "$rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])",
    "$unexpected = $rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $allowed -notcontains $_.IdentityReference.Value }",
    "if ($unexpected) { exit 3 }",
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: { ...process.env, CODEX_PROJECT_ACL_TARGET: targetPath },
    stdio: "pipe",
  });
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
