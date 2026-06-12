<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import SimpleBarChart from '@/components/charts/SimpleBarChart.vue';

interface DashboardStats {
  totalExams: number;
  totalUsers: number;
  pendingGrading: number;
  passRateThisMonth: number;
}

interface CompletionPoint {
  date: string;
  count: number;
}

const { t, locale } = useI18n();

const loading = ref(true);
const stats = ref<DashboardStats | null>(null);
const completions = ref<CompletionPoint[]>([]);

async function load() {
  loading.value = true;
  try {
    const [statsData, completionData] = await Promise.all([
      fetchApi<DashboardStats>('/admin/dashboard/stats'),
      fetchApi<CompletionPoint[]>('/admin/dashboard/completions'),
    ]);
    stats.value = statsData;
    completions.value = completionData;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('dashboard.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatChartLabel(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString(locale.value, { month: 'numeric', day: 'numeric' });
}
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="page-header">
      <div>
        <h2>{{ t('dashboard.overviewTitle') }}</h2>
        <p class="subtitle">{{ t('dashboard.overviewSubtitle') }}</p>
      </div>
      <el-button @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <el-row v-if="stats" :gutter="16" class="stat-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('dashboard.totalExams') }}</p>
          <p class="stat-value">{{ stats.totalExams }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('dashboard.totalUsers') }}</p>
          <p class="stat-value">{{ stats.totalUsers }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('dashboard.pendingGrading') }}</p>
          <p class="stat-value warn">{{ stats.pendingGrading }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('dashboard.passRateThisMonth') }}</p>
          <p class="stat-value success">{{ stats.passRateThisMonth }}%</p>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>{{ t('dashboard.examCompletions7Days') }}</template>
          <SimpleBarChart
            :data="completions.map((c) => ({ label: formatChartLabel(c.date), value: c.count }))"
          />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
}
.stat-row {
  margin-bottom: 16px;
}
.stat-card {
  margin-bottom: 16px;
}
.stat-label {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}
.stat-value {
  margin: 8px 0 0;
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
}
.stat-value.warn {
  color: #d97706;
}
.stat-value.success {
  color: #16a34a;
}
</style>
