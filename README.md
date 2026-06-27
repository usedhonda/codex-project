# codex-project

Codex App のプロジェクトフォルダでは、同じプロジェクト内に複数のチャットを作れます。`codex-project` は、その複数チャットが共通して読める「プロジェクト内だけの記憶領域」を安全に追加・整備するツールです。

`.local/` に共有メモ、チャット別ログ、状態ファイルを置き、後続チャットが読むべき `AGENTS.md` の管理ブロックを追加します。個人情報やパスワードは、ユーザーが鍵を意識しなくても内部的に暗号化して保存できます。

さらに、そのプロジェクト内だけで動く Codex hooks を `.codex/` に入れ、各チャットが共有状態を見落としにくくします。グローバル設定には触れません。

## インストール

```sh
git clone https://github.com/usedhonda/codex-project.git
cd codex-project
npm link
npm run install-skill
```

`npm link` で `codex-project` コマンドを使えるようにします。
`npm run install-skill` で Codex App から `$codex-project` として呼べるようにします。

## 共有記憶を追加する

対象プロジェクトのフォルダで実行します。ここでの `init` は、既存プロジェクトに `codex-project` 用の共有記憶を追加セットアップする操作です。既存のソースコードやドキュメントを消したり、プロジェクトを作り直したりしません。

```sh
codex-project init
codex-project init "Next.js の SaaS。認証は Clerk。"
```

すでに開発中のプロジェクトでも、あとから同じコマンドで導入できます。`.local/` が git 追跡済みの場合だけ、安全のため停止します。

Codex App では skill として呼びます。これも同じく、共有記憶を追加・整備する操作です。

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
- `.codex/hooks.json`: このプロジェクト専用の Codex hook 設定
- `.codex/hooks/codex-project-context-hook.mjs`: 各ターン前に共有状態を短く表示する hook
- `AGENTS.md`: 後続チャットが `.local/` と暗号化メモを読むためのルール

`.local/` は `.gitignore` に追加されます。すでに git が `.local/` を追跡している場合は、危険なので強めに停止します。

## プロジェクト内 hooks

`codex-project init` は、対象プロジェクト内の `.codex/` にだけ hooks を入れます。グローバル設定の `~/.codex/config.toml` には触りません。

hook は Codex の `UserPromptSubmit` で動き、各ターン前に次のような短い共有状態だけを表示します。

- `.local/` の場所
- 平文共有ファイルの一覧
- 暗号化メモ名
- 秘密値名
- handoff ファイルの有無
- inbox がある場合の未読数

暗号化メモや秘密値の本文は表示しません。

```sh
codex-project hooks status
codex-project hooks install
codex-project hooks remove
```

Codex が新しい hook を検出したときは、Codex 側の `/hooks` で信頼確認が必要になることがあります。

## 暗号化メモ

ユーザーは鍵を意識する必要はありません。内部的に暗号化の準備を行い、`.local/vault/secrets.json.enc` に保存します。

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

## 後続チャットでの読み方

`AGENTS.md` の管理ブロックにより、後続チャットは開始時に以下を行います。

```sh
codex-project context
```

これで平文の共有ファイル、暗号化メモ名、秘密値名だけを一覧できます。暗号化メモの本文が必要な場合だけ、次を使います。

```sh
codex-project memory get <name>
```

hook からは短い表示だけを使います。

```sh
codex-project context --hook
```

## 注意点

- `.local/` はローカル専用です。git に入れません。
- `.codex/` の hooks はこのプロジェクト専用です。別プロジェクトやグローバル設定には広がりません。
- 個人情報、パスワード、API キー、公開したくない共有メモは平文 Markdown に書かず、`memory` または `secret` に入れてください。
- 暗号化は、`.local/` だけが流出した場合や誤コミットを防ぐためのものです。
- 同じ Mac の同じユーザー権限を完全に奪われた場合は、防御できません。
- 暗号化データは同じ環境で読む前提です。マシン移行時は別途エクスポートまたは移行が必要です。

## 開発

```sh
npm run check
npm test
```
