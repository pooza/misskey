/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// デフォルトタグ運用での「ローカル」の定義 (#448)。ローカル TL とソーシャル TL のフォロー以外の部分で使う
// - デフォルトタグを持つ投稿
// - ローカルの純粋なリノートで、リノート先がデフォルトタグを持つもの (本文を持たないのでタグを持てない)
// 公開範囲・チャンネルの判定は呼び出し側で行う

import { Brackets } from 'typeorm';
import type { MiNote } from '@/models/Note.js';
import type { Packed } from '@/misc/json-schema.js';
import { isQuote, isQuotePacked, isRenote, isRenotePacked } from '@/misc/is-renote.js';
import { normalizeTag } from '@/misc/normalize-tag.js';

function hasDefaultTag(tags: string[] | null | undefined, defaultTag: string): boolean {
	const tag = normalizeTag(defaultTag);
	return (tags ?? []).some(t => t.toLowerCase() === tag);
}

export function matchesDefaultTag(note: MiNote, defaultTag: string): boolean {
	if (hasDefaultTag(note.tags, defaultTag)) return true;
	return note.userHost == null && isRenote(note) && !isQuote(note) && hasDefaultTag(note.renote?.tags, defaultTag);
}

export function matchesDefaultTagPacked(note: Packed<'Note'>, defaultTag: string): boolean {
	if (hasDefaultTag(note.tags, defaultTag)) return true;
	return note.user.host == null && isRenotePacked(note) && !isQuotePacked(note) && hasDefaultTag(note.renote?.tags, defaultTag);
}

/**
 * `note.renote` を `renote` として JOIN 済みのクエリで使う
 * @param includeLocalPureRenotes false ならリノート先のタグによる判定を行わない (withRenotes: false 用)
 */
export function defaultTagBrackets(defaultTag: string, includeLocalPureRenotes: boolean): Brackets {
	return new Brackets(qb => {
		qb.where(':defaultTag <@ note.tags', { defaultTag: [normalizeTag(defaultTag)] });
		if (!includeLocalPureRenotes) return;
		qb.orWhere(new Brackets(qb => {
			qb.where('note.userHost IS NULL');
			qb.andWhere('note.renoteId IS NOT NULL');
			qb.andWhere('note.text IS NULL');
			qb.andWhere('note.cw IS NULL');
			qb.andWhere('note.replyId IS NULL');
			qb.andWhere('note.hasPoll = FALSE');
			qb.andWhere('note.fileIds = \'{}\'');
			qb.andWhere(':defaultTag <@ renote.tags');
		}));
	});
}
