/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#344 / #468): プロキシアカウントによるフォローをフォローの入口で止める

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { UserBlockingService } from '@/core/UserBlockingService.js';

describe('プロキシアカウントのフォロー', () => {
	let service: UserFollowingService;
	const users = mockDeep<UsersRepository>();
	const followings = mockDeep<FollowingsRepository>();
	const userEntity = mockDeep<UserEntityService>();
	const systemAccount = mockDeep<SystemAccountService>();
	const blocking = mockDeep<UserBlockingService>();

	const proxy = { id: 'proxy', host: null } as MiLocalUser;
	const localUser = { id: 'local', host: null } as MiLocalUser;
	const remoteUser = { id: 'remote', host: 'remote.example' } as MiRemoteUser;

	beforeEach(async () => {
		mockReset(users);
		mockReset(followings);
		mockReset(userEntity);
		mockReset(systemAccount);
		mockReset(blocking);
		const module = await Test.createTestingModule({
			providers: [
				UserFollowingService,
				{ provide: DI.usersRepository, useValue: users },
				{ provide: DI.followingsRepository, useValue: followings as unknown }, // TS2590 回避 (UserFollowingService.ts と同じ)
				{ provide: UserEntityService, useValue: userEntity },
				{ provide: SystemAccountService, useValue: systemAccount },
				{ provide: 'UserBlockingService', useValue: blocking },
			],
		}).useMocker(() => mockDeep()).compile();
		service = module.get(UserFollowingService);
		service.onModuleInit();
		systemAccount.fetch.mockResolvedValue(proxy);
		userEntity.isLocalUser.mockImplementation(((user: { host: string | null }) => user.host == null) as never);
		userEntity.isRemoteUser.mockImplementation(((user: { host: string | null }) => user.host != null) as never);
	});

	test('プロキシアカウントはリモートユーザーをフォローしない', async () => {
		users.findOneByOrFail.mockResolvedValueOnce(proxy as never).mockResolvedValueOnce(remoteUser as never);

		await service.follow(proxy, remoteUser);

		expect(systemAccount.fetch).toHaveBeenCalledWith('proxy');
		expect(blocking.checkBlocked).not.toHaveBeenCalled();
		expect(followings.insert).not.toHaveBeenCalled();
	});

	test('プロキシアカウント以外のフォローは止めない', async () => {
		users.findOneByOrFail.mockResolvedValueOnce(localUser as never).mockResolvedValueOnce(remoteUser as never);
		blocking.checkBlocked.mockRejectedValue(new Error('reached'));

		await expect(service.follow(localUser, remoteUser)).rejects.toThrow('reached');
	});
});
