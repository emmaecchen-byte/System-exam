<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import SimpleBarChart from '@/components/charts/SimpleBarChart.vue';

interface ReportsSummary {
  passRateTrend: Array<{ week: string; passRate: number; total: number }>;
  departmentComparison: Array<{ department: string; passRate: number; total: number }>;
  questionAccuracy: Array<{
    questionId: string;
    stem: string;
    type: string;
    accuracy: number;
    attempts: number;
  }>;
}

const loading = ref(false);
const dateRange = ref<[Date, Date] | null>(null);
const summary = ref<ReportsSummary | null>(null);

const passTrendChart = computed(() =>
  (summary.value?.passRateTrend ?? []).map((p) => ({
    label: p.week.slice(5),
    value: p.passRate,
  })),
);

const deptChart = computed(() =>
  (summary.value?.departmentComparison ?? []).slice(0, 8).map((d) => ({
    label: d.department.slice(0, 12),
    value: d.passRate,
  })),
);

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (dateRange.value?.[0]) {
      params.set('from', dateRange.value[0].toISOString().slice(0, 10));
    }
    if (dateRange.value?.[1]) {
      params.set('to', dateRange.value[1].toISOString().slice(0, 10));
    }
    const qs = params.toString();
    summary.value = await fetchApi<ReportsSummary>(`/admin/reports/summary${qs ? `?${qs}` : ''}`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Failed to load reports');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  dateRange.value = [start, end];
  load();
});
</script>

<template>
  <div v-loading="loading" class="reports">
    <div class="page-header">
      <div>
        <h2>Reports & Analytics</h2>
        <p class="subtitle">Pass rates, department comparison, and question accuracy</p>
      </div>
      <div class="filters">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="to"
          start-placeholder="Start"
          end-placeholder="End"
          @change="load"
        />
        <el-button @click="load">Apply</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>Pass Rate Trend (by week)</template>
          <SimpleBarChart :data="passTrendChart" value-suffix="%" bar-color="#16a34a" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>Department Comparison</template>
          <SimpleBarChart :data="deptChart" value-suffix="%" bar-color="#7c3aed" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="table-card">
      <template #header>Question Accuracy Analysis</template>
      <el-table :data="summary?.questionAccuracy ?? []" stripe>
        <el-table-column prop="type" label="Type" width="140" />
        <el-table-column prop="stem" label="Question" min-width="240" show-overflow-tooltip />
        <el-table-column label="Accuracy" width="120">
          <template #default="{ row }">
            <el-tag :type="row.accuracy >= 70 ? 'success' : row.accuracy >= 40 ? 'warning' : 'danger'">
              {{ row.accuracy }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="attempts" label="Attempts" width="100" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
}
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.table-card {
  margin-top: 16px;
}
</style>
