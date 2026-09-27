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

1. chubo2 の手元のクローンを最新にしてから、正本を**全文**読む:

   ```bash
   git -C ~/repos/chubo2 pull -q --ff-only
   cat ~/repos/chubo2/.claude/skills/misskey-deploy/SKILL.md
   ```

   手元にクローンが無ければ `gh api repos/pooza/chubo2/contents/.claude/skills/misskey-deploy/SKILL.md --jq .content | base64 -d` で読む
2. 読んだ手順にそのまま従う。⚠ 記憶や前回の手順で代用しない（正本は更新される）
3. 🔴 **本番の前に、ステージングの結果を報告してユーザーの了承を取る**（正本にも書いてある）
4. 手順で新しく踏んだものは、**chubo2 側の正本**に書き足す（このファイルには書かない）
