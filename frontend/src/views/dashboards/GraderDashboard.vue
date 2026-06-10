<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { fetchGradingStats } from '@/api/grading';

const router = useRouter();
const { t } = useI18n();
const stats = ref({ pending: 0, inProgress: 0, completed: 0, total: 0 });

const needToGrade = computed(() => stats.value.pending + stats.value.inProgress);
const finished = computed(() => stats.value.completed);

onMounted(async () => {
  try {
    const { data } = await fetchGradingStats();
    stats.value = data;
  } catch {
    /* stats optional on dashboard */
  }
});

function openQueue(tab: 'need' | 'finished') {
  router.push({ path: '/grading/queue', query: tab === 'finished' ? { tab: 'finished' } : undefined });
}
</script>

<template>
  <div>
    <h2>{{ t('dashboard.graderWorkbenchTitle') }}</h2>
    <p class="subtitle">
      {{ t('dashboard.graderWorkbenchSubtitle') }}
    </p>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="hover" class="stat-card need-card">
          <el-statistic :title="t('dashboard.needToGrade')" :value="needToGrade" />
          <p class="stat-hint">{{ t('dashboard.needToGradeHint') }}</p>
          <el-button type="primary" @click="openQueue('need')">{{ t('dashboard.openQueue') }}</el-button>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" class="stat-card finished-card">
          <el-statistic :title="t('dashboard.finishedGrading')" :value="finished" />
          <p class="stat-hint">{{ t('dashboard.finishedGradingHint') }}</p>
          <el-button @click="openQueue('finished')">{{ t('dashboard.viewCompleted') }}</el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.subtitle {
  color: #6b7280;
  margin-bottom: 20px;
}
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 180px;
}
.stat-hint {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  flex: 1;
}
</style>
