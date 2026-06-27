---
name: init-codex-project
description: Initialize a Codex App project with private .local memory, per-chat logs, AGENTS.md guidance, and an encrypted local secret vault. Use when the user asks for init-codex-project, project bootstrap, .local project memory, or Codex App project initialization.
argument-hint: "[initial project request]"
---

# init-codex-project

Run the `init-codex-project` CLI from the current project directory.

If the user provides text after invoking this skill, treat it as the initial
project request and pass it to the CLI as one argument. Do not summarize it
away before execution.

## Initialize

Use this command from the current working directory:

```sh
init-codex-project "$ARGUMENTS"
```

If there are no arguments, run:

```sh
init-codex-project
```

After the command finishes, report:

- the `.local/` path
- the chat id
- whether initial secrets were moved into the encrypted vault
- any hard stop or conflict file created

Do not print secret values.

## Secret Management

Use these commands when the user asks to manage the vault:

```sh
init-codex-project secret <set|get|list|delete>
init-codex-project vault key <path|export>
init-codex-project vault reset --yes
```

For `secret set`, pass the secret value on stdin and do not echo it in chat.

## Safety Rules

- Treat `.local/` as private local state that may contain personal information.
- Do not commit, paste, or externally transmit `.local/`.
- If `init-codex-project` stops because `.local/` is already tracked by git, stop and report the exact blocker.
- If the vault key is missing, do not create workaround plaintext files. Report that old ciphertext is unrecoverable without the key, then use `vault reset --yes` only when the user asks for reset.
