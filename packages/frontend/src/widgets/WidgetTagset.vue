<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer>
	<template #icon><i class="ti ti-hash"></i></template>
	<template #header>{{ i18n.ts._widgets.tagset }}</template>
	<div :class="$style.container">
		<div>
			<MkSelect v-model="programSelected" :items="tagsetSelectDef" :class="$style.select">
				<!--
				<template #label>{{ i18n.ts.tagset }}</template>
				-->
			</MkSelect>
		</div>
		<div>
			<MkButton :class="$style.button" class="get" @click="getPrograms">
				<i :class="$style.iconInner" class="ti ti-reload"></i>
			</MkButton>
		</div>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import * as os from '@/os.js';
import MkContainer from '@/components/MkContainer.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { useMkSelect } from '@/composables/use-mkselect.js';

type Program = {
	enable?: boolean;
	series?: string;
	episode?: string | number;
	episode_suffix?: string;
	subtitle?: string;
	air?: boolean;
	livecure?: boolean;
	minutes?: number;
	extra_tags?: string[];
	// 次回放送日（`YYYY-MM-DD`）と放送開始時刻（`HH:MM`）。どちらもモロヘイヤが
	// 返すが、`next_on` を持たない枠がある（#419）。
	next_on?: string;
	start_time?: string;
};

type SelectItem = { value: string; label: string };

const name = 'tagset';
const dic = i18n.ts._tagset;

const programs = ref<Record<string, Program>>({});
const options = ref<SelectItem[]>([]);

const widgetPropsDef = {} satisfies FormWithDefault;
type WidgetProps = GetFormResultType<typeof widgetPropsDef>;
const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();
const { widgetProps, configure } = useWidgetPropsManager(name, widgetPropsDef, props, emit);

const { model: programSelected, def: tagsetSelectDef } = useMkSelect({
	items: options,
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget?.id ?? null,
});

const itemMap = computed<Record<string, SelectItem>>(() =>
	Object.fromEntries(options.value.map(it => [it.value, it])),
);

// 番組表エントリの放送日時をラベル用の 1 つの文字列へ畳む（#419）。
//
// 表示の書式は capsicum（`program_schedule_display.dart`）に合わせてある。
// 3 クライアント（capsicum / ここ / Mastodon フォーク）で書式が割れると番組表を
// 見比べるときに困るため、片方だけ変えないこと。
//
// タグセットを選ぶのは実況の直前なので、当日・翌日だけ「今日」「明日」へ
// 置き換え、それ以遠は `M/d` にする。判定はローカル日付で行う
// （`new Date('2026-08-09')` は UTC 深夜として解釈されるので使わない。時差が
// 入ると「今日」が 1 日ズレる）。
//
// ⚠ `next_on` を持たない枠は日付を出さない。「毎日」とは書かないこと
//   （2026-08-16 判断。放送日を持たないことと毎日放送であることは違う）。
//
// 書式は厳密に見る。`/mulukhiya/api/program` は `var/program.yaml` の値をその
// まま載せるので、手編集由来の不正値がここまで届く。素通しすると実在しない日
// （`2026-02-31`）が「それらしい別の日」として表示されてしまう。
const parseNextOn = (value?: string): Date | null => {
	const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
	if (!matched) return null;

	const year = Number(matched[1]);
	const month = Number(matched[2]);
	const day = Number(matched[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

	return date;
};

// モロヘイヤは保存時にゼロ埋めするが、古いエントリや手編集では `9:00` のまま
// 残りうるのでこちらでも `HH:MM` へ揃える。
const parseStartTime = (value?: string): string | null => {
	const matched = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
	if (!matched) return null;

	const hour = Number(matched[1]);
	if (hour > 23 || Number(matched[2]) > 59) return null;

	return `${String(hour).padStart(2, '0')}:${matched[2]}`;
};

const buildSchedule = (p: Program): string => {
	const nextOn = parseNextOn(p.next_on);
	const startTime = parseStartTime(p.start_time);

	let datePart = '';
	if (nextOn) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const days = Math.round((nextOn.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
		if (days === 0) datePart = dic.today;
		else if (days === 1) datePart = dic.tomorrow;
		else datePart = `${nextOn.getMonth() + 1}/${nextOn.getDate()}`;
	}

	if (startTime == null) return datePart;
	if (datePart === '') return startTime;

	return `${datePart} ${startTime}`;
};

const buildLabel = (p: Program): string => {
	const label: string[] = [];
	// 放送日時をラベルの先頭に置く（#419）。API のレスポンスは既に放送順なので、
	// 日付が出れば「どれが今日の枠か」が一覧で分かる。
	const schedule = buildSchedule(p);
	if (schedule) label.push(schedule);
	if (p.series) label.push(p.series);
	if (p.episode) {
		label.push(`${dic.episodePrefix}${p.episode}${p.episode_suffix || dic.episodeSuffix}`);
	}
	if (p.subtitle) label.push(`「${p.subtitle}」`);
	if (p.livecure) {
		if (p.air) label.push(dic.air);
		label.push(dic.livecure);
	}
	if (p.minutes) label.push(`${p.minutes}分`);
	(p.extra_tags ?? []).forEach(tag => label.push(tag));
	return label.join(' ');
};

const getPrograms = async () => {
	try {
		const next: SelectItem[] = [
			{ value: 'clear_tags', label: dic.clearTags },
		];

		await window.fetch('/mulukhiya/api/program/update', { method: 'POST' });
		const res = await window.fetch('/mulukhiya/api/program');
		const json = await res.json() as Record<string, Program>;
		programs.value = json;

		for (const k of Object.keys(programs.value).filter(k => programs.value[k]?.enable)) {
			const v = programs.value[k]!;
			next.push({ value: k, label: buildLabel(v) });
		}

		next.push({ value: 'episode_browser', label: dic.episodeBrowser });

		options.value = next;
	} catch (e: any) {
		os.alert({ type: 'error', title: dic.fetch, text: e?.message ?? String(e) });
	}
};

const setPrograms = async () => {
	const selected = programSelected.value as string | undefined;
	if (!selected) return;

	if (selected === 'episode_browser') {
		window.open('/mulukhiya/app/episode');
		programSelected.value = null;
		return;
	}

	const commandToot: any = { command: 'user_config', tagging: {} };

	if (selected === 'clear_tags') {
		commandToot.tagging['user_tags'] = null;
	} else {
		const v = programs.value[selected];
		if (!v) return;
		commandToot.tagging['user_tags'] = [];
		if (v.series) commandToot.tagging['user_tags'].push(v.series);
		if (v.episode) commandToot.tagging['user_tags'].push(`${v.episode}${v.episode_suffix || dic.episodeSuffix}`);
		if (v.subtitle) commandToot.tagging['user_tags'].push(v.subtitle);
		if (v.air) commandToot.tagging['user_tags'].push(dic.air);
		if (v.livecure) commandToot.tagging['user_tags'].push(dic.livecure);
		(v.extra_tags ?? []).forEach(tag => commandToot.tagging['user_tags'].push(tag));
		if (v.minutes) commandToot.tagging['minutes'] = v.minutes;
		if (v.minutes) commandToot.decoration = { minutes: v.minutes };
	}

	const label = itemMap.value[selected].label || '';

	const { canceled } = await os.confirm({
		type: 'info',
		title: dic.confirmMessage,
		text: label,
	});
	if (canceled) {
		programSelected.value = null;
		return;
	}

	await os.apiWithDialog('notes/create', {
		localOnly: true, // コマンドトゥートは連合に流す必要なし
		poll: null,
		text: JSON.stringify(commandToot),
		visibility: 'specified',
		visibleUserIds: [],
	});
	os.toast(dic.successMessage);
	programSelected.value = null;
};

watch(programSelected, () => setPrograms());
onMounted(() => {
	void getPrograms();
});
</script>

<style lang="scss" module>
.select {
  padding: 5px;
}
.container {
  display: grid;
  grid-template-columns: 85% 15%;
  grid-column-gap: 5px;
  align-items: end;
}
.button {
  margin-bottom: 5px;
  min-width: 60%;
  min-height: 35px;
  padding: 0;
}
.iconInner {
  display: block;
  margin: 0 auto;
  font-size: 12px;
}
</style>
