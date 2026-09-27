#!/usr/bin/env bash
# フォークが upstream から乖離しているファイルの集合を、追従の前後で比べる。
# 前: <前タグ> と <前のベース> の差分 / 後: <新タグ> と <マージ後> の差分。
# 一致していれば、upstream の変更を取りこぼさず、フォーク改変も消えていない。
# 使い方: divergence.sh <前タグ> <新タグ> [<前のベース> [<マージ後>]]
set -euo pipefail

PREV="${1:?usage: divergence.sh <prev-tag> <new-tag> [<before> [<after>]]}"
NEW="${2:?usage: divergence.sh <prev-tag> <new-tag> [<before> [<after>]]}"
BEFORE="${3:-origin/daisskey}"
AFTER="${4:-HEAD}"

before=$(git diff --name-only "$PREV" "$BEFORE" | sort)
after=$(git diff --name-only "$NEW" "$AFTER" | sort)

echo "before: $PREV..$BEFORE  $(printf '%s\n' "$before" | grep -c .) files"
echo "after:  $NEW..$AFTER  $(printf '%s\n' "$after" | grep -c .) files"

lost=$(comm -23 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))
extra=$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))

if [ -z "$lost" ] && [ -z "$extra" ]; then
	echo "OK: 集合が一致"
	exit 0
fi
if [ -n "$lost" ]; then
	echo "== 前にはあって後に無い（フォーク改変の消失疑い / 衝突解決で upstream 版を採った）=="
	printf '%s\n' "$lost"
fi
if [ -n "$extra" ]; then
	echo "== 後にだけある（upstream 変更の取りこぼし疑い / 解決で新たに乖離した）=="
	printf '%s\n' "$extra"
fi
exit 1
