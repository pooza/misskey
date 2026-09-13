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
import { defineAsyncComponent, ref } from 'vue';
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
const resolvedUrl = tryParseUrl(props.url, local);
const href = resolvedUrl?.href ?? props.url;
const isMulukhiyaHome = resolvedUrl?.pathname.startsWith('/mulukhiya') ?? false;
const maybeRelativeUrl = maybeMakeRelative(href, local);
// 解決できなかった URL を MkA (SPA 内遷移) に渡すと空パスへの router.push になるので、
// その場合は外部リンク扱いのまま素の値を出す。
const self = (resolvedUrl != null) && (maybeRelativeUrl !== href) && !isMulukhiyaHome;
const attr = self ? 'to' : 'href';
const linkUrl = self ? maybeRelativeUrl : href;
const target = self ? null : '_blank';

const el = ref<HTMLElement | { $el: HTMLElement }>();

if (isEnabledUrlPreview.value) {
	useTooltip(el, (showing) => {
		const anchorElement = el.value instanceof HTMLElement ? el.value : el.value?.$el;
		if (anchorElement == null) return;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUrlPreviewPopup.vue')), {
			showing,
			url: href,
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
