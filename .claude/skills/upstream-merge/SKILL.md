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

出るもの: 直前に取り込んだタグ（`git describe` で自動判定）、コミット数、**migration の変更**、衝突の内訳（modify/delete とそれ以外）。

- 新規 migration の有無はデプロイ時のスナップショットの要否に効くので、PR 本文に書く
- 🔴 **既存の migration の変更・削除・リネーム**が出たら、マージする前にユーザーに報告する。
  適用済みの本番 DB では再実行されず、新規インストールと食い違う（AGENTS.md #3。upstream 側の変更でも影響は同じ）

## 2. マージと衝突の解決

```bash
git switch -c merge/<版> origin/daisskey
# マージ前の frontend typecheck のエラー一覧を控える（既存のエラーがあるので、前後の差で見る。§4）
pnpm install --frozen-lockfile
pnpm --filter frontend typecheck 2>&1 | grep 'error TS' | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/frontend-tsc-before.txt
git merge <新タグ>            # → "Merge tag '<版>' into merge/<版>"
```

| 衝突 | 解決 |
| --- | --- |
| `.github/workflows/*.yml` の **modify/delete（フォークが削除済み）** | **削除を維持**（`git rm`）。フォークは不要な CI を削っている（docs/CLAUDE.md「CI とレビュー体制」） |
| 🔴 **modify/delete（upstream が削除・リネーム）** | **削除を維持しない。**フォークが残して改変しているもの（例: `check-spdx-license-id.yml` は AGENTS.md #1 の CI 検査）なので、移動先と役割を確かめてからユーザーに報告する。`precheck.sh` が 🔴 付きで分けて出す |
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

- **乖離ファイル集合**: パスの集合と、両方にあるファイルの**改変行**（`-U0` の +/- 行）を前後で比べる。
  出たものはファイルごとに理由を説明できること（2026.9.1 の履歴で回すと、#449 で手当てした 3 ファイルがちょうど出る）
  - ⚠ `package.json` は `+0` を付けるので乖離側に残るのが正常
  - ⚠ フォークが削除したファイル（削除を維持した workflow）は改変行の比較から外している
  - 🔴 **何も出なくても「安全」の証明ではない。**改変箇所の外で upstream の意味が変わることはある（それを拾うのが typecheck）
- 🔴 **backend typecheck は必ず回す**（§3）
- 🔴 **frontend typecheck もマージ前と比べる。**フォーク独自のコンポーネント（`WidgetTagset.vue` など）は upstream の型が変わっても
  衝突せず、変更ファイル限定の lint にも入らない。⚠ 2026-09-27 時点で既存のエラーが 37 件ある（`WidgetTagset.vue` の 3 件を含む。#455）ので、0 件は期待できない。
  §2 で控えた一覧との差分で見る:
  ```bash
  pnpm --filter frontend typecheck 2>&1 | grep 'error TS' | sed -E 's/\([0-9]+,[0-9]+\)//' | sort > /tmp/frontend-tsc-after.txt
  comm -13 /tmp/frontend-tsc-before.txt /tmp/frontend-tsc-after.txt   # 増えたエラー。空であること
  ```
- ⚠ **locale safety の FAIL は、upstream の Crowdin 更新分なら正常。**フォークの locale 差分が追従前と同じ
  （`en-US` / `ja-JP` / `ja-KS` の独自キーだけ）かを `git diff --name-only <新タグ> HEAD -- locales/` で確かめる
- 🔴 **`check-migrations` は毎回回す**（手順は下の「check-migrations の回し方」）。
  ⚠ エンティティは `src/models` だけでなく chart（`src/core/chart/charts/entities/`）など `src/postgres.ts` が集める各所にあるので、差分のパスで要否を判定しない
- backend の unit test は docker（`packages/backend/test/compose.yml`）があれば手元で回せる。改変カタログに載っているサービスに近いものを選ぶ
- harness（`.claude/`）の監査（`/harness-audit`）は stable の追従で 1 回だけ

### check-migrations の回し方

TypeORM の schema builder が、**migration を当てた DB** とエンティティを比べる。手元の docker（テスト用 DB, ポート 54312）で回す:

```bash
test -f .config/test.yml || cp .github/misskey/test.yml .config/test.yml
docker compose -f packages/backend/test/compose.yml down -v && docker compose -f packages/backend/test/compose.yml up -d
cd packages/backend && pnpm build
NODE_ENV=test pnpm migrate
NODE_ENV=test pnpm compile-config && node scripts/check_migrations_clean.js   # ⚠ ここは NODE_ENV を付けない
pnpm compile-config                                                            # 設定を戻す
```

- 🔴 **`.config/test.yml` が無いまま進めない。**無いと `compile-config` は警告だけ出して `built/.config.json` を書き換えず、
  **前に `.config/default.yml` から作った設定のまま**、テスト用ではない DB へ migrate しうる
- 🔴 **`down -v` で DB を空にしてから。**unit test を回した後の DB には `synchronize` で作られた表が残っている
- 🔴 **`check_migrations_clean.js` は `NODE_ENV=test` で走らせない。**テスト用の chart エンティティまで比較対象に入り、`__chart__test_*` の差分が大量に出る
- ⚠ 2026-09-27 時点で `IDX_drive_file_user_root_id_desc` の 1 件が**既知の差**として出る（#454）。それ以外が出たら追従で入ったもの

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
