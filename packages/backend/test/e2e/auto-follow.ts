/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#467): 指定したアカウントの自動フォローと、解除・ブロックの拒否

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { afterAll, describe, beforeAll, test, vi } from 'vitest';
import { jobQueue } from '@/boot/common.js';
import { api, castAsError, signup } from '../utils.js';
import type { INestApplicationContext } from '@nestjs/common';
import type * as misskey from 'misskey-js';

const waitOptions = { timeout: 10000, interval: 100 };

describe('自動フォロー (#467)', () => {
	let root: misskey.entities.SignupResponse;
	let info: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let jq: INestApplicationContext;

	async function isFollowing(follower: misskey.entities.SignupResponse, followee: misskey.entities.SignupResponse): Promise<boolean> {
		const res = await api('users/relation', { userId: followee.id }, follower);
		assert.strictEqual(res.status, 200);
		// userId が 1 件でも配列で返る
		return (res.body as { isFollowing: boolean }[])[0].isFollowing;
	}

	beforeAll(async () => {
		// 自動フォローはフォローのジョブを積むので、キューを動かす
		jq = await jobQueue();

		root = await signup({ username: 'root' });
		info = await signup({ username: 'infobot' });
		// 設定を入れる前からいる利用者
		alice = await signup({ username: 'alice' });

		const res = await api('admin/update-meta', { autoFollowUsers: ['@infobot', '', '@nobody', '@someone@remote.example.com'] }, root);
		assert.strictEqual(res.status, 204);

		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await jq.close();
	});

	test('設定は空行を除いて保存される', async () => {
		const res = await api('admin/meta', {}, root);
		assert.strictEqual(res.status, 200);
		assert.deepStrictEqual(res.body.autoFollowUsers, ['@infobot', '@nobody', '@someone@remote.example.com']);
	});

	test('登録した利用者は指定したアカウントを自動でフォローする', async () => {
		await vi.waitFor(async () => {
			assert.ok(await isFollowing(bob, info));
		}, waitOptions);
	});

	test('設定の前からいる利用者は自動ではフォローしない', async () => {
		assert.strictEqual(await isFollowing(alice, info), false);
	});

	test('指定したアカウントのフォローは解除できない', async () => {
		const res = await api('following/delete', { userId: info.id }, bob);
		assert.strictEqual(res.status, 403);
		assert.strictEqual(castAsError(res.body).error.code, 'CANNOT_UNFOLLOW_AUTO_FOLLOW_USER');
		assert.ok(await isFollowing(bob, info));
	});

	test('指定したアカウントはブロックできない', async () => {
		const res = await api('blocking/create', { userId: info.id }, bob);
		assert.strictEqual(res.status, 403);
		assert.strictEqual(castAsError(res.body).error.code, 'CANNOT_BLOCK_AUTO_FOLLOW_USER');
		assert.ok(await isFollowing(bob, info));
	});

	test('指定していないアカウントは従来どおり解除できる', async () => {
		const follow = await api('following/create', { userId: alice.id }, bob);
		assert.strictEqual(follow.status, 200);
		const res = await api('following/delete', { userId: alice.id }, bob);
		assert.strictEqual(res.status, 200);
	});

	test('一括適用で、既存の利用者にもフォローさせる', async () => {
		const res = await api('admin/auto-follow/apply', {}, root);
		assert.strictEqual(res.status, 200);
		// root と alice。bob・carol は登録時にフォロー済み、info 自身は除く
		assert.strictEqual(res.body.count, 2);

		await vi.waitFor(async () => {
			assert.ok(await isFollowing(alice, info));
			assert.ok(await isFollowing(root, info));
		}, waitOptions);
	});

	test('一括適用は管理者だけが実行できる', async () => {
		const res = await api('admin/auto-follow/apply', {}, alice);
		assert.notStrictEqual(res.status, 200);
	});

	test('指定したアカウント自身はフォロワーを外せる', async () => {
		await vi.waitFor(async () => {
			assert.ok(await isFollowing(carol, info));
		}, waitOptions);

		const res = await api('following/invalidate', { userId: carol.id }, info);
		assert.strictEqual(res.status, 200);
		assert.strictEqual(await isFollowing(carol, info), false);
	});

	test('指定したアカウント自身は利用者をブロックでき、フォローも外れる', async () => {
		const res = await api('blocking/create', { userId: alice.id }, info);
		assert.strictEqual(res.status, 200);
		assert.strictEqual(await isFollowing(alice, info), false);
	});

	test('設定から外すと解除できる', async () => {
		const update = await api('admin/update-meta', { autoFollowUsers: [] }, root);
		assert.strictEqual(update.status, 204);

		await vi.waitFor(async () => {
			const res = await api('following/delete', { userId: info.id }, bob);
			assert.strictEqual(res.status, 200);
		}, waitOptions);
	});
});
