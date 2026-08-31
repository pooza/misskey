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
`packages/backend` / `packages/frontend` の **lint も test も CI では走らない**
（唯一の lint/test ジョブ `packages-private.yml` は `packages-private/` のみが対象）。
残っているのは診断系（backend/frontend diagnostics、misskey-js autogen チェック）。

したがって**品質の担保はローカル検証とレビューに寄っている**:

- **Codex**（`chatgpt-codex-connector` bot）が PR に自動レビューを付ける。
  `@codex review` で再レビューを依頼できる。P1 は修正して再レビュー、P2 は修正のみ
- **CodeRabbit**（`.coderabbit.yaml`）
- ⚠ Codex は `AGENTS.md` を行番号付きで引用してくる。**規約と実態が食い違っていると
  毎回同じ指摘が出る**ので、実態が正しいなら AGENTS.md 側を直す

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
- [pooza/capsicum](https://github.com/pooza/capsicum) — Flutter クライアント。表示書式の先行実装
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
