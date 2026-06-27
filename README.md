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

## Slash Command

Install `init-cdxapp.md` as your Codex slash-command prompt and make sure
`init-cdxapp` is available on `PATH`. The prompt passes any free text after
`/init-cdxapp` to the CLI as the initial project request.

## Safety Notes

- `.local/` is private local state and is never intended for git.
- Secrets should go into the vault, not plain Markdown logs.
- The vault primarily protects against accidental repository sharing or
  `.local/` leakage without the external key file.
- If both `.local/vault/secrets.json.enc` and the key file are copied together,
  the vault can be decrypted by whoever has both files.
