<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElConfigProvider } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useAuthStore } from '@/stores/auth';
import { useSessionTimeout } from '@/composables/useSessionTimeout';

const auth = useAuthStore();
const { locale } = useI18n();
useSessionTimeout();

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
