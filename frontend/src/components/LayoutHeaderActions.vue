<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import LanguageSwitcher from './LanguageSwitcher.vue';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const props = defineProps<{
  userName?: string | null;
  employeeNo?: string | null;
}>();

const { personName } = useSeedDataLabels();
const displayName = computed(() =>
  personName({ employeeNo: props.employeeNo, name: props.userName }),
);

const emit = defineEmits<{
  logout: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="header-actions">
    <span v-if="userName" class="user-name">{{ displayName }}</span>
    <LanguageSwitcher />
    <el-button link type="primary" @click="emit('logout')">{{ t('common.logout') }}</el-button>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-name {
  color: #374151;
}
</style>
