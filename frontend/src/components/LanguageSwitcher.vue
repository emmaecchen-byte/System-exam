<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { i18n, setAppLocale, type AppLocale } from '@/i18n';

const route = useRoute();
const { locale, t } = useI18n();

const label = computed(() =>
  locale.value === 'zh' ? t('common.switchToEnglish') : t('common.switchToChinese'),
);

function refreshDocumentTitle() {
  for (let i = route.matched.length - 1; i >= 0; i--) {
    const titleKey = route.matched[i].meta.titleKey as string | undefined;
    if (titleKey) {
      document.title = `${i18n.global.t(titleKey)} · ${i18n.global.t('app.name')}`;
      return;
    }
  }
}

function toggleLocale() {
  const next: AppLocale = locale.value === 'zh' ? 'en' : 'zh';
  setAppLocale(next);
  refreshDocumentTitle();
}
</script>

<template>
  <el-button link type="primary" :title="t('common.language')" @click="toggleLocale">
    {{ label }}
  </el-button>
</template>
