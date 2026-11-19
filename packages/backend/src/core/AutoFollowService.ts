/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#467)
// サーバーが指定したアカウント (お知らせボット) を、登録した利用者に自動でフォローさせる。
// あわせて、ローカルの利用者がそのアカウントへのフォローを外すこと・ブロックすることを拒む。
// 上流で misskey-dev/misskey#12451 が実装されたら、こちらを捨てて上流の設定へ移す。

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiMeta, UsersRepository } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import * as Acct from '@/misc/acct.js';
import { UtilityService } from '@/core/UtilityService.js';
import { QueueService } from '@/core/QueueService.js';
import { bindThis } from '@/decorators.js';

export const AUTO_FOLLOW_ERRORS = {
	cannotUnfollow: '46489fd9-2721-4761-85ec-3a8d0cba7e4a',
	cannotBlock: 'bf63f6db-e3b1-40fa-85d9-561b3bcff644',
} as const;

@Injectable()
export class AutoFollowService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private utilityService: UtilityService,
		private queueService: QueueService,
	) {
	}

	/**
	 * 設定 (acct の並び) を、このサーバーのアカウントへ解決する。リモートの acct は無視する
	 */
	@bindThis
	public async fetchUsers(): Promise<MiLocalUser[]> {
		const usernames = this.meta.autoFollowUsers
			.map(acct => acct.trim())
			.filter(acct => acct !== '')
			.map(acct => Acct.parse(acct))
			.filter(acct => acct.username !== '' && this.utilityService.isSelfHost(acct.host))
			.map(acct => acct.username.toLowerCase());
		if (usernames.length === 0) return [];

		return await this.usersRepository.findBy({
			usernameLower: In(usernames),
			host: IsNull(),
			isDeleted: false,
		}) as MiLocalUser[];
	}

	/**
	 * follower が followee へのフォローを外せない (ブロックもできない) 組み合わせか
	 *
	 * ローカルの利用者だけを縛る。リモートからの Undo Follow などは対象外
	 */
	@bindThis
	public async isProtected(
		follower: { id: MiUser['id']; host: MiUser['host'] },
		followee: { id: MiUser['id'] },
	): Promise<boolean> {
		if (follower.host != null) return false;
		if (follower.id === followee.id) return false;
		if (this.meta.autoFollowUsers.length === 0) return false;
		const users = await this.fetchUsers();
		return users.some(user => user.id === followee.id);
	}

	/**
	 * 登録した利用者に、指定したアカウントをフォローさせる
	 */
	@bindThis
	public async followOnSignup(user: { id: MiUser['id'] }): Promise<void> {
		const followees = (await this.fetchUsers()).filter(followee => followee.id !== user.id);
		if (followees.length === 0) return;

		await this.queueService.createFollowJob(followees.map(followee => ({
			from: { id: user.id },
			to: { id: followee.id },
		})));
	}

	/**
	 * 既存のローカルの利用者のうち、指定したアカウントをフォローしていない者にフォローさせる
	 *
	 * 管理者が一度だけ実行する操作。設定の保存だけでは走らせない
	 *
	 * @returns フォローのジョブを積んだ件数
	 */
	@bindThis
	public async applyToExistingUsers(): Promise<number> {
		const followees = await this.fetchUsers();
		let count = 0;

		for (const followee of followees) {
			const followers = await this.usersRepository.createQueryBuilder('user')
				.select('user.id')
				.where('user.host IS NULL')
				.andWhere('user.isDeleted = FALSE')
				.andWhere('user.isSuspended = FALSE')
				.andWhere('user.id != :followeeId', { followeeId: followee.id })
				.andWhere('NOT EXISTS (SELECT 1 FROM "system_account" sa WHERE sa."userId" = "user"."id")')
				.andWhere('NOT EXISTS (SELECT 1 FROM "following" f WHERE f."followerId" = "user"."id" AND f."followeeId" = :followeeId)', { followeeId: followee.id })
				.getMany();

			for (let i = 0; i < followers.length; i += 1000) {
				await this.queueService.createFollowJob(followers.slice(i, i + 1000).map(follower => ({
					from: { id: follower.id },
					to: { id: followee.id },
				})));
			}
			count += followers.length;
		}

		return count;
	}
}
