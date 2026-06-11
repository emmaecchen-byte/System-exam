<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import api from '@/api/client';

interface ResultQuestion {
  questionNumber: number;
  type: string;
  stem: string;
  maxScore: number;
  earnedScore: number;
  candidateAnswer: string;
  correctAnswer: string | null;
  reviewComment?: string | null;
  isObjective: boolean;
  isSubjective: boolean;
}

interface ExamResult {
  attemptId: string;
  examTitle?: string;
  graded?: boolean;
  message?: string;
  status?: string;
  submittedAt?: string;
  totalScore?: number;
  objectiveScore?: number;
  subjectiveScore?: number;
  passScore?: number;
  result?: string;
  showAnswers?: boolean;
  questions?: ResultQuestion[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const result = ref<ExamResult | null>(null);

const isPending = computed(
  () => result.value?.status === 'pending' || result.value?.graded === false,
);

onMounted(async () => {
  const attemptId = route.params.attemptId as string;
  try {
    const { data } = await api.get<ExamResult>(`/candidate/attempts/${attemptId}/result`);
    result.value = data;
  } catch {
    try {
      const { data } = await api.get<ExamResult>(`/student/attempts/${attemptId}/result`);
      result.value = data;
    } catch {
      result.value = {
        attemptId,
        status: 'pending',
        graded: false,
        message: t('student.resultsPendingPublish'),
      };
    }
  } finally {
    loading.value = false;
  }
});

function resultLabel(value?: string) {
  if (value === 'PASS') return t('student.pass');
  if (value === 'FAIL') return t('student.fail');
  return value ?? '—';
}

function resultTagType(value?: string): 'success' | 'danger' | 'info' {
  if (value === 'PASS') return 'success';
  if (value === 'FAIL') return 'danger';
  return 'info';
}

function questionTypeLabel(type: string) {
  const key = `questions.types.${type}` as const;
  const translated = t(key);
  return translated !== key ? translated : type;
}
</script>

<template>
  <div v-loading="loading" class="result-page">
    <el-button link @click="router.push('/candidate')">{{ t('student.backToMyExams') }}</el-button>

    <el-card v-if="result" class="result-card">
      <h2>{{ result.examTitle ?? t('student.resultTitle') }}</h2>

      <template v-if="isPending">
        <el-result
          icon="info"
          :title="
            result.status === 'pending'
              ? t('student.resultsPendingPublish')
              : t('student.resultsNotAvailable')
          "
          :sub-title="
            result.status === 'pending'
              ? t('student.resultsPendingCheckBack')
              : result.message
          "
        >
          <template v-if="result.submittedAt" #extra>
            <p class="submitted">
              {{ t('student.submittedOn', { date: new Date(result.submittedAt).toLocaleString() }) }}
            </p>
          </template>
        </el-result>
      </template>

      <template v-else>
        <div class="score-grid">
          <div class="score-item">
            <span class="label">{{ t('student.totalScoreLabel') }}</span>
            <strong class="value">{{ result.totalScore }}</strong>
          </div>
          <div class="score-item">
            <span class="label">{{ t('student.passingScoreShort') }}</span>
            <strong class="value">{{ result.passScore }}</strong>
          </div>
          <div class="score-item">
            <span class="label">{{ t('student.objective') }}</span>
            <strong class="value">{{ result.objectiveScore }}</strong>
          </div>
          <div v-if="result.subjectiveScore != null" class="score-item">
            <span class="label">{{ t('student.subjective') }}</span>
            <strong class="value">{{ result.subjectiveScore }}</strong>
          </div>
        </div>
        <el-tag size="large" :type="resultTagType(result.result)">
          {{ resultLabel(result.result) }}
        </el-tag>
        <p v-if="result.submittedAt" class="submitted">
          {{ t('student.submittedOn', { date: new Date(result.submittedAt).toLocaleString() }) }}
        </p>

        <div v-if="result.questions?.length" class="questions-section">
          <h3>{{ t('student.questionReview') }}</h3>
          <el-card
            v-for="q in result.questions"
            :key="q.questionNumber"
            shadow="never"
            class="question-card"
          >
            <div class="q-head">
              <h4>
                {{ t('student.questionTitle', { number: q.questionNumber, type: questionTypeLabel(q.type) }) }}
                <span class="pts">{{ t('student.ptsEarned', { earned: q.earnedScore, max: q.maxScore }) }}</span>
              </h4>
            </div>
            <p class="stem">{{ q.stem }}</p>

            <div class="answer-block candidate">
              <span class="block-label">{{ t('student.yourAnswer') }}</span>
              <p>{{ q.candidateAnswer }}</p>
            </div>

            <div v-if="q.correctAnswer && result.showAnswers" class="answer-block reference">
              <span class="block-label">{{ t('student.correctAnswer') }}</span>
              <p>{{ q.correctAnswer }}</p>
            </div>

            <div v-if="q.reviewComment" class="answer-block comment">
              <span class="block-label">{{ t('student.graderComment') }}</span>
              <p>{{ q.reviewComment }}</p>
            </div>
          </el-card>
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.result-page {
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: 2rem;
}
.result-card h2 {
  margin: 0 0 1rem;
}
.score-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.score-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.label {
  font-size: 0.85rem;
  color: #6b7280;
}
.value {
  font-size: 1.5rem;
}
.submitted {
  margin: 1rem 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}
.questions-section {
  margin-top: 1.5rem;
}
.questions-section h3 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}
.question-card {
  margin-bottom: 12px;
  border-radius: 10px;
}
.q-head h4 {
  margin: 0 0 8px;
  font-size: 1rem;
}
.pts {
  font-weight: normal;
  color: #6b7280;
  font-size: 0.9rem;
}
.stem {
  margin: 0 0 12px;
  line-height: 1.5;
}
.answer-block {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 8px;
}
.answer-block.candidate {
  background: #f3f4f6;
}
.answer-block.reference {
  background: #ecfdf5;
}
.answer-block.comment {
  background: #fffbeb;
}
.block-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  margin-bottom: 4px;
}
.answer-block p {
  margin: 0;
  white-space: pre-wrap;
}
</style>
