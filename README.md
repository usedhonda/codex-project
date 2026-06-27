# init-codex-project

Codex App で新しいプロジェクトを始めるときに、プロジェクト内だけで共有する記憶領域を作る初期化ツールです。

`init-codex-project` は `.local/` を作り、後続チャットが読むべき `AGENTS.md` の管理ブロックを追加し、個人情報やパスワードを内部的に暗号化して保存できるようにします。

## インストール

```sh
git clone https://github.com/usedhonda/init-codex-project.git
cd init-codex-project
npm link
npm run install-skill
```

`npm link` で `init-codex-project` コマンドを使えるようにします。
`npm run install-skill` で Codex App から `$init-codex-project` として呼べるようにします。

## 使い方

対象プロジェクトのフォルダで実行します。

```sh
init-codex-project
init-codex-project "Next.js の SaaS。認証は Clerk。"
```

Codex App では skill として呼びます。

```text
$init-codex-project
$init-codex-project Next.js の SaaS。認証は Clerk。
```

## 何が作られるか

- `.local/project.md`: プロジェクトの目的や初期情報
- `.local/state.md`: 現在の状態
- `.local/decisions.md`: 決定事項
- `.local/index.md`: チャット一覧
- `.local/chats/<chat-id>/`: チャットごとの作業ログ
- `.local/vault/secrets.json.enc`: 暗号化された保存領域
- `AGENTS.md`: 後続チャットが `.local/` と暗号化メモを読むためのルール

`.local/` は `.gitignore` に追加されます。すでに git が `.local/` を追跡している場合は、危険なので強めに停止します。

## 暗号化メモ

ユーザーは鍵を意識する必要はありません。内部的に暗号化の準備を行い、`.local/vault/secrets.json.enc` に保存します。

他のチャットに読ませたいが、平文 Markdown には置きたくない内容は `memory` に入れます。

```sh
printf '%s' 'ここに個人情報を含む共有メモ' | init-codex-project memory set account
init-codex-project memory list
init-codex-project memory get account
init-codex-project memory delete account
```

既存ファイルを暗号化メモへ取り込む場合:

```sh
init-codex-project memory import account .local/account-credentials.md
```

取り込み後も元の平文ファイルは自動削除しません。内容を確認して、不要ならユーザーの明示指示で削除してください。

## 秘密値

API キーやパスワードのような単体の秘密値は `secret` に入れます。

```sh
printf '%s' 'example-value' | init-codex-project secret set api_token
init-codex-project secret list
init-codex-project secret get api_token
init-codex-project secret delete api_token
```

`secret get` は値そのものを出力します。Codex は必要なときだけ使い、チャット本文には表示しないでください。

## 後続チャットでの読み方

`AGENTS.md` の管理ブロックにより、後続チャットは開始時に以下を行います。

```sh
init-codex-project context
```

これで平文の共有ファイル、暗号化メモ名、秘密値名だけを一覧できます。暗号化メモの本文が必要な場合だけ、次を使います。

```sh
init-codex-project memory get <name>
```

## 注意点

- `.local/` はローカル専用です。git に入れません。
- 個人情報、パスワード、API キー、公開したくない共有メモは平文 Markdown に書かず、`memory` または `secret` に入れてください。
- 暗号化は、`.local/` だけが流出した場合や誤コミットを防ぐためのものです。
- 同じ Mac の同じユーザー権限を完全に奪われた場合は、防御できません。
- 暗号化データは同じ環境で読む前提です。マシン移行時は別途エクスポートまたは移行が必要です。

## 開発

```sh
npm run check
npm test
```
