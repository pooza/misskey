/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// フォーク独自 (pooza/misskey#467): 登録時に自動でフォローさせ、解除に応じないアカウント
export class AutoFollowUsers1795088616475 {
    name = 'AutoFollowUsers1795088616475';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "autoFollowUsers" character varying(1024) array NOT NULL DEFAULT '{}'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "autoFollowUsers"`);
    }
}
