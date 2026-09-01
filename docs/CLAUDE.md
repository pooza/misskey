# pooza/misskey 開発ガイド

ダイスキー向けに調整した Misskey のフォーク。拙作ツール
[pooza/mulukhiya-toot-proxy](https://github.com/pooza/mulukhiya-toot-proxy)（通称「モロヘイヤ」）と
併用することが前提。

- **ベース**: misskey-dev/misskey（upstream）
- **デフォルトブランチ**: `daisskey`
- **技術スタック**: Node.js / NestJS / Vue 3 / PostgreSQL / Redis

**このドキュメントはフォーク開発の知見を置く場所。** サーバー構成・デプロイ手順・インフラの罠は
[pooza/chubo2 の docs/infra-misskey.md](https://github.com/pooza/chubo2/blob/main/docs/infra-misskey.md) が
正本で、ここには複写しない（→「情報の記載先ルール」）。

⚠ **このリポジトリは public。** ホスト名・ファイルパス・DB 設定・資格情報は書かない。

エージェント向けの禁止事項と出荷前チェックは [AGENTS.md](../AGENTS.md) と `.claude/skills/` が正本。
**手順はそちら、背景はこちら**と使い分ける。

## フロントエンドは 3 つ

このインフラでフロントエンドにあたるのは
[pooza/mastodon](https://github.com/pooza/mastodon) /
**このフォーク** /
[pooza/capsicum](https://github.com/pooza/capsicum) の 3 つ。
⚠ **capsicum はこのサーバーの推奨クライアント**でもある。

3 者はモロヘイヤ（[pooza/mulukhiya-toot-proxy](https://github.com/pooza/mulukhiya-toot-proxy)）を
共通の土台にしており、**表示書式を共有するものがある**（→「3 クライアントで表示書式を揃える」）。

### 🔴 capsicum に「ダイスキー専用の分岐」を作らせない

⚠⚠ **capsicum がこの Misskey と他の Misskey で扱いを変える必要は、原則として無いようにする。**

つまり **capsicum 側で「接続先がダイスキーかどうか」を判定させる設計を選ばない。**
capsicum は汎用の Misskey / Mastodon クライアントであって、このサーバーの専用クライアントではない。

いま守られている形（capsicum の実装で確認できる）:

- モロヘイヤの有無は `GET /mulukhiya/api/about` の**存在検出**で決める
  （`capsicum_backends/lib/src/mulukhiya/service.dart`）
- 個別機能は**モロヘイヤが返す `features.*` フラグ**で出し分ける
  （`features.annict_review` / `features.media_update` など）
- Misskey 本体との連携は **probing ベース**なので、機能が無ければ自動的に degrade する

⚠ **分岐してよいのは「モロヘイヤが居るか」「その機能フラグが立っているか」まで。**
「サーバーがダイスキーか」で分けた瞬間、capsicum が汎用クライアントでなくなる。

### だから機能はモロヘイヤへ寄せる

⚠⚠ **追加機能は極力モロヘイヤに寄せ、やむを得ない場合だけ Misskey 本体（このフォーク）を直接修正する。**

モロヘイヤに置けば、3 つのフロントエンドすべてが同じ経路（`/mulukhiya/api/*` と `features.*`）で
拾える。フォーク本体に置くと、**upstream 追従の負債になるうえ、capsicum からは
「ダイスキーだけ挙動が違う」ようにしか見えない**。

判断基準の正本はモロヘイヤ側
[docs/CLAUDE.md](https://github.com/pooza/mulukhiya-toot-proxy/blob/main/docs/CLAUDE.md)。
⚠ 例外は「モロヘイヤが SNS の DB へ書き込むことになる場合」で、そのときは本体改造を採る
（→「モロヘイヤとの連携」）。

## ブランチ戦略

| ブランチ | 用途 |
| --- | --- |
| `daisskey` | **デフォルト。**upstream のタグをマージし、ダイスキー向けの調整を加える |
| `develop` | upstream 追従用のミラー。**フォークの作業には使わない** |
| `merge/<版>` | upstream 追従の作業ブランチ（`merge/2026.7.0` 等） |
| `feature/<番号>-<要約>` | 課題ごとの作業ブランチ。base は `daisskey` |

⚠ **PR の base は必ず `pooza/misskey:daisskey`。**upstream へは送らない。

## upstream 追従

- upstream のタグを `merge/<version>` ブランチで取り込んでから `daisskey` へ入れる
  （履歴に `Merge tag '2026.7.0' into merge/2026.7.0` が残っている）
- **フォーク追加ファイル**（`WidgetTagset.vue`、`utility/program-schedule.ts` 等）は衝突しない。
  衝突するのは**上流ファイルに手を入れた箇所**——下の「フォーク改変カタログ」がそれ
- harness（`.claude/`）の検証は **stable 後に 1 回**。alpha / RC では回さない

## フォーク改変カタログ

### デフォルトタグ (`defaultTag`)

このフォークの**中心概念**。サーバー共通のハッシュタグを 1 つ持ち、それを軸に投稿・
タイムライン・検索・掃除がまとめて振る舞いを変える。**上流に存在しない config なので、
`config.defaultTag` を読む箇所はすべてフォーク改変**と思ってよい。

```yaml
# .config/example.yml
defaultTag:
  tag: null      # タグ名（`#` は含めない）。null なら機能ごと無効
  append: true   # 公開 / ホーム投稿に自動で追記するか
```

`grep -rn defaultTag packages/backend/src` で全消費箇所を追える:

| ファイル | 何をしているか |
| --- | --- |
| `core/NoteCreateService.ts` | `append` が真なら公開 / ホーム投稿の本文末尾にタグを追記 |
| `server/api/endpoints/notes/local-timeline.ts` | ローカル TL の絞り込み |
| `server/api/endpoints/notes/hybrid-timeline.ts` | ソーシャル TL の絞り込み |
| `server/api/stream/channels/{local,hybrid}-timeline.ts` | 上記のストリーミング版 |
| `core/SearchService.ts` | 検索対象の絞り込み |
| `queue/processors/CleanRemoteNotesProcessorService.ts` | **タグ付き投稿を削除対象から除外** |

⚠ `append` の条件は一度反転したことがある（`dcb8149d71`）。ここを触ったら
「タグが実際に付く / 付かない」を確かめる。

⚠ **デフォルトハッシュタグ TL は misskey-dev へ PR 済みで却下されている。upstream への
再提案はしない**（[mastodon 側 docs/CLAUDE.md](https://github.com/pooza/mastodon/blob/bshockdon/docs/CLAUDE.md)
の「デフォルトハッシュタグとコミュニティ」節）。

### リモートノートクリーナー

`CleanRemoteNotesProcessorService` は upstream 由来だが 2 点変えている。

1. **デフォルトタグ付き投稿を削除対象から除外**する
2. **`statement_timeout`（PostgreSQL `57014`）を握って自動リトライ**する

2 について。数百万行規模の `note` テーブルでは、バッチ本体だけでなく前後の単発クエリも
タイムアウトする。`minId` / `idWindow` / `DELETE` の 3 箇所に個別のハンドリングがあり、
`DELETE` はバッチサイズを 0.25 倍に縮めて再試行する（#411 / #412 / #413 / #414、経緯は #415）。

⚠ **upstream に無い挙動なので、追従時にこのファイルが衝突したら握り潰さない。**
握り潰すと大規模インスタンスでジョブが `failed` に戻る。

### その他

| 箇所 | 内容 |
| --- | --- |
| `frontend/src/widgets/WidgetTagset.vue` | モロヘイヤ番組表と連携する実況用ウィジェット（`WidgetKoteitag` の後継、#384） |
| `frontend/src/utility/program-schedule.ts` | 番組表の放送日時ラベル。**3 クライアントで書式を共有**（後述） |
| `frontend/src/components/MkLink.vue` | `/mulukhiya` 配下の URL を外部リンク扱いしない |
| `frontend/src/utility/get-note-menu.ts` | ノートメニューからモロヘイヤの status 画面を開く |
| `frontend/src/ui/_common_/navbar.vue` ほか | インスタンス branding |
| `frontend/src/pages/admin/custom-emojis-manager2.vue` | カスタム絵文字管理の独自版 |
| `locales/{ja-JP,en-US}.yml` の `_tagset` 等 | フォーク独自の i18n キー（[AGENTS.md](../AGENTS.md) の locale 例外を参照） |

## モロヘイヤ（mulukhiya-toot-proxy）との連携

モロヘイヤの設計方針は「**本体改造の最小化**」——プロキシ層でふるまいを足し、Misskey 本体への
パッチを減らすこと。**このフォークに機能を足す前に「モロヘイヤ側でできないか」を先に問う。**
逆に、モロヘイヤが SNS の DB へ書き込むことになる場合は本体改造（＝このフォーク）を採る。
判断基準の正本はモロヘイヤ側
[docs/CLAUDE.md](https://github.com/pooza/mulukhiya-toot-proxy/blob/main/docs/CLAUDE.md)。

### 接続の構造

- モロヘイヤは同じホストに同居し、`/mulukhiya` 配下は nginx がモロヘイヤへ直送する。
  ポートと nginx 設定の実体は [chubo2 側](https://github.com/pooza/chubo2/blob/main/docs/infra-misskey.md) が正本
- モロヘイヤは Misskey の PostgreSQL を Sequel で**直読み**する。**書き込みはしない**——
  唯一の例外が `sw_subscription`（`/api/sw/register` が重複 subscription を溜め、修復 API が
  無いため）。この行と Redis キャッシュ `kvcache:userSwSubscriptions:<userId>` を触るので、
  **push 通知まわりを改造するときはモロヘイヤ側と突き合わせる**
- フロントは `/mulukhiya/api/*` を `window.fetch` で直接叩く。**backend 側にモロヘイヤ依存は無い**
  （`grep -rn mulukhiya packages/backend/src` は 0 件）

### このフォークが持つモロヘイヤ依存

`grep -rn mulukhiya packages/frontend/src` で全部出る。**4 ファイルだけ**:

| 箇所 | 内容 |
| --- | --- |
| `widgets/WidgetTagset.vue` | `/mulukhiya/api/program` から番組表を取得して実況タグセットを構成。選択でコマンドノートを投げる |
| `utility/program-schedule.ts` | 番組表の放送日時ラベルの組み立て |
| `utility/get-note-menu.ts` | ノートメニュー → `/mulukhiya/app/status/<id>` を別窓で開く |
| `components/MkLink.vue` | `/mulukhiya` 配下を内部リンク扱いにする |

API 仕様の正本は
[モロヘイヤ docs/api.md](https://github.com/pooza/mulukhiya-toot-proxy/blob/main/docs/api.md)。
`GET /mulukhiya/api/program` は `var/program.yaml` の値を**そのまま**載せるので、
**手編集由来の不正値がフロントまで届く**。パースは厳格にする。

### ⚠ 3 クライアントで表示書式を揃える

番組表の放送日時ラベルは **capsicum / このフォーク / Mastodon フォーク**の 3 つが同じ書式で出す。
番組表を見比べるときに割れると困るので、**片方だけ変えないこと**。

| クライアント | 実装 | テスト |
| --- | --- | --- |
| [capsicum](https://github.com/pooza/capsicum) | `lib/src/ui/util/program_schedule_display.dart` | `test/program_schedule_display_test.dart` |
| このフォーク | `packages/frontend/src/utility/program-schedule.ts` | `packages/frontend/test/unit/program-schedule.test.ts` |
| [pooza/mastodon](https://github.com/pooza/mastodon) | `app/javascript/mastodon/features/compose/util/program_schedule.ts` | 同ディレクトリの `program_schedule.test.ts` |

**3 者のテストは同じケースを共有している。**書式を変えるときは 3 つ同時に直す。
書式が先に決まるのは capsicum のことが多い。

### デフォルトハッシュタグとコミュニティ

- 同じデフォルトタグ＋同一リレーで結ばれたサーバーを「姉妹サーバー」と呼ぶ
  （ダイスキー ↔ デルムリン丼）
- タグの**付与**はこのフォーク（`NoteCreateService`）とモロヘイヤの両方が担いうる。
  Mastodon フォーク側は付与をモロヘイヤに委ねている点が違う

### 注意

- **media_catalog は既定 OFF**（モロヘイヤ 5.23.0〜）。本番で重い SQL とプール枯渇を
  起こしたため。この機能を前提にした実装を入れない

## ローカル開発環境と検証

- `pnpm lint` / `pnpm test` は **`pnpm install` 済みでないと動かない**。`node_modules` を
  持たない環境では、代わりに次で裏を取る（実際に PR #420 で使った手）:
  - **util の単体テスト** — 対象ファイルとテストを他リポジトリの vitest にそのまま持ち込んで実行する
    （import 指定子だけ実ファイルへ alias）
  - **`.vue` の型チェック** — `<script setup>` を抽出し、実際の Vue 型と対象 util の型を解決させて
    `tsc --strict --noEmit`。解決できない import はスタブを当てる
  - ⚠ **「構文エラー 0」で止めない。**型が解決されていない tsc は実質何も見ていない
- **i18n キーを足したら `packages/i18n/src/autogen/locale.ts` も再生成してコミットする。**
  これは tracked なファイルで、`pnpm lint` は再生成しない。忘れると `Locale` に
  キーが無いまま型エラーになる（PR #420 で実際に踏んだ）
- 詳細な手順は `.claude/skills/working-on-frontend/` / `working-on-backend/` が正本

## CI とレビュー体制

⚠ **このフォークの `.github/workflows/` は upstream から大きく削られている。**
フォークに関係のない処理や冗長なテストを外し、**必要なものだけを残す**方針。
`packages/backend` / `packages/frontend` の **lint も test も CI では走らない**
（唯一の lint/test ジョブ `packages-private.yml` は `packages-private/` のみが対象）。

⚠⚠ **削るときは、残した側が参照しているファイルまで落ちていないか確かめる。**
2026-09-01 時点で **実際に走る workflow は `packages-private.yml` 1 本だけ**。
診断系 4 本（backend / frontend diagnostics の inspect / comment）は
`.github/misskey/test.yml` を `cp` するのにその設定ファイルがツリーに無く、
**`inspect` は毎回 failure・`comment` は毎回 skipped のまま放置されていた**ので削除した（#428）。
🔴 **「消し忘れた workflow」は緑にならないだけでなく、CI が動いているように見せて実態を隠す。**

⚠ **`.github/misskey/test.yml` 自体は upstream から戻した。**これは workflow ではなく
**backend テストの設定**で、`.config/test.yml` の元になる。⚠⚠ **無いと
`pnpm test` / `test:e2e` / `test:fed` が起動しない**（各スクリプトが内部で
`compile-config` を呼ぶ）。`.claude/skills/working-on-backend/` も
`.github/copilot-instructions.md` も**このファイルから `.config/test.yml` を作れと書いている**ので、
落ちたままだとローカル検証の手順ごと成立しない。
**冗長な CI は削るが、テストの前提ファイルは残す。**

🔴 **`check-misskey-js-autogen` は死んでいる。** `check-misskey-js-autogen.comment.yml` は
`workflow_run` で `Check Misskey JS autogen` という名前のワークフローの完了を待つが、
**その producer がツリーに存在しない**（`grep -rn '^name:' .github/workflows/*.yml` で確認できる）。
つまり [AGENTS.md](../AGENTS.md) のチェック項目「backend API 変更時は
`pnpm build-misskey-js-with-types` を実行して `packages/misskey-js/src/autogen/` の差分も
commit する」を、**CI は一切検査していない**。⚠ **手で守るしかない**（#423）。

🔴 **これは capsicum に波及する。** capsicum は
[docs/misskey-capsicum-api-watch.md](https://github.com/pooza/capsicum/blob/main/docs/misskey-capsicum-api-watch.md)
の手順で **`daisskey` の `packages/misskey-js/src/autogen/entities.ts` /
`endpoint.ts` を diff** して API 影響をトリアージしている。⚠⚠ **再生成を忘れると、
capsicum 側は古い契約を見て「変化なし」と判定する。**このフォークの autogen は
自分のためだけのものではない。

したがって**品質の担保はローカル検証とレビューに寄っている**。レビュアーは
**Codex**（`chatgpt-codex-connector[bot]`）と **CodeRabbit**（`.coderabbit.yaml`）。

## Codex のレビュー

運用は [pooza/ginseng-style の docs/workflow.md](https://github.com/pooza/ginseng-style/blob/main/docs/workflow.md)
「Codex のレビュー」節を踏襲する。**そちらが正本**で、ここには**このリポジトリ固有の事情**だけ書く。
⚠ Codex 名で書いてあるが、自動レビュー全般に効く。

### 採否を決める

⚠⚠ **妥当かどうかは毎回測るしかない。**指摘は遅れて届く。

| 判定 | やること | 再レビュー |
| --- | --- | --- |
| **P1・妥当** | 修正する | ⚠ **`@codex review` を投げる** |
| **P2・妥当** | 修正する | 不要 |
| **妥当でない** | 修正しない | 不要。⚠⚠ **👎 に反証の実測を添える** |
| **妥当だが当てられない / この PR では直さない**（P2 以下） | **Issue に切る**。⚠⚠ **返信に番号を書く** | 不要 |

⚠ P0 は P1 と同じ、P3 は P2 と同じ扱い。🔴 **P0 / P1 を「当てられない」に落とさない。**

⚠⚠ **Issue を立てずに返信して 👍 を付けない。**走査は返信と 👍 / 👎 しか見ないので、
**直っていないものが完了として消える**。

⚠ **このリポジトリでは Issue の起票にゲートがある** → [creating-issues-and-prs スキル](../.claude/skills/creating-issues-and-prs/SKILL.md)。
**原則として人間が起票する。**AI が勝手に立てない。立てられないうちは 👍 を付けずに残す。

### ⚠⚠ このフォーク固有の落とし穴 — Codex は upstream の慣習を当ててくる

🔴 **Codex は 1 リポジトリしか見ていない。**周辺リポジトリに正本がある事情を「無い」と読む。
このフォークでは次が実際に誤指摘として出た（2026-08-31 / PR #420）:

| 指摘 | なぜ成立しないか |
| --- | --- |
| 「`en-US.yml` を手編集するな。Crowdin が上書きする」 | Crowdin プロジェクトは **upstream 側**にあり、フォーク独自キー（`_tagset` 等）は配信対象外。足さないと英語 UI に日本語が出る |
| 「`CHANGELOG.md` に追記しろ」 | `## Unreleased` が存在せず、`CHANGELOG.md` は upstream 所有。フォーク独自機能のエントリは追従のたびに衝突する |

⚠⚠ **どちらも `AGENTS.md` を行番号付きで引用してきた。規約と実態が食い違っていると毎回同じ
指摘が出る**ので、**実態が正しいなら AGENTS.md 側を直す**（PR #420 で実施）。

⚠ **逆に、Codex がフォークの事情を知らないことは「指摘が外れている」根拠にはならない。**
上の 2 件は**実測して**成立しないと判断した。同じ PR の P2（深夜跨ぎでラベルが古くなる）は成立した。

### 🔴 「指摘なし」の測り方 — 出方が 3 通りある

| 結果 | どこに出るか |
| --- | --- |
| 指摘あり | `pulls/N/comments`（行紐づき） |
| 指摘なし | `issues/N/comments` に 1 本（`Didn't find any major issues.`）。⚠ **review は作られない** |
| 🔴 指摘なし | **PR 本体への 👍**（`issues/N/reactions`）。⚠⚠ review でもコメントでもない |

⚠ **`.reviews[]` だけを見ると「レビュー 0 件」に見える。**走査は 4 経路すべてを見る。
🔴 **👍 は「この PR に指摘が無かった」ではなく「ある巡が指摘なしで終わった」だけ。**

### 取り残さない

**返信と 👍 / 👎 の両方が揃って完了。**⚠⚠ **PR を出したセッションは、締める直前にもう一度走査する。**

⚠ **窓を件数で切らない**（`gh pr list --limit N` で回さない）。リポジトリ全体を `--paginate` で取る:

```sh
repo=pooza/misskey
# ⚠⚠ gh を単独で走らせ終了ステータスを見る。パイプで繋ぐとページング失敗を握り潰して偽のゼロになる。
# ⚠ 上書きは >| で（zsh の noclobber 対策）。
gh api --paginate "repos/$repo/pulls/comments?per_page=100" >| /tmp/codex-raw.json \
  || { echo '走査に失敗した。結果を信用しないこと' >&2; exit 1; }
jq -s add /tmp/codex-raw.json >| /tmp/codex.json
jq -r '. as $all | $all[] | . as $c
  | select(.user.login == "chatgpt-codex-connector[bot]")
  # ⚠⚠ GitHub は返信をスレッドの根に紐づける。$c.id で引くと入れ子が永久に残る。
  | (.in_reply_to_id // .id) as $root
  | select(([$all[] | select((.in_reply_to_id // .id) == $root)
                    | select(.user.login != "chatgpt-codex-connector[bot]")
                    | select(.created_at > $c.created_at)] | length) == 0
           or ((.reactions["+1"] // 0) + (.reactions["-1"] // 0)) == 0)
  | "PR#\(.pull_request_url | split("/") | last) id=\(.id) \(.path)"' /tmp/codex.json
```

⚠ **`reactions.total_count` を完了判定に使わない**（👀 が 1 つ付くだけで非ゼロになる）。

> 実測（2026-08-31・初回走査）: **未処理 9 件**。うち 4 件は **#401 / #406 の 2026-02〜03 のもので、
> merged PR に付いたまま 5〜6 か月放置**されていた。**この走査を回すまで誰も気づいていなかった。**
> 9 件は全件処理し、当てられない 2 件を #422 / #423 として起票した。

## 情報の記載先ルール

chubo2 の
[doc-maintenance.md](https://github.com/pooza/chubo2/blob/main/docs/doc-maintenance.md) に揃える。
**二重管理をしない**のが第一原則。

| 内容 | 置き場 |
| --- | --- |
| 未了の作業・課題 | GitHub Issue（`pooza/misskey`。インフラ面は `pooza/chubo2`） |
| エージェントの禁止事項・出荷前チェック・作業手順 | [AGENTS.md](../AGENTS.md) と `.claude/skills/` |
| フォーク開発の知見（追従・独自改変・モロヘイヤ連携） | **この docs/CLAUDE.md** |
| インフラの現況・手順・再発する罠 | [chubo2 docs/infra-misskey.md](https://github.com/pooza/chubo2/blob/main/docs/infra-misskey.md) |
| 日付のある出来事の記録 | [chubo2 docs/infra-history.md](https://github.com/pooza/chubo2/blob/main/docs/infra-history.md) |
| モロヘイヤの API 仕様・設計方針 | [mulukhiya-toot-proxy docs/](https://github.com/pooza/mulukhiya-toot-proxy/tree/main/docs) |
| セッションメモリ | 正本へのポインタと「なぜ非自明か」だけ。現況は書かない |

## 関連リポジトリ

- [pooza/mulukhiya-toot-proxy](https://github.com/pooza/mulukhiya-toot-proxy) — 併用プロキシ（モロヘイヤ）
- [pooza/mastodon](https://github.com/pooza/mastodon) — Mastodon フォーク（`bshockdon`）。姉妹実装
- [pooza/capsicum](https://github.com/pooza/capsicum) — Flutter クライアント。**このサーバーの推奨クライアント**。表示書式の先行実装。⚠ ダイスキー専用の分岐は作らない
- [pooza/chubo2](https://github.com/pooza/chubo2) — インフラ情報・レシピ（プライベート）
- [misskey-dev/misskey](https://github.com/misskey-dev/misskey) — upstream

## gh CLI 使用時の注意

- フォークなので `gh` が upstream（misskey-dev/misskey）を参照することがある。
  **`-R pooza/misskey` を明示**する。PR の base も対象ブランチを明示する
- ⚠ **Projects classic 廃止の影響で `gh pr edit` / `gh issue view` が GraphQL エラーで落ちる。**
  `gh pr edit` は**エラーを出したまま本文を更新しない**（黙って失敗する）ので気づきにくい。
  代替:
  - 読み取り: `gh issue view <n> --json number,title,body,...`
  - 本文更新: `gh api -X PATCH repos/pooza/misskey/pulls/<n> -F "body=@<file>"`
  - 更新後は `gh api repos/pooza/misskey/pulls/<n> --jq .body` で反映を確認する
