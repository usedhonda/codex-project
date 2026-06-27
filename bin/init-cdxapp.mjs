#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const INIT_START = "<!-- INIT-CDXAPP -->";
const INIT_END = "<!-- INIT-CDXAPP-END -->";
const VAULT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";

main().catch((error) => {
  console.error(`init-cdxapp: ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const root = process.cwd();

  if (args[0] === "secret") {
    await handleSecretCommand(root, args.slice(1));
    return;
  }

  if (args[0] === "vault") {
    await handleVaultCommand(root, args.slice(1));
    return;
  }

  await initializeProject(root, args.join(" ").trim());
}

async function initializeProject(root, initialRequest) {
  ensureLocalNotTracked(root);
  ensureGitignore(root);

  const now = new Date();
  const project = getProjectInfo(root);
  const chatId = getChatId();
  const localDir = path.join(root, ".local");
  const chatDir = path.join(localDir, "chats", chatId);

  mkdir(localDir, 0o700);
  mkdir(path.join(localDir, "chats"), 0o700);
  mkdir(chatDir, 0o700);
  mkdir(path.join(localDir, "vault"), 0o700);
  ensureVault(root);

  const scan = scanProject(root);
  const storedRequest = initialRequest
    ? storeInitialRequest(root, chatDir, initialRequest)
    : { redactedText: "", secretNames: [] };

  ensureFile(
    path.join(localDir, "project.md"),
    projectTemplate(project, scan, storedRequest.redactedText, now),
    0o600,
  );
  ensureFile(path.join(localDir, "state.md"), stateTemplate(now), 0o600);
  ensureFile(path.join(localDir, "decisions.md"), decisionsTemplate(now), 0o600);
  ensureFile(path.join(localDir, "conflicts.md"), conflictsTemplate(now), 0o600);
  ensureFile(path.join(localDir, "index.md"), indexTemplate(now), 0o600);
  ensureChatFiles(chatDir, chatId, project, storedRequest, now);
  appendInitialRequest(localDir, chatId, storedRequest, now);
  appendChatIndex(path.join(localDir, "index.md"), chatId, now);

  upsertAgentsBlock(path.join(root, "AGENTS.md"));

  console.log(`initialized: ${root}`);
  console.log(`chat_id: ${chatId}`);
  console.log(`local_memory: ${localDir}`);
  console.log(`vault_key: ${getKeyPath(project.projectId)}`);
  if (storedRequest.secretNames.length > 0) {
    console.log(`vaulted_initial_secrets: ${storedRequest.secretNames.join(", ")}`);
  }
}

async function handleSecretCommand(root, args) {
  const action = args[0];
  const name = args[1];

  if (!["set", "get", "list", "delete"].includes(action)) {
    throw new Error("usage: init-cdxapp secret <set|get|list|delete> [name]");
  }

  ensureLocalNotTracked(root);
  ensureGitignore(root);
  ensureVault(root);

  if (action === "list") {
    const vault = readVault(root);
    Object.keys(vault.secrets).sort().forEach((key) => console.log(key));
    return;
  }

  if (!name) {
    throw new Error(`usage: init-cdxapp secret ${action} <name>`);
  }
  validateSecretName(name);

  const vault = readVault(root);

  if (action === "set") {
    const value = await readStdin();
    if (value.length === 0) {
      throw new Error("secret set requires a value on stdin");
    }
    vault.secrets[name] = {
      value,
      updatedAt: new Date().toISOString(),
    };
    writeVault(root, vault);
    console.log(`secret saved: ${name}`);
    return;
  }

  if (action === "get") {
    if (!Object.hasOwn(vault.secrets, name)) {
      throw new Error(`secret not found: ${name}`);
    }
    process.stdout.write(vault.secrets[name].value);
    return;
  }

  if (action === "delete") {
    if (!Object.hasOwn(vault.secrets, name)) {
      throw new Error(`secret not found: ${name}`);
    }
    delete vault.secrets[name];
    writeVault(root, vault);
    console.log(`secret deleted: ${name}`);
  }
}

async function handleVaultCommand(root, args) {
  const [subject, action, flag] = args;
  const project = getProjectInfo(root);

  if (subject === "key" && action === "path") {
    console.log(getKeyPath(project.projectId));
    return;
  }

  if (subject === "key" && action === "export") {
    const key = readOrCreateProjectKey(project.projectId);
    console.log(key.toString("base64"));
    return;
  }

  if (subject === "reset") {
    if (action !== "--yes" && flag !== "--yes") {
      throw new Error("vault reset requires --yes");
    }
    resetVault(root);
    console.log("vault reset complete");
    return;
  }

  throw new Error("usage: init-cdxapp vault key <path|export> | vault reset --yes");
}

function ensureLocalNotTracked(root) {
  if (!isGitRepository(root)) {
    return;
  }
  const tracked = execGit(root, ["ls-files", ".local"]).trim();
  if (tracked.length > 0) {
    throw new Error(
      [
        ".local is already tracked by git. Stop.",
        "Do not store personal information or secrets until it is untracked.",
        "Review the tracked files, then explicitly run: git rm --cached -r .local",
      ].join("\n"),
    );
  }
}

function ensureGitignore(root) {
  const gitignorePath = path.join(root, ".gitignore");
  const marker = "# init-cdxapp local private memory";
  const entry = ".local/";
  const current = readTextIfExists(gitignorePath);
  if (current.split(/\r?\n/).some((line) => line.trim() === entry)) {
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignorePath, `${prefix}\n${marker}\n${entry}\n`, { mode: 0o644 });
}

function upsertAgentsBlock(agentsPath) {
  const current = readTextIfExists(agentsPath);
  const block = agentsBlock();
  if (current.includes(INIT_START) && current.includes(INIT_END)) {
    const pattern = new RegExp(`${escapeRegExp(INIT_START)}[\\s\\S]*?${escapeRegExp(INIT_END)}`);
    fs.writeFileSync(agentsPath, `${current.replace(pattern, block).trimEnd()}\n`);
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(agentsPath, `${current}${prefix}\n${block}\n`);
}

function agentsBlock() {
  return `${INIT_START}
## init-cdxapp Project Memory Contract

- Treat \`.local/\` as private, project-local memory. It may contain personal data, credentials, and sensitive operational notes.
- Never commit, upload, paste, or externally transmit \`.local/\` contents unless the user explicitly asks for a specific item.
- At the start of each chat, read these files when present: \`.local/project.md\`, \`.local/state.md\`, \`.local/decisions.md\`, and \`.local/index.md\`.
- Use \`CODEX_THREAD_ID\` as this chat's id when available. If it is absent, use a generated \`YYYYMMDD-HHMMSS-<random>\` id and note that same-chat identity is not guaranteed.
- Keep chat-local notes under \`.local/chats/<chat-id>/\`: \`session.md\`, \`actions.md\`, and \`conversation.md\`.
- Log meaningful work in \`.local/chats/<chat-id>/actions.md\`. Log important user instructions, decisions, and handoff context in \`conversation.md\`.
- Keep shared current state in \`.local/state.md\`; keep durable project decisions in \`.local/decisions.md\`.
- Store passwords, API keys, tokens, and personal secrets only through the encrypted vault. Do not write secret values into plain Markdown logs.
- The vault ciphertext is \`.local/vault/secrets.json.enc\`; the project key lives outside the repo under \`~/.codex/init-cdxapp/keys/\`.
- If the vault key is lost, old ciphertext is unrecoverable. Reset by creating a new vault and re-registering secrets from their original sources.
- When \`/init-cdxapp <free text>\` is used, treat the free text as a user request, not a casual note. Preserve intent, but record conflicts with repo facts in \`.local/conflicts.md\` instead of silently overwriting reality.
${INIT_END}`;
}

function ensureChatFiles(chatDir, chatId, project, storedRequest, now) {
  ensureFile(
    path.join(chatDir, "session.md"),
    [
      "# Session",
      "",
      `- chat_id: ${chatId}`,
      `- project_id: ${project.projectId}`,
      `- started_at: ${now.toISOString()}`,
      "- purpose: Update this with the current chat goal.",
      "",
    ].join("\n"),
    0o600,
  );
  ensureFile(
    path.join(chatDir, "actions.md"),
    ["# Actions", "", `- ${now.toISOString()}: init-cdxapp initialized this chat workspace.`, ""].join("\n"),
    0o600,
  );
  ensureFile(
    path.join(chatDir, "conversation.md"),
    ["# Conversation Summary", "", "- Record user instructions, important context, and handoff notes here.", ""].join("\n"),
    0o600,
  );

  if (storedRequest.redactedText) {
    const requestPath = path.join(chatDir, "initial-request.md");
    ensureFile(
      requestPath,
      ["# Initial Request", "", storedRequest.redactedText, ""].join("\n"),
      0o600,
    );
  }
}

function appendChatIndex(indexPath, chatId, now) {
  const current = readTextIfExists(indexPath);
  if (current.includes(`| ${chatId} |`)) {
    return;
  }
  fs.appendFileSync(indexPath, `| ${chatId} | ${now.toISOString()} | active | |\n`);
}

function appendInitialRequest(localDir, chatId, storedRequest, now) {
  if (!storedRequest.redactedText) {
    return;
  }
  const projectPath = path.join(localDir, "project.md");
  const statePath = path.join(localDir, "state.md");
  const decisionsPath = path.join(localDir, "decisions.md");
  const conflictsPath = path.join(localDir, "conflicts.md");
  const secretNote =
    storedRequest.secretNames.length > 0
      ? ` Secret-like values were stored in vault entries: ${storedRequest.secretNames.join(", ")}.`
      : "";
  fs.appendFileSync(
    projectPath,
    [
      "",
      "## User Requests",
      "",
      `### ${now.toISOString()} (${chatId})`,
      "",
      storedRequest.redactedText,
      "",
    ].join("\n"),
  );
  fs.appendFileSync(
    statePath,
    `- ${now.toISOString()}: Received init request from ${chatId}.${secretNote}\n`,
  );
  fs.appendFileSync(
    decisionsPath,
    `- ${now.toISOString()}: Treat the init request from ${chatId} as user intent unless it conflicts with repository facts.\n`,
  );
  fs.appendFileSync(
    conflictsPath,
    `- ${now.toISOString()}: Review whether init request ${chatId} conflicts with existing repository facts.\n`,
  );
}

function projectTemplate(project, scan, initialRequest, now) {
  return [
    "# Project",
    "",
    `- project_id: ${project.projectId}`,
    `- root: ${project.root}`,
    `- initialized_at: ${now.toISOString()}`,
    "",
    "## Purpose",
    "",
    initialRequest || "Fill in the project purpose.",
    "",
    "## Discovered Files",
    "",
    ...scan.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function stateTemplate(now) {
  return [
    "# State",
    "",
    `- updated_at: ${now.toISOString()}`,
    "- current_status: Initialized by init-cdxapp.",
    "- next_action: Update this after each meaningful work session.",
    "",
  ].join("\n");
}

function decisionsTemplate(now) {
  return [
    "# Decisions",
    "",
    `- ${now.toISOString()}: Use .local/ as private project memory; keep it out of git.`,
    `- ${now.toISOString()}: Use encrypted vault storage for secrets, with keys under ~/.codex/init-cdxapp/keys/.`,
    "",
  ].join("\n");
}

function conflictsTemplate(now) {
  return [
    "# Conflicts",
    "",
    `- ${now.toISOString()}: No conflicts recorded by init-cdxapp.`,
    "",
  ].join("\n");
}

function indexTemplate(now) {
  return [
    "# Local Memory Index",
    "",
    `- initialized_at: ${now.toISOString()}`,
    "",
    "## Chats",
    "",
    "| chat_id | started_at | status | notes |",
    "| --- | --- | --- | --- |",
  ].join("\n");
}

function scanProject(root) {
  const candidates = [];
  const exactNames = new Set([
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "README",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "Makefile",
    ".env.example",
  ]);
  const skipDirs = new Set([
    ".git",
    ".local",
    "node_modules",
    "dist",
    "build",
    "target",
    ".next",
    ".cache",
    "vendor",
  ]);

  function walk(dir, depth) {
    if (depth > 3 || candidates.length >= 80) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (entry.name === "docs" || depth < 2) {
          walk(full, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (exactNames.has(entry.name) || rel.startsWith(`docs${path.sep}`)) {
        const size = fs.statSync(full).size;
        if (size <= 512 * 1024) {
          candidates.push(rel);
        }
      }
    }
  }

  walk(root, 0);
  return candidates.length > 0 ? candidates.sort() : ["No standard project files discovered."];
}

function storeInitialRequest(root, chatDir, initialRequest) {
  const { redactedText, secrets } = extractSecrets(initialRequest);
  if (secrets.length > 0) {
    ensureVault(root);
    const vault = readVault(root);
    for (const secret of secrets) {
      vault.secrets[secret.name] = {
        value: secret.value,
        updatedAt: new Date().toISOString(),
      };
    }
    writeVault(root, vault);
  }
  mkdir(chatDir, 0o700);
  return {
    redactedText,
    secretNames: secrets.map((secret) => secret.name),
  };
}

function extractSecrets(text) {
  const secrets = [];
  const lines = text.split(/\r?\n/);
  const redactedLines = lines.map((line, index) => {
    const match = line.match(/\b([A-Za-z0-9_.-]*(?:password|passwd|pass|api[_-]?key|token|secret|credential)[A-Za-z0-9_.-]*)\b\s*[:=]\s*(.+)$/i);
    if (!match) {
      return line;
    }
    const name = sanitizeSecretName(`initial_${match[1] || `secret_${index + 1}`}`);
    const value = match[2].trim();
    if (!value) {
      return line;
    }
    secrets.push({ name, value });
    return line.slice(0, match.index) + `${match[1]}=[stored in vault:${name}]`;
  });
  return {
    redactedText: redactedLines.join("\n"),
    secrets,
  };
}

function ensureVault(root) {
  const vaultPath = getVaultPath(root);
  mkdir(path.dirname(vaultPath), 0o700);
  if (!fs.existsSync(vaultPath)) {
    readOrCreateProjectKey(getProjectInfo(root).projectId);
    writeVault(root, { version: VAULT_VERSION, secrets: {} });
    return;
  }
  readProjectKey(getProjectInfo(root).projectId);
}

function readProjectKey(projectId) {
  const keyPath = getKeyPath(projectId);
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      [
        `vault key is missing: ${keyPath}`,
        "Existing vault ciphertext cannot be decrypted without this key.",
        "Restore the key from backup, or run: init-cdxapp vault reset --yes",
      ].join("\n"),
    );
  }
  return parseProjectKey(keyPath);
}

function readVault(root) {
  const vaultPath = getVaultPath(root);
  if (!fs.existsSync(vaultPath)) {
    return { version: VAULT_VERSION, secrets: {} };
  }
  const envelope = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  if (envelope.version !== VAULT_VERSION || envelope.algorithm !== ALGORITHM) {
    throw new Error("unsupported vault format");
  }
  const key = readProjectKey(getProjectInfo(root).projectId);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

function writeVault(root, vault) {
  const key = readProjectKey(getProjectInfo(root).projectId);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(vault), "utf8")),
    cipher.final(),
  ]);
  const envelope = {
    version: VAULT_VERSION,
    algorithm: ALGORITHM,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  const vaultPath = getVaultPath(root);
  mkdir(path.dirname(vaultPath), 0o700);
  fs.writeFileSync(vaultPath, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(vaultPath, 0o600);
}

function resetVault(root) {
  const vaultPath = getVaultPath(root);
  if (fs.existsSync(vaultPath)) {
    const lostDir = path.join(path.dirname(vaultPath), "lost");
    mkdir(lostDir, 0o700);
    const stamp = formatDateForId(new Date());
    fs.renameSync(vaultPath, path.join(lostDir, `secrets-${stamp}.json.enc`));
  }
  const keyPath = getKeyPath(getProjectInfo(root).projectId);
  if (fs.existsSync(keyPath)) {
    fs.renameSync(keyPath, `${keyPath}.lost-${formatDateForId(new Date())}`);
  }
  readOrCreateProjectKey(getProjectInfo(root).projectId);
  writeVault(root, { version: VAULT_VERSION, secrets: {} });
}

function readOrCreateProjectKey(projectId) {
  const keyPath = getKeyPath(projectId);
  mkdir(path.dirname(keyPath), 0o700);
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
    fs.chmodSync(keyPath, 0o600);
  }
  return parseProjectKey(keyPath);
}

function parseProjectKey(keyPath) {
  const keyText = fs.readFileSync(keyPath, "utf8").trim();
  const key = Buffer.from(keyText, "hex");
  if (key.length !== 32) {
    throw new Error(`invalid vault key at ${keyPath}`);
  }
  return key;
}

function getVaultPath(root) {
  return path.join(root, ".local", "vault", "secrets.json.enc");
}

function getKeyPath(projectId) {
  return path.join(os.homedir(), ".codex", "init-cdxapp", "keys", `${projectId}.key`);
}

function getProjectInfo(root) {
  const realRoot = fs.realpathSync(root);
  const projectId = crypto.createHash("sha256").update(realRoot).digest("hex").slice(0, 32);
  return { root: realRoot, projectId };
}

function getChatId() {
  const envCandidates = [
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "OPENAI_CONVERSATION_ID",
    "CONVERSATION_ID",
    "CHAT_ID",
  ];
  for (const name of envCandidates) {
    const value = process.env[name];
    if (value && /^[A-Za-z0-9_.:-]+$/.test(value)) {
      return value;
    }
  }
  return `${formatDateForId(new Date())}-${crypto.randomBytes(4).toString("hex")}`;
}

function validateSecretName(name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error("secret name may only contain letters, numbers, dot, underscore, and dash");
  }
}

function sanitizeSecretName(name) {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 96);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

function ensureFile(filePath, contents, mode) {
  if (fs.existsSync(filePath)) {
    return;
  }
  mkdir(path.dirname(filePath), 0o700);
  fs.writeFileSync(filePath, contents, { mode });
}

function mkdir(dir, mode) {
  fs.mkdirSync(dir, { recursive: true, mode });
  try {
    fs.chmodSync(dir, mode);
  } catch {
    // chmod can fail on filesystems that do not honor POSIX permissions.
  }
}

function isGitRepository(root) {
  try {
    execGit(root, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

function execGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function formatDateForId(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
