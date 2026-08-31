/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseProgramNextOn, parseProgramStartTime, programScheduleLabel } from '@/utility/program-schedule.js';

// #419: 実況タグセットの選択肢に出す放送日時ラベル。
//
// 期待値は capsicum の `program_schedule_display_test.dart` および Mastodon フォークの
// `program_schedule.test.ts` と揃えてある。3 クライアントで書式が割れると番組表を
// 見比べるときに困るので、ここだけ変えないこと。
const labels = { todayLabel: '今日', tomorrowLabel: '明日' };

describe('programScheduleLabel', () => {
	// 2026-08-09 (日) 12:00 を「今」として固定する。
	const now = new Date(2026, 7, 9, 12);

	test('当日は「今日」', () => {
		expect(programScheduleLabel({ nextOn: '2026-08-09', startTime: '08:30', now, ...labels })).toBe('今日 08:30');
	});

	test('翌日は「明日」', () => {
		expect(programScheduleLabel({ nextOn: '2026-08-10', startTime: '20:00', now, ...labels })).toBe('明日 20:00');
	});

	test('2 日以降は M/d', () => {
		expect(programScheduleLabel({ nextOn: '2026-08-12', startTime: '19:30', now, ...labels })).toBe('8/12 19:30');
	});

	test('年をまたいでも M/d のまま（番組表は先の予定を持たない）', () => {
		expect(programScheduleLabel({ nextOn: '2027-01-03', startTime: '08:30', now, ...labels })).toBe('1/3 08:30');
	});

	test('過去日も M/d で出す（更新されていない枠を隠さない）', () => {
		expect(programScheduleLabel({ nextOn: '2026-08-02', startTime: '08:30', now, ...labels })).toBe('8/2 08:30');
	});

	test('next_on が無い枠は日付を出さない', () => {
		// 「毎日」とは書かない。放送日を持たないことと毎日放送であることは違う。
		expect(programScheduleLabel({ now, ...labels })).toBe('');
		expect(programScheduleLabel({ startTime: '22:00', now, ...labels })).toBe('22:00');
	});

	test('日付が無いとき先頭に空白が残らない', () => {
		const label = programScheduleLabel({ startTime: '22:00', now, ...labels });

		expect(label).toBe(label.trim());
	});

	test('start_time だけ落ちても日付は出す', () => {
		expect(programScheduleLabel({ nextOn: '2026-08-09', now, ...labels })).toBe('今日');
	});

	test('「今日」の判定はローカル日付で行う（時刻の遠近に引きずられない）', () => {
		// 当日の 23:59 でも「今日」、翌日の 00:01 は「明日」。UTC 換算で判定すると
		// ここが 1 日ズレる。
		expect(programScheduleLabel({
			nextOn: '2026-08-09',
			startTime: '23:59',
			now: new Date(2026, 7, 9, 0, 1),
			...labels,
		})).toBe('今日 23:59');
		expect(programScheduleLabel({
			nextOn: '2026-08-10',
			startTime: '00:01',
			now: new Date(2026, 7, 9, 23, 59),
			...labels,
		})).toBe('明日 00:01');
	});

	test('パースできない値は日時を出さずに落とす', () => {
		expect(programScheduleLabel({ nextOn: '2026/08/09', startTime: '08:30', now, ...labels })).toBe('08:30');
		expect(programScheduleLabel({ nextOn: '2026-08-09', startTime: '25:00', now, ...labels })).toBe('今日');
	});
});

describe('parseProgramNextOn', () => {
	test('YYYY-MM-DD をローカル日付として読む', () => {
		const date = parseProgramNextOn('2026-08-09');

		expect(date?.getFullYear()).toBe(2026);
		expect(date?.getMonth()).toBe(7);
		expect(date?.getDate()).toBe(9);
	});

	test('実在しない日をロールオーバーさせない', () => {
		// `new Date(2026, 1, 31)` は 3/3 になる。素通しすると番組表に無い日付が出る。
		expect(parseProgramNextOn('2026-02-31')).toBeNull();
	});

	test('書式違い・未設定は null', () => {
		expect(parseProgramNextOn('2026-8-9')).toBeNull();
		expect(parseProgramNextOn('2026-08-09T00:00:00Z')).toBeNull();
		expect(parseProgramNextOn('')).toBeNull();
		expect(parseProgramNextOn(undefined)).toBeNull();
	});
});

describe('parseProgramStartTime', () => {
	test('ゼロ埋めされていない時刻を HH:MM へ正規化する', () => {
		expect(parseProgramStartTime('9:00')).toBe('09:00');
		expect(parseProgramStartTime('22:00')).toBe('22:00');
	});

	test('24 時間制の範囲外・書式違いは null', () => {
		expect(parseProgramStartTime('24:00')).toBeNull();
		expect(parseProgramStartTime('12:60')).toBeNull();
		expect(parseProgramStartTime('1230')).toBeNull();
		expect(parseProgramStartTime(undefined)).toBeNull();
	});
});
