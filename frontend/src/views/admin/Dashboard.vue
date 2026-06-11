<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import SimpleBarChart from '@/components/charts/SimpleBarChart.vue';

interface DashboardStats {
  totalExams: number;
  totalUsers: number;
  pendingGrading: number;
  passRateThisMonth: number;
}

interface ActivityItem {
  id: string;
  action: string;
  objectType: string;
  objectName: string | null;
  actorName: string;
  createdAt: string;
}

interface CompletionPoint {
  date: string;
  count: number;
}

const loading = ref(true);
const stats = ref<DashboardStats | null>(null);
const activity = ref<ActivityItem[]>([]);
const completions = ref<CompletionPoint[]>([]);

async function load() {
  loading.value = true;
  try {
    const [statsData, activityData, completionData] = await Promise.all([
      fetchApi<DashboardStats>('/admin/dashboard/stats'),
      fetchApi<ActivityItem[]>('/admin/dashboard/activity'),
      fetchApi<CompletionPoint[]>('/admin/dashboard/completions'),
    ]);
    stats.value = statsData;
    activity.value = activityData;
    completions.value = completionData;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Failed to load dashboard');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <p class="subtitle">Overview of exams, users, and grading activity</p>
      </div>
      <el-button @click="load">Refresh</el-button>
    </div>

    <el-row v-if="stats" :gutter="16" class="stat-row">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">Total Exams</p>
          <p class="stat-value">{{ stats.totalExams }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">Total Users</p>
          <p class="stat-value">{{ stats.totalUsers }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">Pending Grading</p>
          <p class="stat-value warn">{{ stats.pendingGrading }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">Pass Rate (This Month)</p>
          <p class="stat-value success">{{ stats.passRateThisMonth }}%</p>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header>Exam Completions (Last 7 Days)</template>
          <SimpleBarChart
            :data="completions.map((c) => ({ label: c.date.slice(5), value: c.count }))"
          />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header>Recent Activity</template>
          <el-empty v-if="!activity.length" description="No recent activity" />
          <ul v-else class="activity-list">
            <li v-for="item in activity" :key="item.id">
              <strong>{{ item.actorName }}</strong>
              <span>{{ item.action }}</span>
              <span class="muted">{{ item.objectType }}</span>
              <time>{{ formatDate(item.createdAt) }}</time>
            </li>
          </ul>
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
.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.activity-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}
.activity-list li:last-child {
  border-bottom: none;
}
.muted {
  color: #9ca3af;
}
time {
  grid-column: 2;
  color: #6b7280;
  font-size: 12px;
}
</style>
