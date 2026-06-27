# codex-project

`codex-project` は、Codex App の同じプロジェクトフォルダで作った複数チャットに、共通の記憶領域を持たせるためのツールです。

Codex App では、1つのプロジェクトフォルダから複数のチャットを作れます。ただし、別チャットの会話内容が自動で共有されるわけではありません。`codex-project` は、その隙間を `.local/`、`AGENTS.md`、暗号化メモ、project-local hooks で補います。

ユーザーが直接使うのは、基本的に最初の1回だけです。その後の `context`、`memory`、`secret`、`hooks` などの補助コマンドは、主に Codex が `AGENTS.md` と hooks に従って使います。

既存のソースコードやドキュメントを消さずに、共有記憶のためのファイルだけを追加します。

## インストール

```sh
git clone https://github.com/usedhonda/codex-project.git
cd codex-project
npm link
npm run install-skill
```

`npm link` で `codex-project` コマンドを使えるようにします。`npm run install-skill` で Codex App のスラッシュ一覧から `Codex Project` を選べるようにします。

## ユーザーが使うもの

対象プロジェクトのフォルダで、最初に1回だけ実行します。

```sh
codex-project init
```

初期情報を一緒に渡すこともできます。

```sh
codex-project init "Next.js の SaaS。認証は Clerk。"
```

Codex App では、入力欄で `/` を打って `Codex Project` を選びます。手入力で明示する場合は `$codex-project` も使えます。

```text
$codex-project
$codex-project Next.js の SaaS。認証は Clerk。
```

ここでの `init` は「共有記憶を追加セットアップする」という意味です。既存のソースコードやドキュメントは変更しません。すでに開発中のプロジェクトにもあとから導入できます。

`.local/` がすでに git で追跡されている場合だけ、安全のため停止します。

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

## Codex が使うもの

以下のコマンドは、ユーザーが普段直接使うためのものではありません。Codex が後続チャットで共有状態を読む、必要な暗号化メモだけを取り出す、project-local hooks を動かす、といった用途で使います。

```sh
codex-project context
codex-project context --hook
codex-project memory get <name>
codex-project secret get <name>
codex-project hooks status
```

`context` は、平文の共有ファイル、暗号化メモ名、秘密値名だけを表示します。暗号化メモや秘密値の本文は表示しません。

`context --hook` は、各ターン前に hooks から呼ばれる短い表示用です。

`memory get` と `secret get` は本文や値を出力します。Codex は必要な処理だけに使い、チャット本文には表示しません。

## 暗号化メモと秘密値

個人情報、パスワード、API キー、他チャットに共有したいが平文 Markdown には置きたくない内容は、内部的に暗号化して `.local/vault/secrets.json.enc` に保存します。

ユーザーは通常、鍵や保存形式を意識する必要はありません。Codex が必要に応じて `memory` や `secret` を使います。

必要な場合だけ、手動でも操作できます。

```sh
printf '%s' 'ここに個人情報を含む共有メモ' | codex-project memory set account
codex-project memory list
codex-project memory get account
codex-project memory delete account
```

```sh
printf '%s' 'example-value' | codex-project secret set api_token
codex-project secret list
codex-project secret get api_token
codex-project secret delete api_token
```

既存ファイルを暗号化メモへ取り込む場合:

```sh
codex-project memory import account .local/account-credentials.md
```

取り込み後も元の平文ファイルは自動削除しません。内容を確認して、不要ならユーザーの明示指示で削除してください。

## project-local hooks

`codex-project init` は、対象プロジェクト内の `.codex/` にだけ hooks を入れます。`~/.codex/config.toml` には触らないので、別プロジェクトには広がりません。

hook は Codex の `UserPromptSubmit` で動き、各ターン前に共有状態を短く表示します。暗号化メモや秘密値の本文は表示しません。

hook の状態確認や再導入が必要な場合だけ、次を使います。

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
