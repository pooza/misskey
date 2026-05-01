/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DriveFileUserRootIdDescIndex1777624793874 {
    name = 'DriveFileUserRootIdDescIndex1777624793874'

    async up(queryRunner) {
        // PG プランナーが /api/drive/files の root クエリで PK 降順 backward scan を選び、
        // ヘビーユーザーが root 直下のファイルをフォルダに移動して疎にすると statement_timeout
        // (10s) でクエリが落ちる問題への対処。partial index で root クエリを直接拾わせる。
        // 本番 (daisskey) には先に SQL 直適用済みのため IF NOT EXISTS で衝突回避。
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_drive_file_user_root_id_desc" ON "drive_file" ("userId", "id" DESC) WHERE "folderId" IS NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_drive_file_user_root_id_desc"`);
    }
}
