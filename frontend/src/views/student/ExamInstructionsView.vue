<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import api from '@/api/client';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const exam = ref<{ title: string; durationMinutes: number; passScore: number } | null>(null);
const starting = ref(false);

onMounted(async () => {
  const { data } = await api.get(`/candidate/exams/${route.params.examId}`);
  exam.value = data;
});

async function start() {
  starting.value = true;
  try {
    const sessionId = route.query.sessionId as string | undefined;
    const { data } = await api.post(`/candidate/exams/${route.params.examId}/start`, {
      sessionId,
    });
    router.push(`/take-exam/attempts/${data.id}/exam`);
  } catch {
    ElMessage.error(t('student.unableToStartExam'));
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <el-card v-if="exam">
    <h2>{{ exam.title }}</h2>
    <p>{{ t('student.durationLabel', { minutes: exam.durationMinutes }) }}</p>
    <p>{{ t('student.passingScoreLabel', { score: exam.passScore }) }}</p>
    <ul>
      <li>{{ t('student.instructionsAutoSave') }}</li>
      <li>{{ t('student.instructionsAutoSubmit') }}</li>
      <li>{{ t('student.instructionsNoRefresh') }}</li>
    </ul>
    <el-button type="primary" size="large" :loading="starting" @click="start">
      {{ t('student.startExam') }}
    </el-button>
  </el-card>
</template>
