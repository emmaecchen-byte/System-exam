<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import {
  fetchGradingAttempt,
  gradeAnswer,
  GradingAttemptDetail,
  GradingQuestion,
  saveGradingDraft,
  submitGrading,
} from '@/api/grading';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const attemptId = route.params.attemptId as string;

const loading = ref(true);
const saving = ref(false);
const submitting = ref(false);
const detail = ref<GradingAttemptDetail | null>(null);
const needsQualityReview = ref(false);

const scores = reactive<Record<string, number>>({});
const comments = reactive<Record<string, string>>({});
const marked = reactive<Record<string, boolean>>({});

const subjectiveScore = computed(() =>
  (detail.value?.questions ?? []).reduce((sum, q) => sum + (scores[q.answerId] ?? 0), 0),
);

const totalScore = computed(() => (detail.value?.objectiveScore ?? 0) + subjectiveScore.value);

const passFail = computed(() => {
  if (!detail.value) return { label: '', pass: false };
  const pass = totalScore.value >= detail.value.passScore;
  return { label: pass ? t('common.pass') : t('common.fail'), pass };
});

const isReadOnly = computed(() => detail.value?.attemptStatus === 'COMPLETED');

function initForm(questions: GradingQuestion[]) {
  for (const q of questions) {
    scores[q.answerId] = q.manualScore ?? 0;
    comments[q.answerId] = q.reviewComment ?? '';
    marked[q.answerId] = q.markedForReview;
  }
}

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchGradingAttempt(attemptId);
    detail.value = data;
    needsQualityReview.value = data.needsQualityReview;
    initForm(data.questions);
  } catch {
    ElMessage.error(t('grading.loadWorkbenchFailed'));
    router.push('/grading/queue');
  } finally {
    loading.value = false;
  }
}

async function persistAnswer(q: GradingQuestion) {
  const score = scores[q.answerId];
  if (score < 0 || score > q.maxScore) {
    ElMessage.warning(t('grading.scoreRangeWarning', { max: q.maxScore }));
    return false;
  }
  await gradeAnswer(attemptId, q.answerId, {
    manualScore: score,
    reviewComment: comments[q.answerId] || undefined,
    markedForReview: marked[q.answerId],
  });
  return true;
}

async function saveDraft() {
  if (!detail.value) return;
  saving.value = true;
  try {
    for (const q of detail.value.questions) {
      await persistAnswer(q);
    }
    const { data } = await saveGradingDraft(attemptId);
    detail.value = data;
    initForm(data.questions);
    ElMessage.success(t('grading.draftSaved'));
  } catch {
    ElMessage.error(t('grading.draftSaveFailed'));
  } finally {
    saving.value = false;
  }
}

async function handleSubmit() {
  if (!detail.value) return;

  const ungraded = detail.value.questions.filter(
    (q) => scores[q.answerId] === undefined || scores[q.answerId] === null,
  );
  if (ungraded.length > 0) {
    ElMessage.warning(t('grading.scoreAllRequired'));
    return;
  }

  for (const q of detail.value.questions) {
    if (scores[q.answerId] > q.maxScore) {
      ElMessage.error(t('grading.scoreExceedsMax', { number: q.questionNumber, max: q.maxScore }));
      return;
    }
  }

  try {
    await ElMessageBox.confirm(
      t('grading.finalizeGradingBody', {
        total: totalScore.value,
        passScore: detail.value.passScore,
        result: passFail.value.label,
      }),
      t('grading.finalizeGrading'),
      { type: 'warning', confirmButtonText: t('student.submit') },
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    for (const q of detail.value.questions) {
      await persistAnswer(q);
    }
    await submitGrading(attemptId, { needsQualityReview: needsQualityReview.value });
    ElMessage.success(t('grading.gradingSubmitted'));
    router.push('/grading/queue');
  } catch {
    ElMessage.error(t('grading.gradingSubmitFailed'));
  } finally {
    submitting.value = false;
  }
}

function questionTypeLabel(type: string) {
  if (type === 'FILL_BLANK') return t('grading.fillBlank');
  if (type === 'SHORT_ANSWER') return t('grading.shortAnswer');
  return type;
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="workbench">
    <template v-if="detail">
      <div class="page-header">
        <el-button link @click="router.push('/grading/queue')">{{ t('grading.backToQueue') }}</el-button>
        <h2>{{ detail.examTitle }}</h2>
        <el-alert
          v-if="isReadOnly"
          type="success"
          :closable="false"
          show-icon
          :title="t('grading.gradingCompleted')"
          :description="t('grading.gradingCompletedDesc')"
        />
      </div>

      <el-card shadow="never" class="summary-card">
        <div class="summary-grid">
          <div>
            <span class="label">{{ t('grading.colCandidate') }}</span>
            <strong>{{ detail.candidate.name }} ({{ detail.candidate.employeeNo }})</strong>
          </div>
          <div>
            <span class="label">{{ t('grading.colSubmitted') }}</span>
            <strong>
              {{ detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : '—' }}
            </strong>
          </div>
          <div v-if="detail.sessionName">
            <span class="label">{{ t('grading.colSession') }}</span>
            <strong>{{ detail.sessionName }}</strong>
          </div>
          <div>
            <span class="label">{{ t('grading.objectiveScore') }}</span>
            <strong>{{ detail.objectiveScore }} {{ t('student.ptsAbbr') }}</strong>
          </div>
        </div>
      </el-card>

      <el-card
        v-for="q in detail.questions"
        :key="q.answerId"
        shadow="never"
        class="question-card"
      >
        <div class="q-head">
          <h3>
            {{ t('grading.questionTitle', { number: q.questionNumber, type: questionTypeLabel(q.type) }) }}
            <span class="pts">{{ t('grading.pointsLabel', { score: q.maxScore }) }}</span>
          </h3>
          <el-tag :type="q.graded || scores[q.answerId] > 0 ? 'success' : 'info'" size="small">
            {{ q.graded || scores[q.answerId] !== undefined ? t('grading.graded') : t('grading.ungraded') }}
          </el-tag>
        </div>

        <p class="stem">{{ q.stem }}</p>

        <div class="answer-block candidate">
          <span class="block-label">{{ t('grading.candidateAnswer') }}</span>
          <p>{{ q.candidateAnswer || t('grading.noAnswer') }}</p>
        </div>

        <div v-if="q.referenceAnswer" class="answer-block reference">
          <span class="block-label">{{ t('grading.referenceAnswer') }}</span>
          <p>{{ q.referenceAnswer }}</p>
        </div>

        <div v-if="q.scoringRubric" class="answer-block rubric">
          <span class="block-label">{{ t('grading.scoringRubric') }}</span>
          <p>{{ q.scoringRubric }}</p>
        </div>

        <div class="grade-row">
          <el-form-item :label="t('grading.scoreLabel')" class="score-input">
            <el-input-number
              v-model="scores[q.answerId]"
              :min="0"
              :max="q.maxScore"
              :step="0.5"
              :precision="1"
              :disabled="isReadOnly"
            />
            <span class="max-hint">/ {{ q.maxScore }}</span>
          </el-form-item>
          <el-checkbox v-model="marked[q.answerId]" :disabled="isReadOnly">
            {{ t('grading.markForReview') }}
          </el-checkbox>
        </div>

        <el-input
          v-model="comments[q.answerId]"
          type="textarea"
          :rows="2"
          :disabled="isReadOnly"
          :placeholder="t('grading.commentPlaceholder')"
        />
      </el-card>

      <el-card shadow="never" class="totals-card">
        <div class="totals">
          <span>
            {{ t('grading.totalBreakdown', {
              objective: detail.objectiveScore,
              subjective: subjectiveScore,
              total: totalScore,
            }) }}
          </span>
          <span>{{ t('grading.passingScoreRequired', { score: detail.passScore }) }}</span>
          <el-tag :type="passFail.pass ? 'success' : 'danger'" size="large">
            {{ passFail.label }}
          </el-tag>
        </div>
        <el-checkbox v-if="!isReadOnly" v-model="needsQualityReview" class="qa-flag">
          {{ t('grading.markForQaReview') }}
        </el-checkbox>
        <div v-if="!isReadOnly" class="actions">
          <el-button :loading="saving" @click="saveDraft">{{ t('grading.saveDraft') }}</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('grading.submitGrading') }}
          </el-button>
        </div>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.workbench {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
}
.page-header h2 {
  margin: 8px 0 0;
}
.summary-card {
  border-radius: 12px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}
.label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.question-card {
  border-radius: 12px;
}
.q-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.q-head h3 {
  margin: 0;
  font-size: 1rem;
}
.pts {
  color: #6b7280;
  font-weight: normal;
}
.stem {
  white-space: pre-wrap;
  line-height: 1.5;
  margin: 0 0 16px;
}
.answer-block {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.answer-block.candidate {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}
.answer-block.reference {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}
.answer-block.rubric {
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.block-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin-bottom: 6px;
}
.answer-block p {
  margin: 0;
  white-space: pre-wrap;
}
.grade-row {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 12px 0;
  flex-wrap: wrap;
}
.score-input {
  margin-bottom: 0;
}
.max-hint {
  margin-left: 8px;
  color: #6b7280;
}
.totals-card {
  border-radius: 12px;
  position: sticky;
  bottom: 16px;
}
.totals {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
.qa-flag {
  margin-bottom: 16px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
