---
name: misskey-deploy
description: ダイスキー（daisskey）をステージング → 本番へビルド・デプロイする。手順の正本は private の pooza/chubo2 にあり、この skill はそれを読み込む入口だけ。
disable-model-invocation: true
---

# Misskey 本体のビルド・デプロイ（入口）

🔴 **手順はここに書かない。**正本は pooza/chubo2 の `.claude/skills/misskey-deploy/SKILL.md`。
このリポジトリは公開なので、ホスト名・ユーザー・パスなどのインフラ情報を持ち込まない（#451）。

project の skill は起動したリポジトリでしか読み込まれないため、misskey のセッションから呼べるようにこの入口を置いている。

## 手順

1. 正本を **chubo2 の `origin/main` から**全文読む:

   ```bash
   git -C ~/repos/chubo2 fetch -q origin
   git -C ~/repos/chubo2 show origin/main:.claude/skills/misskey-deploy/SKILL.md
   ```

   - 🔴 **作業ツリーから `cat` しない。**手元のクローンが別ブランチだったり未コミットの編集があったりすると、正本ではない手順を読む
   - 手元にクローンが無ければ `gh api 'repos/pooza/chubo2/contents/.claude/skills/misskey-deploy/SKILL.md?ref=main' --jq .content | base64 -d`
2. 読んだ手順にそのまま従う。⚠ 記憶や前回の手順で代用しない（正本は更新される）
3. 🔴 **本番の前に、ステージングの結果を報告してユーザーの了承を取る**（正本にも書いてある）
4. 手順で新しく踏んだものは、**chubo2 側の正本**に書き足す（このファイルには書かない）
