---
name: init-codex-project
description: Codex App プロジェクトを初期化し、.local の共有メモリ、チャット別ログ、AGENTS.md ルール、内部暗号化メモリを作る。init-codex-project、project bootstrap、.local project memory、Codex App project initialization の依頼で使う。
argument-hint: "[初期プロジェクト指示]"
---

# init-codex-project

現在のプロジェクトディレクトリで `init-codex-project` CLI を実行する。

ユーザーが skill 呼び出しの後に自由テキストを書いた場合、それは初期プロジェクト指示として扱い、要約せず1つの引数として CLI に渡す。

## 初期化

引数がある場合:

```sh
init-codex-project "$ARGUMENTS"
```

引数がない場合:

```sh
init-codex-project
```

完了後は以下だけを報告する:

- `.local/` のパス
- chat id
- 初期指示内の秘密らしき値を内部暗号化領域へ移したか
- hard stop または conflict があったか

秘密値そのものは表示しない。

## 暗号化メモ

他チャットに読ませたいが、平文 Markdown に置きたくない共有情報は `memory` を使う。

```sh
init-codex-project memory <set|get|list|delete|import>
```

`memory set` は標準入力で本文を渡す。`memory import` はプロジェクト内ファイルを暗号化メモへ取り込む。取り込み元の平文ファイルは自動削除しない。

## 秘密値

API キーやパスワードのような単体の秘密値は `secret` を使う。

```sh
init-codex-project secret <set|get|list|delete>
```

`secret set` は標準入力で値を渡す。`secret get` の出力は必要な処理だけに使い、チャット本文へ表示しない。

## 後続チャットの読み込み

作業開始時は以下を実行して、平文共有ファイル、暗号化メモ名、秘密値名を確認する。

```sh
init-codex-project context
```

必要な暗号化メモだけ読む。

```sh
init-codex-project memory get <name>
```

## 安全ルール

- `.local/` は個人情報を含みうるローカル専用領域として扱う。
- `.local/` を commit、外部送信、貼り付けしない。
- `.local/` が git tracked で停止した場合は、その blocker をそのまま報告する。
- 暗号化領域が開けない場合、平文 workaround を作らない。復旧不能または reset が必要な状態として報告する。
