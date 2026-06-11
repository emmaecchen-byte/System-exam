<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { i18n } from '@/i18n';
import { ElConfigProvider } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useAuthStore } from '@/stores/auth';
import { useSessionTimeout } from '@/composables/useSessionTimeout';

const auth = useAuthStore();
const route = useRoute();
const { locale } = useI18n();
useSessionTimeout();

function refreshDocumentTitle() {
  for (let i = route.matched.length - 1; i >= 0; i--) {
    const titleKey = route.matched[i].meta.titleKey as string | undefined;
    if (titleKey) {
      document.title = `${i18n.global.t(titleKey)} · ${i18n.global.t('app.name')}`;
      return;
    }
  }
}

watch(locale, refreshDocumentTitle);
watch(() => route.fullPath, refreshDocumentTitle);

const elementLocale = computed(() => (locale.value === 'zh' ? zhCn : en));

onMounted(() => {
  if (auth.getStoredToken() && !auth.user) {
    auth.fetchMe();
  }
});
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>

<style>
:root {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #1f2937;
  background: #f5f7fa;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}
</style>
