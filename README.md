# codex-project

`codex-project` は、Codex App の同じプロジェクトフォルダで作った複数チャットに、共通の記憶領域を持たせるためのツールです。

Codex App では、1つのプロジェクトフォルダから複数のチャットを作れます。ただし、別チャットの会話内容が自動で共有されるわけではありません。`codex-project` は、その隙間を `.local/`、`AGENTS.md`、暗号化メモ、project-local hooks で補います。

これはプロジェクトを作り直すツールではありません。既存のソースコードやドキュメントを消さずに、共有記憶のためのファイルを追加します。

## できること

- プロジェクト内だけの共有メモリを `.local/` に作る
- チャットごとの作業ログ置き場を作る
- 後続チャットが読むべき `AGENTS.md` ルールを追加する
- 個人情報、パスワード、API キー、共有したい秘密メモを内部的に暗号化して保存する
- このプロジェクト内だけで動く Codex hooks を入れ、各ターン前に共有状態を短く表示する

## インストール

```sh
git clone https://github.com/usedhonda/codex-project.git
cd codex-project
npm link
npm run install-skill
```

`npm link` で `codex-project` コマンドを使えるようにします。`npm run install-skill` で Codex App から `$codex-project` として呼べるようにします。

## プロジェクトに共有記憶を追加する

対象プロジェクトのフォルダで実行します。

```sh
codex-project init
codex-project init "Next.js の SaaS。認証は Clerk。"
```

ここでの `init` は「共有記憶を追加セットアップする」という意味です。既存プロジェクトの削除、上書きリセット、作り直しはしません。すでに開発中のプロジェクトにもあとから導入できます。

`.local/` がすでに git で追跡されている場合だけ、安全のため停止します。

Codex App では skill として呼びます。

```text
$codex-project
$codex-project Next.js の SaaS。認証は Clerk。
```

## 追加されるもの

- `.local/project.md`: プロジェクトの目的や初期情報
- `.local/state.md`: 現在の状態
- `.local/decisions.md`: 決定事項
- `.local/index.md`: チャット一覧
- `.local/chats/<chat-id>/`: チャットごとの作業ログ
- `.local/vault/secrets.json.enc`: 暗号化された保存領域
- `.codex/config.toml`: project-local hooks を有効にする設定
- `.codex/hooks.json`: このプロジェクト専用の hook 設定
- `.codex/hooks/codex-project-context-hook.mjs`: 各ターン前に共有状態を短く表示する hook
- `AGENTS.md`: 後続チャットが共有記憶を扱うためのルール

`.local/` は `.gitignore` に追加されます。個人情報や秘密情報が入る前提なので、リポジトリには入れません。

## 後続チャットで読む

後続チャットは、まず次を実行すると現在の共有状態を確認できます。

```sh
codex-project context
```

表示されるのは、平文の共有ファイル、暗号化メモ名、秘密値名だけです。暗号化メモや秘密値の本文は表示しません。

必要な暗号化メモだけ、明示的に読みます。

```sh
codex-project memory get <name>
```

hook からは短い表示だけを使います。

```sh
codex-project context --hook
```

## 暗号化メモ

他のチャットに読ませたいが、平文 Markdown には置きたくない内容は `memory` に入れます。

```sh
printf '%s' 'ここに個人情報を含む共有メモ' | codex-project memory set account
codex-project memory list
codex-project memory get account
codex-project memory delete account
```

既存ファイルを暗号化メモへ取り込む場合:

```sh
codex-project memory import account .local/account-credentials.md
```

取り込み後も元の平文ファイルは自動削除しません。内容を確認して、不要ならユーザーの明示指示で削除してください。

## 秘密値

API キーやパスワードのような単体の秘密値は `secret` に入れます。

```sh
printf '%s' 'example-value' | codex-project secret set api_token
codex-project secret list
codex-project secret get api_token
codex-project secret delete api_token
```

`secret get` は値そのものを出力します。Codex は必要なときだけ使い、チャット本文には表示しないでください。

## project-local hooks

`codex-project init` は、対象プロジェクト内の `.codex/` にだけ hooks を入れます。`~/.codex/config.toml` には触らないので、別プロジェクトには広がりません。

hook は Codex の `UserPromptSubmit` で動き、各ターン前に共有状態を短く表示します。暗号化メモや秘密値の本文は表示しません。

```sh
codex-project hooks status
codex-project hooks install
codex-project hooks remove
```

Codex が新しい hook を検出したときは、Codex 側の `/hooks` で信頼確認が必要になることがあります。

## 注意点

- `.local/` はローカル専用です。git に入れません。
- `.codex/` の hooks はこのプロジェクト専用です。
- 個人情報、パスワード、API キー、公開したくない共有メモは平文 Markdown に書かず、`memory` または `secret` に入れてください。
- 暗号化の鍵は内部管理されます。通常、ユーザーが意識する必要はありません。
- 暗号化は、`.local/` だけが流出した場合や誤コミットを防ぐためのものです。
- 同じ Mac の同じユーザー権限を完全に奪われた場合は、防御できません。
- 暗号化データは同じ環境で読む前提です。マシン移行時は別途エクスポートまたは移行が必要です。

## 開発

```sh
npm run check
npm test
```
