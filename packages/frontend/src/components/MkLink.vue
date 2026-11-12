<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="self ? 'MkA' : 'a'" ref="el" style="word-break: break-all;" class="_link" :[attr]="linkUrl" :rel="rel ?? 'nofollow noopener'" :target="target"
	:behavior="props.navigationBehavior"
	:title="href"
>
	<slot></slot>
	<i v-if="target === '_blank'" class="ti ti-external-link" :class="$style.icon"></i>
</component>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { url as local } from '@@/js/config.js';
import { maybeMakeRelative, tryParseUrl } from '@@/js/url.js';
import type { MkABehavior } from '@/components/global/MkA.vue';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';

const props = withDefaults(defineProps<{
	url: string;
	rel?: null | string;
	navigationBehavior?: MkABehavior;
}>(), {
});

// props.url には相対パスや不正な文字列が渡ることがある (inquiryUrl のように、
// 管理画面が絶対 URL を強制しない設定値が流れてくる)。base 無しの new URL() は
// そこで throw し、MkLink を描いているコンポーネントごと描画に失敗する。
const resolvedUrl = computed(() => tryParseUrl(props.url, local));
const href = computed(() => resolvedUrl.value?.href ?? props.url);
const isMulukhiyaHome = computed(() => resolvedUrl.value?.pathname.startsWith('/mulukhiya') ?? false);
const maybeRelativeUrl = computed(() => maybeMakeRelative(href.value, local));
// 解決できなかった URL を MkA (SPA 内遷移) に渡すと空パスへの router.push になるので、
// その場合は外部リンク扱いのまま素の値を出す。
const self = computed(() => (resolvedUrl.value != null) && (maybeRelativeUrl.value !== href.value) && !isMulukhiyaHome.value);
const attr = computed(() => (self.value ? 'to' : 'href'));
const linkUrl = computed(() => (self.value ? maybeRelativeUrl.value : href.value));
const target = computed(() => (self.value ? null : '_blank'));

const el = ref<HTMLElement | { $el: HTMLElement }>();

if (isEnabledUrlPreview.value) {
	// URL が変わったら古い URL のプレビューを閉じる
	let previewShowing: Ref<boolean> | null = null;
	watch(() => props.url, () => {
		if (previewShowing != null) previewShowing.value = false;
		previewShowing = null;
	});

	useTooltip(el, (showing) => {
		const anchorElement = el.value instanceof HTMLElement ? el.value : el.value?.$el;
		if (anchorElement == null) return;
		previewShowing = showing;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUrlPreviewPopup.vue')), {
			showing,
			url: href.value,
			anchorElement: anchorElement,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>

<style lang="scss" module>
.icon {
	padding-left: 2px;
	font-size: .9em;
}
</style>
