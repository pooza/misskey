---
name: upstream-merge
description: pooza/misskey（ダイスキー）を upstream（misskey-dev/misskey）の新しいタグへ追従させる。衝突の事前確認、merge/<版> ブランチでのマージと解決、version の <上流版>+0、乖離ファイル集合の前後比較、typecheck / autogen / shipping の検証、daisskey への PR まで。「2026.10.0 が出ました」のように上流の版が出たときに呼ぶ。
disable-model-invocation: true
---

# upstream 追従（版上げ）

⚠⚠ **正本はこのファイル。**[docs/CLAUDE.md](../../../docs/CLAUDE.md) の「upstream 追従」はここへのポインタ。
フォークがどこを改変しているか（衝突の意味を判断する材料）は docs/CLAUDE.md の「フォーク改変カタログ」にある。

🔴 **外へ書く step を含む**（push・PR 作成）ので明示呼び出し専用。

⚠ upstream 由来の [README.md](../README.md) は「`disable-model-invocation: true` は付けない」としているが、それは upstream 向けの規約。
フォークで足す skill には [ginseng-style docs/skills.md](https://github.com/pooza/ginseng-style/blob/main/docs/skills.md) の「外へ書く step があれば明示呼び出し」を当てる（#451）。

## 全体の流れ

```text
upstream のタグ ──merge──▶ merge/<版>（daisskey から切る）──PR──▶ daisskey
```

| | やること | 節 |
| --- | --- | --- |
| 1 | 衝突の事前確認 | [§1](#1-衝突の事前確認) |
| 2 | マージと衝突の解決 | [§2](#2-マージと衝突の解決) |
| 3 | 衝突しないのに壊れる箇所 | [§3](#3-衝突しないのに壊れる箇所) |
| 4 | 検証 | [§4](#4-検証) |
| 5 | PR | [§5](#5-pr) |
| 6 | デプロイ | [§6](#6-デプロイ) |

- ⚠ `develop` は upstream 追従用のミラーだが、**2026-04 から更新していない。**この流れでは使わない
- 基本は stable のタグを追う。⚠ pre-release（alpha / beta / RC）を取り込むのはユーザーが指示したときだけ（前例: `2026.7.0-beta.1`）。
  その場合も version は `<タグ>+0`（例 `2026.7.0-beta.1+0`）

## 1. 衝突の事前確認

作業ツリーに触らずに洗い出す（`git merge-tree`）:

```bash
.claude/skills/upstream-merge/scripts/precheck.sh <新タグ>
```

出るもの: 直前に取り込んだタグ（`git describe` で自動判定）、コミット数、**新規 migration**、衝突の内訳（modify/delete とそれ以外）。
新規 migration の有無はデプロイ時のスナップショットの要否に効くので、PR 本文に書く。

## 2. マージと衝突の解決

```bash
git switch -c merge/<版> origin/daisskey
git merge <新タグ>            # → "Merge tag '<版>' into merge/<版>"
```

| 衝突 | 解決 |
| --- | --- |
| `.github/workflows/*.yml` の **modify/delete** | **削除を維持**（`git rm`）。フォークは不要な CI を削っている（docs/CLAUDE.md「CI とレビュー体制」） |
| フォークが残した workflow（`check-misskey-js-autogen.yml` / `check-spdx-license-id.yml` など）の中身の衝突 | **フォーク版を維持**し、upstream のアクションの版上げ（`actions/checkout@...` など）だけ取り込む |
| ルートの `package.json` の `version` | 🔴 **`<上流版>+0`**（例 `2026.10.0+0`）。素の上流版にしない（docs/CLAUDE.md「バージョン番号」）。`packages/*/package.json` は上流の版のまま |
| `AGENTS.md` / `.github/copilot-instructions.md` / `.claude/skills/*` | 上流の更新を取り込みつつ、**`⚠ フォーク:` の注記を落とさない** |
| フォーク改変のあるソース | 🔴 **`--ours` で丸ごと採らない。**上流版を土台に、フォーク改変を再適用する |

## 3. 衝突しないのに壊れる箇所

🔴 **テキスト上は自動マージされても、意味的に壊れることがある。**§4 の backend typecheck で拾う。

| 版 | 症状 | 対処 |
| --- | --- | --- |
| 2026.9.1（#449） | `CleanRemoteNotesProcessorService` の戻り値に upstream が `cursor` を足したが、フォーク独自の 57014 タイムアウト早期 return には無く、typecheck が落ちた | 早期 return でも保存済みカーソルを返す |
| 2026.9.0（#437） | upstream が `scripts/check-spdx.mjs` / `check-shipping.mjs` を持ち込んだ。`check-shipping.mjs` は `daisskey` を知らない | `--base origin/daisskey` を付ける旨を shipping-misskey-change に注記 |

新しく踏んだらこの表に足す。

## 4. 検証

```bash
.claude/skills/upstream-merge/scripts/divergence.sh <前タグ> <新タグ>   # 乖離ファイル集合の前後比較（既定: origin/daisskey と HEAD）
pnpm install --frozen-lockfile
pnpm --filter backend typecheck
pnpm --filter misskey-js build && pnpm build-misskey-js-with-types    # autogen に差分が出ないこと（出たら commit する）
node scripts/check-shipping.mjs --base origin/daisskey
```

- **乖離ファイル集合**: 一致すれば「upstream の変更を取りこぼしていない」「フォーク改変が消えていない」。
  ⚠ `package.json` は `+0` を付けるので乖離側に残るのが正常。差が出たらファイルごとに理由を説明できること
- 🔴 **backend typecheck は必ず回す**（§3）
- ⚠ **locale safety の FAIL は、upstream の Crowdin 更新分なら正常。**フォークの locale 差分が追従前と同じ
  （`en-US` / `ja-JP` / `ja-KS` の独自キーだけ）かを `git diff --name-only <新タグ> HEAD -- locales/` で確かめる
- backend の unit test は docker（`packages/backend/test/compose.yml`）があれば手元で回せる。改変カタログに載っているサービスに近いものを選ぶ
- harness（`.claude/`）の監査（`/harness-audit`）は stable の追従で 1 回だけ

## 5. PR

- base は **`pooza/misskey:daisskey`**。`-R pooza/misskey` を明示する（docs/CLAUDE.md「gh CLI 使用時の注意」）
- タイトル: `chore: upstream <版> を取り込む`
- 本文は #449 に倣う: 取り込み範囲（`<前タグ>..<新タグ>` のコミット数、migration の有無）/ 衝突の解決の表 / 意味的な衝突 / 検証のチェックリスト
- 🔴 **upstream が「可及的速やかにアップデート」としているリリース（未公開の advisory を含む）は、内容を本文に書かない。**リリースノートへのリンクだけにする
- ⚠ 「フォークの `+N` は追従後に付け直す」という #437 由来の書き方はもう使わない（`+0` で出す）
- Codex のレビューは [/ginseng:codex-review](https://github.com/pooza/ginseng-style/blob/main/docs/skills.md) と docs/CLAUDE.md「Codex のレビュー」に従う
- マージはユーザーの指示を待つ

## 6. デプロイ

→ pooza/chubo2 の `.claude/skills/misskey-deploy/`（`/misskey-deploy`。chubo2 のセッションから呼ぶ）。
dev27 → 確認 → 了承 → vulcan。新規 migration がある版は vulcan で DB のスナップショットを必ず取る。
