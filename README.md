# init-cdxapp

Project-local initializer for Codex App workspaces.

`init-cdxapp` creates a private `.local/` memory area, updates the target
project's `AGENTS.md` with the shared operating contract, and provides an
encrypted local vault for secrets.

## Install

Clone the repository and link the CLI locally:

```sh
git clone https://github.com/usedhonda/init-codex-project.git
cd init-codex-project
npm link
```

## Usage

From the project you want to initialize:

```sh
init-cdxapp
init-cdxapp "Build a Next.js app. Use Clerk for auth."
```

Secret vault commands:

```sh
printf '%s' 'example-value' | init-cdxapp secret set api_token
init-cdxapp secret list
init-cdxapp secret get api_token
init-cdxapp secret delete api_token
init-cdxapp vault key path
init-cdxapp vault key export
init-cdxapp vault reset --yes
```

## Storage Model

- `.local/` is added to `.gitignore`.
- If git already tracks `.local/`, initialization stops hard.
- Shared project memory lives in `.local/*.md`.
- Per-chat logs live in `.local/chats/<chat-id>/`.
- Secrets live encrypted in `.local/vault/secrets.json.enc`.
- The vault key lives outside the project at
  `~/.codex/init-cdxapp/keys/<project-id>.key`.

Losing the key makes the old vault unrecoverable. Use `vault key export` and
store the output in a password manager or other trusted backup.

## Codex App Skill

Codex App does not support adding arbitrary raw slash commands such as
`/init-cdxapp` from `~/.codex/prompts`. Use the packaged skill instead.

For repo-local use, keep `.agents/skills/init-cdxapp/SKILL.md` in the
repository and invoke it as:

```text
$init-cdxapp
$init-cdxapp Build a Next.js app. Use Clerk for auth.
```

For personal use across projects, copy or symlink the skill directory to:

```sh
~/.agents/skills/init-cdxapp
```

Codex detects skill changes automatically in many cases. If the skill does not
appear, restart Codex or open a new chat.

## Safety Notes

- `.local/` is private local state and is never intended for git.
- Secrets should go into the vault, not plain Markdown logs.
- The vault primarily protects against accidental repository sharing or
  `.local/` leakage without the external key file.
- If both `.local/vault/secrets.json.enc` and the key file are copied together,
  the vault can be decrypted by whoever has both files.
