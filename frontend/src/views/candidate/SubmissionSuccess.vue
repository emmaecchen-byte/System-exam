<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { CircleCheckFilled } from '@element-plus/icons-vue';
import { fetchApi } from '@/utils/fetchApi';

interface AttemptResult {
  examTitle: string;
  status: string;
  resultsAvailable: boolean;
  pendingGrading: boolean;
  attemptId: string;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const attemptId = route.params.attemptId as string;

const loading = ref(true);
const result = ref<AttemptResult | null>(null);

async function load() {
  loading.value = true;
  try {
    let data: Record<string, unknown>;
    try {
      data = await fetchApi<Record<string, unknown>>(`/student/attempts/${attemptId}/result`);
    } catch {
      data = await fetchApi<Record<string, unknown>>(`/student/attempts/${attemptId}`);
    }
    result.value = {
      examTitle: String(data.examTitle ?? 'Exam'),
      status: String(data.status ?? 'SUBMITTED'),
      resultsAvailable: Boolean(data.publishedAt ?? data.resultsAvailable),
      pendingGrading: ['SUBMITTED', 'GRADING'].includes(String(data.status)),
      attemptId,
    };
  } catch {
    result.value = {
      examTitle: 'Exam',
      status: 'SUBMITTED',
      resultsAvailable: false,
      pendingGrading: true,
      attemptId,
    };
  } finally {
    loading.value = false;
  }
}

function viewResults() {
  router.push(`/take-exam/attempts/${attemptId}/result`);
}

function goDashboard() {
  router.push('/student/exams');
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="success-page">
    <el-card v-if="result" class="success-card">
      <div class="icon-wrap">
        <el-icon :size="64" color="#16a34a"><CircleCheckFilled /></el-icon>
      </div>
      <h1>{{ t('student.submitSuccess') }}</h1>
      <p class="exam-name">{{ result.examTitle }}</p>

      <el-alert
        v-if="result.pendingGrading && !result.resultsAvailable"
        :title="t('student.resultsPendingPublish')"
        :description="t('student.resultsPendingPublishDesc')"
        type="info"
        show-icon
        :closable="false"
        class="info-alert"
      />

      <div class="actions">
        <el-button
          v-if="result.resultsAvailable"
          type="primary"
          size="large"
          @click="viewResults"
        >
          View Results
        </el-button>
        <el-button size="large" @click="goDashboard">Back to Dashboard</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.success-page {
  max-width: 520px;
  margin: 2rem auto;
}
.success-card {
  text-align: center;
  padding: 12px 8px 24px;
}
.icon-wrap {
  margin-bottom: 12px;
}
h1 {
  margin: 0 0 8px;
  font-size: 1.5rem;
}
.exam-name {
  margin: 0 0 20px;
  color: #6b7280;
}
.info-alert {
  text-align: left;
  margin-bottom: 20px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.actions .el-button {
  margin: 0;
  width: 100%;
}
</style>
