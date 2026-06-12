<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { fetchApi } from '@/utils/fetchApi';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

interface ExamDetail {
  id: string;
  title: string;
  durationMinutes: number;
  passScore: number;
  questions: unknown[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { examTitle } = useSeedDataLabels();
const examId = route.params.examId as string;

const loading = ref(true);
const starting = ref(false);
const error = ref('');
const exam = ref<ExamDetail | null>(null);

const questionCount = computed(() => exam.value?.questions.length ?? 0);

async function loadExam() {
  loading.value = true;
  error.value = '';
  try {
    try {
      exam.value = await fetchApi<ExamDetail>(`/student/exams/${examId}`);
    } catch {
      exam.value = await fetchApi<ExamDetail>(`/candidate/exams/${examId}`);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('student.loadAttemptFailed');
  } finally {
    loading.value = false;
  }
}

async function start() {
  starting.value = true;
  try {
    const sessionId = route.query.sessionId as string | undefined;
    const body = sessionId ? { sessionId } : {};
    let attempt: { id: string };
    try {
      attempt = await fetchApi<{ id: string }>(`/student/exams/${examId}/start`, {
        method: 'POST',
        json: body,
      });
    } catch {
      attempt = await fetchApi<{ id: string }>(`/candidate/exams/${examId}/start`, {
        method: 'POST',
        json: body,
      });
    }
    router.push(`/take-exam/attempts/${attempt.id}/exam`);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('student.unableToStartExam'));
  } finally {
    starting.value = false;
  }
}

onMounted(loadExam);
</script>

<template>
  <div v-loading="loading" class="instructions">
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb" />

    <el-empty
      v-else-if="!loading && !exam && !error"
      :description="t('student.loadAttemptFailed')"
      class="mb"
    />

    <el-card v-else-if="exam">
      <h2>{{ examTitle(examId, exam.title) }}</h2>

      <el-descriptions :column="1" border class="meta">
        <el-descriptions-item :label="t('student.colDuration')">
          {{ exam.durationMinutes }} {{ t('common.minutes') }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('student.passingScoreShort')">
          {{ exam.passScore }}
        </el-descriptions-item>
        <el-descriptions-item label="Questions">
          {{ questionCount }}
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        :title="t('student.instructionsNoRefresh')"
        type="warning"
        show-icon
        :closable="false"
        class="warning"
      />

      <ul class="rules">
        <li>{{ t('student.instructionsAutoSave') }}</li>
        <li>{{ t('student.instructionsAutoSubmit') }}</li>
        <li>{{ t('student.instructionsNoRefresh') }}</li>
      </ul>

      <el-button type="primary" size="large" :loading="starting" @click="start">
        {{ t('student.startExam') }}
      </el-button>
    </el-card>
  </div>
</template>

<style scoped>
.instructions {
  max-width: 640px;
  margin: 0 auto;
}
.instructions h2 {
  margin: 0 0 16px;
}
.meta {
  margin-bottom: 16px;
}
.warning {
  margin-bottom: 16px;
}
.rules {
  margin: 0 0 24px;
  padding-left: 1.25rem;
  color: #4b5563;
  line-height: 1.6;
}
.mb {
  margin-bottom: 16px;
}
</style>
