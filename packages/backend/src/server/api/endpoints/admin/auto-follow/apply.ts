/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#467)
// 既存のローカルの利用者のうち、自動フォローの指定アカウントをフォローしていない者にフォローさせる。
// 設定の保存だけでは走らせず、管理者がこの操作を明示的に実行する。

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AutoFollowService } from '@/core/AutoFollowService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',

	// 続けて押すと、まだ処理されていないフォローのジョブが二重に積まれるので間隔を空けさせる
	limit: {
		duration: ms('1min'),
		max: 1,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			count: {
				type: 'integer',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private autoFollowService: AutoFollowService,
	) {
		super(meta, paramDef, async () => {
			const count = await this.autoFollowService.applyToExistingUsers();
			return { count };
		});
	}
}
