/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// モロヘイヤ（mulukhiya-toot-proxy）の番組表エントリが持つ放送日時を、実況
// タグセットの選択肢ラベルに出す 1 つの文字列へ畳む（#419）。
//
// 表示の書式は capsicum（`program_schedule_display.dart`）に合わせてある。
// 3 クライアント（capsicum / ここ / Mastodon フォークの
// `features/compose/util/program_schedule.ts`）で書式が割れると番組表を見比べる
// ときに困るため、片方だけ変えないこと。3 者のテストは同じケースを共有している。

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * `next_on`（次回放送日, `YYYY-MM-DD`）をローカル日付としてパースする。
 *
 * `new Date('2026-08-09')` は UTC 深夜として解釈されるので使わない。時差が入ると
 * 「今日」が 1 日ズレる。書式も厳密に見る。素通しすると実在しない日
 * （`2026-02-31`）が「それらしい別の日」として表示されてしまう。
 * `/mulukhiya/api/program` は `var/program.yaml` の値をそのまま載せるので、手編集
 * や外部データソース由来の不正値がここまで届く。
 */
export function parseProgramNextOn(value?: string | null): Date | null {
	const matched = DATE_PATTERN.exec(value ?? '');
	if (matched == null) return null;

	const year = Number(matched[1]);
	const month = Number(matched[2]);
	const day = Number(matched[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

	return date;
}

/**
 * `start_time`（放送開始時刻）をパースし `HH:MM` に正規化する。モロヘイヤは保存時に
 * ゼロ埋めするが、古いエントリや手編集では `9:00` のまま残りうる。
 */
export function parseProgramStartTime(value?: string | null): string | null {
	const matched = TIME_PATTERN.exec(value ?? '');
	if (matched == null) return null;

	const hour = Number(matched[1]);
	if (hour > 23 || Number(matched[2]) > 59) return null;

	return `${String(hour).padStart(2, '0')}:${matched[2]}`;
}

/**
 * タグセットを選ぶのは実況の直前なので、当日・翌日だけ「今日」「明日」へ置き換え、
 * それ以遠は `M/d` にする。判定はローカル日付で行う。
 *
 * ⚠ `next_on` を持たない枠は日付を出さない。「毎日」とは書かないこと（2026-08-16
 * 判断。放送日を持たないことと毎日放送であることは違う）。日付が無く時刻だけある枠は
 * 時刻のみ（`22:00`）、どちらも無ければ空文字を返す。呼び出し側は空文字なら要素ごと
 * 落とすこと。
 *
 * 「今日」「明日」の文言は i18n から呼び出し側が渡す。ここで `i18n` を参照しないのは、
 * capsicum と同じ日本語の期待値でテストするため。
 */
export function programScheduleLabel(opts: {
	nextOn?: string | null;
	startTime?: string | null;
	now: Date;
	todayLabel: string;
	tomorrowLabel: string;
}): string {
	const nextOn = parseProgramNextOn(opts.nextOn);
	const startTime = parseProgramStartTime(opts.startTime);

	let datePart = '';
	if (nextOn != null) {
		const today = new Date(opts.now.getFullYear(), opts.now.getMonth(), opts.now.getDate());
		const days = Math.round((nextOn.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
		if (days === 0) datePart = opts.todayLabel;
		else if (days === 1) datePart = opts.tomorrowLabel;
		else datePart = `${nextOn.getMonth() + 1}/${nextOn.getDate()}`;
	}

	if (startTime == null) return datePart;
	if (datePart === '') return startTime;

	return `${datePart} ${startTime}`;
}

/**
 * 2 つの時刻が同じローカル日付かどうか。
 *
 * ウィジェットが選択肢を組み立てたあと日付を跨いだかの判定に使う。UTC 換算で比べると
 * 時差が入って境界がズレるので、ローカルの年月日で比べる。
 *
 * ⚠ これは Misskey 側だけに必要な関数。capsicum と Mastodon フォークは選択肢を都度
 * 組み立て直すので持っていない。上の 3 者で揃える書式の話とは無関係なので、
 * 「向こうに無い」を理由に消さないこと。
 */
export function isSameLocalDate(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear()
		&& a.getMonth() === b.getMonth()
		&& a.getDate() === b.getDate();
}
