/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#467)
// サーバーが指定したアカウント (お知らせボット) を、登録した利用者に自動でフォローさせる。
// あわせて、ローカルの利用者がそのアカウントへのフォローを外すこと・ブロックすることを拒む。
// 上流で misskey-dev/misskey#12451 が実装されたら、こちらを捨てて上流の設定へ移す。

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { In, IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { BlockingsRepository, MiMeta, UsersRepository } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import * as Acct from '@/misc/acct.js';
import { UtilityService } from '@/core/UtilityService.js';
import { QueueService } from '@/core/QueueService.js';
import { bindThis } from '@/decorators.js';
import type { UserBlockingService } from '@/core/UserBlockingService.js';
import Logger from '@/logger.js';

const logger = new Logger('auto-follow');

export const AUTO_FOLLOW_ERRORS = {
	cannotUnfollow: '46489fd9-2721-4761-85ec-3a8d0cba7e4a',
	cannotBlock: 'bf63f6db-e3b1-40fa-85d9-561b3bcff644',
} as const;

@Injectable()
export class AutoFollowService implements OnModuleInit {
	private userBlockingService: UserBlockingService;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		private utilityService: UtilityService,
		private queueService: QueueService,
	) {
	}

	onModuleInit() {
		// UserBlockingService はこのサービスに依存するので、循環を避けて遅延で取る
		this.userBlockingService = this.moduleRef.get('UserBlockingService');
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
	 *
	 * 登録はこの時点で済んでいるので、失敗してもログに残すだけで投げない
	 * (投げると、メール認証の後始末やサインインが飛ぶ)。漏れた分は一括適用で拾える
	 */
	@bindThis
	public async followOnSignup(user: { id: MiUser['id'] }): Promise<void> {
		try {
			const followees = (await this.fetchUsers()).filter(followee => followee.id !== user.id);
			if (followees.length === 0) return;

			await this.queueService.createFollowJob(followees.map(followee => ({
				from: { id: user.id },
				to: { id: followee.id },
			})));
		} catch (err) {
			logger.error(`Failed to schedule auto-follow for ${user.id}`, { error: err });
		}
	}

	/**
	 * 既存のローカルの利用者のうち、指定したアカウントをフォローしていない者にフォローさせる
	 *
	 * 管理者が一度だけ実行する操作。設定の保存だけでは走らせない
	 *
	 * 利用者が指定したアカウントをブロックしているとフォローできないので、そのブロックは外す。
	 * 指定したアカウント側からのブロックは管理者の判断なので残し、その利用者は対象から外す
	 *
	 * @returns フォローのジョブを積んだ件数
	 */
	@bindThis
	public async applyToExistingUsers(): Promise<number> {
		const followees = await this.fetchUsers();
		let count = 0;

		for (const followee of followees) {
			const blockings = await this.blockingsRepository.find({
				where: { blockeeId: followee.id },
				relations: { blocker: true },
			});
			for (const blocking of blockings) {
				if (blocking.blocker == null || blocking.blocker.host != null) continue;
				await this.userBlockingService.unblock(blocking.blocker, followee);
			}

			const followers = await this.usersRepository.createQueryBuilder('user')
				.select('user.id')
				.where('user.host IS NULL')
				.andWhere('user.isDeleted = FALSE')
				.andWhere('user.isSuspended = FALSE')
				.andWhere('user.id != :followeeId', { followeeId: followee.id })
				.andWhere('NOT EXISTS (SELECT 1 FROM "system_account" sa WHERE sa."userId" = "user"."id")')
				.andWhere('NOT EXISTS (SELECT 1 FROM "blocking" b WHERE b."blockerId" = :followeeId AND b."blockeeId" = "user"."id")', { followeeId: followee.id })
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
