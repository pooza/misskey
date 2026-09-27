#!/usr/bin/env bash
# フォークが upstream から乖離しているファイルの集合を、追従の前後で比べる。
# 前: <前タグ> と <前のベース> の差分 / 後: <新タグ> と <マージ後> の差分。
# パスの集合に加え、両方にあるファイルはフォークの改変行（-U0 の +/- 行）も比べる。
# ⚠ 一致しても「安全」の証明ではない（改変箇所の周辺で upstream の意味が変わることはある）。差が出たものを説明できることが目的。
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

status=0
if [ -n "$lost" ]; then
	echo "== 前にはあって後に無い（フォーク改変の消失疑い / 衝突解決で upstream 版を採った）=="
	printf '%s\n' "$lost"
	status=1
fi
if [ -n "$extra" ]; then
	echo "== 後にだけある（upstream 変更の取りこぼし疑い / 解決で新たに乖離した）=="
	printf '%s\n' "$extra"
	status=1
fi

# ⚠ パスの集合だけでは、1 ファイル内の改変の一部が消えても気づけない。
# 両方にあるファイルについて、フォークの改変行（-U0 の +/- 行）が前後で同じかを比べる。
# 差が出たファイルは、upstream がフォークの改変箇所に手を入れたか、解決で改変が欠けた。中身を見て説明できること。
hunks() { git diff -U0 "$1" "$2" -- "$3" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' || true; }
changed=""
removed=""
while IFS= read -r f; do
	[ -z "$f" ] && continue
	# フォークが前から削除していたファイル（削除を維持した workflow など）は、upstream が中身を変えるたびに差が出るだけなので見ない。
	# 🔴 前にはあって後に無いものは、衝突の解決で消した疑いなので必ず出す
	if ! git cat-file -e "$AFTER:$f" 2>/dev/null; then
		git cat-file -e "$BEFORE:$f" 2>/dev/null && removed+="$f"$'\n'
		continue
	fi
	if ! diff -q <(hunks "$PREV" "$BEFORE" "$f") <(hunks "$NEW" "$AFTER" "$f") >/dev/null; then
		changed+="$f"$'\n'
	fi
done < <(comm -12 <(printf '%s\n' "$before") <(printf '%s\n' "$after"))

if [ -n "$removed" ]; then
	echo "== 🔴 前にはあって後に無い（衝突の解決でフォーク改変ごと消した疑い）=="
	printf '%s' "$removed"
	status=1
fi

if [ -n "$changed" ]; then
	echo "== 改変行が前後で変わった（中身を確認する: diff <(git diff -U0 $PREV $BEFORE -- <file>) <(git diff -U0 $NEW $AFTER -- <file>)）=="
	printf '%s' "$changed"
	status=1
fi

if [ "$status" = 0 ]; then
	echo "OK: パスの集合も、各ファイルの改変行も一致"
fi
exit "$status"
