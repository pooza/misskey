#!/usr/bin/env bash
# upstream のタグを daisskey へマージしたときの衝突を、作業ツリーに触らずに洗い出す。
# 使い方: precheck.sh <新タグ> [<ベース>]   例: precheck.sh 2026.10.0
set -euo pipefail

NEW="${1:?usage: precheck.sh <new-tag> [<base>]}"
BASE="${2:-origin/daisskey}"

git fetch -q origin
git fetch -q upstream --tags
git rev-parse -q --verify "refs/tags/$NEW" >/dev/null || { echo "tag not found: $NEW" >&2; exit 2; }

PREV=$(git describe --tags --abbrev=0 --match '20[0-9][0-9].*' "$BASE")
echo "base:      $BASE ($(git rev-parse --short "$BASE"))"
echo "prev tag:  $PREV"
echo "new tag:   $NEW"
echo "commits:   $(git rev-list --count "$PREV..$NEW")"
echo

echo "== migration (packages/backend/migration) =="
MIG=$(git diff --name-status "$PREV" "$NEW" -- packages/backend/migration)
if [ -z "$MIG" ]; then
	echo "(変更なし)"
else
	echo "-- 新規"
	printf '%s\n' "$MIG" | awk '$1 == "A" { print $2 }'
	# 🔴 既存の migration の変更・削除・リネームは、適用済みの DB では再実行されず新規インストールと食い違う
	CHANGED=$(printf '%s\n' "$MIG" | awk '$1 != "A"')
	if [ -n "$CHANGED" ]; then
		echo "-- 🔴 既存の migration の変更・削除・リネーム（本番 DB と新規インストールが食い違いうる。取り込む前にユーザーに報告する）"
		printf '%s\n' "$CHANGED"
	fi
fi
echo

echo "== 衝突 =="
# merge-tree は衝突があると exit 1 を返すので、ここだけ -e を外す
set +e
OUT=$(git merge-tree --write-tree --name-only "$BASE" "$NEW")
set -e
CONFLICTS=$(printf '%s\n' "$OUT" | grep '^CONFLICT' || true)
if [ -z "$CONFLICTS" ]; then
	echo "(なし)"
	exit 0
fi
echo "-- modify/delete（フォークが削除済みのものを upstream が更新。原則として削除を維持）"
printf '%s\n' "$CONFLICTS" | grep 'modify/delete' | sed -E 's/^CONFLICT \(modify\/delete\): ([^ ]+) deleted in.*/\1/' || true
echo "-- それ以外（中身を見て解決する）"
printf '%s\n' "$CONFLICTS" | grep -v 'modify/delete' || true
