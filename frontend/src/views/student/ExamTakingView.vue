<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Loading, Menu, WarningFilled } from '@element-plus/icons-vue';
import {
  AttemptDetail,
  fetchAttempt,
  submitAttempt,
} from '@/api/candidate';
import { useExamAuditEvents } from '@/composables/useExamAuditEvents';
import { useExamAutoSave } from '@/composables/useExamAutoSave';
import { useExamTabLock } from '@/composables/useExamTabLock';
import QuestionPalette from '@/components/exam/QuestionPalette.vue';
import QuestionRenderer from '@/components/exam/QuestionRenderer.vue';
import {
  countAnswered,
  initAnswerState,
  isAnswerFilled,
  paletteStatus,
} from '@/utils/examAnswers';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const attemptId = route.params.attemptId as string;

const loading = ref(true);
const submitting = ref(false);
const autoSubmitting = ref(false);
const examSubmitted = ref(false);
const examLocked = computed(() => examSubmitted.value || autoSubmitting.value || submitting.value);
const paletteOpen = ref(false);

const attempt = ref<AttemptDetail | null>(null);
const currentIndex = ref(0);
const answers = reactive<Record<string, Record<string, unknown>>>({});
const marked = reactive<Record<string, boolean>>({});
const visited = ref<Set<number>>(new Set());

const remainingSeconds = ref(0);
let timerId: ReturnType<typeof setInterval> | undefined;

const { blocked: tabBlocked } = useExamTabLock(attemptId);
useExamAuditEvents(() => attemptId);

const autoSave = useExamAutoSave({
  attemptId,
  attempt,
  answers,
  marked,
  visited,
  currentIndex,
  disabled: examLocked,
});

const questions = computed(() => attempt.value?.questions ?? []);
const currentQuestion = computed(() => questions.value[currentIndex.value]);
const formattedTime = computed(() => {
  const m = Math.floor(remainingSeconds.value / 60);
  const s = remainingSeconds.value % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});
const timerUrgent = computed(() => remainingSeconds.value <= 300);
const timerCritical = computed(() => remainingSeconds.value <= 10);

const paletteStatuses = computed(() =>
  questions.value.map((q, index) =>
    paletteStatus(
      visited.value.has(index),
      isAnswerFilled(q.type, answers[q.id]),
      marked[q.id] ?? false,
    ),
  ),
);

const answeredCount = computed(() => countAnswered(questions.value, answers));
const isMobile = ref(window.matchMedia('(max-width: 768px)').matches);

const saveStatusLabel = computed(() => {
  switch (autoSave.saveStatus.value) {
    case 'saving':
      return t('student.saving');
    case 'saved':
      return t('student.saved');
    case 'offline':
      return t('student.offlineSaved');
    case 'queued':
      return t('student.queuedSync');
    case 'error':
      return t('student.saveRetrying');
    default:
      return '';
  }
});

function markVisited(index: number) {
  visited.value = new Set([...visited.value, index]);
}

async function goToQuestion(index: number) {
  if (examLocked.value) return;
  if (index < 0 || index >= questions.value.length) return;
  await autoSave.saveOnNavigation();
  markVisited(currentIndex.value);
  currentIndex.value = index;
  markVisited(index);
  paletteOpen.value = false;
}

async function nextQuestion() {
  await goToQuestion(currentIndex.value + 1);
}

async function prevQuestion() {
  await goToQuestion(currentIndex.value - 1);
}

function toggleMarkForReview() {
  if (examLocked.value) return;
  const q = currentQuestion.value;
  if (!q) return;
  marked[q.id] = !marked[q.id];
  autoSave.onAnswerChange();
}

let touchStartX = 0;
function onTouchStart(event: TouchEvent) {
  if (examLocked.value) return;
  touchStartX = event.changedTouches[0]?.clientX ?? 0;
}
function onTouchEnd(event: TouchEvent) {
  if (examLocked.value) return;
  const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
  if (Math.abs(delta) < 60) return;
  if (delta < 0 && currentIndex.value < questions.value.length - 1) void nextQuestion();
  if (delta > 0 && currentIndex.value > 0) void prevQuestion();
}

function beforeUnloadHandler(event: BeforeUnloadEvent) {
  if (examSubmitted.value || autoSubmitting.value) return;
  if (autoSave.hasUnsavedChanges.value) {
    event.preventDefault();
    event.returnValue = t('student.unsavedProgress');
  }
}

async function finalizeSubmit(submitType: 'MANUAL' | 'TIMEOUT') {
  examSubmitted.value = true;
  clearInterval(timerId);
  try {
    await autoSave.saveToServer(false);
    await submitAttempt(attemptId, submitType);
    await autoSave.clearDraft();
    if (submitType === 'TIMEOUT') {
      router.push(`/take-exam/attempts/${attemptId}/result`);
    } else {
      ElMessage.success(t('student.submitSuccess'));
      router.push(`/take-exam/attempts/${attemptId}/result`);
    }
  } catch {
    examSubmitted.value = false;
    if (submitType === 'TIMEOUT') {
      ElMessage.error(t('student.autoSubmitFailed'));
    } else {
      ElMessage.error(t('student.submissionFailed'));
    }
    throw new Error('submit failed');
  }
}

async function handleSubmit() {
  if (examLocked.value) return;

  if (remainingSeconds.value <= 10) {
    try {
      await ElMessageBox.confirm(
        t('student.lessThan10Seconds'),
        t('student.confirmSubmission'),
        { confirmButtonText: t('student.submitNow'), cancelButtonText: t('student.continueBtn'), type: 'warning' },
      );
    } catch {
      return;
    }
  }

  const unanswered = questions.value.length - answeredCount.value;
  let message = t('student.submitConfirm');
  if (unanswered > 0) {
    message = `${t('student.unansweredWarning', { count: unanswered })} ${message}`;
  }
  try {
    await ElMessageBox.confirm(message, t('student.submitTitle'), {
      confirmButtonText: t('student.submit'),
      cancelButtonText: t('student.continueBtn'),
      type: 'warning',
    });
  } catch {
    return;
  }

  submitting.value = true;
  try {
    await finalizeSubmit('MANUAL');
  } finally {
    submitting.value = false;
  }
}

async function handleTimeout() {
  if (examSubmitted.value || autoSubmitting.value) return;
  autoSubmitting.value = true;
  try {
    await finalizeSubmit('TIMEOUT');
  } catch {
    autoSubmitting.value = false;
  }
}

watch(answers, () => autoSave.onAnswerChange(), { deep: true });
watch(marked, () => autoSave.onAnswerChange(), { deep: true });

watch(tabBlocked, (blocked) => {
  if (blocked) {
    ElMessageBox.alert(
      t('student.duplicateTabMessage'),
      t('student.duplicateTabTitle'),
      { type: 'warning', showClose: false },
    ).then(() => router.push('/candidate'));
  }
});

onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnloadHandler);
  window.addEventListener('resize', () => {
    isMobile.value = window.matchMedia('(max-width: 768px)').matches;
  });

  if (tabBlocked.value) {
    loading.value = false;
    await ElMessageBox.alert(
      t('student.duplicateTabMessageShort'),
      t('student.duplicateTabTitle'),
      { type: 'warning' },
    );
    router.push('/candidate');
    return;
  }

  try {
    const { data } = await fetchAttempt(attemptId);
    attempt.value = data;
    remainingSeconds.value = data.remainingSeconds;
    currentIndex.value = data.currentQuestionIndex ?? 0;

    const state = initAnswerState(data.questions);
    Object.assign(answers, state.answers);
    Object.assign(marked, state.marked);
    visited.value = state.visited;
    autoSave.markSynced();

    await autoSave.mergeDraftFromLocal(data);
    markVisited(currentIndex.value);

    if (remainingSeconds.value <= 0) {
      void handleTimeout();
      return;
    }

    timerId = setInterval(() => {
      remainingSeconds.value -= 1;
      if (remainingSeconds.value <= 0) void handleTimeout();
    }, 1000);
  } catch {
    ElMessage.error(t('student.loadAttemptFailed'));
    router.push('/candidate');
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  clearInterval(timerId);
  window.removeEventListener('beforeunload', beforeUnloadHandler);
});
</script>

<template>
  <div v-loading="loading" class="exam-taking" :class="{ locked: examLocked }">
    <div v-if="autoSubmitting" class="timeout-overlay">
      <el-icon class="spin" :size="32"><Loading /></el-icon>
      <h2>{{ t('student.timesUp') }}</h2>
      <p>{{ t('student.timesUpHint') }}</p>
    </div>

    <header class="exam-header">
      <div class="header-main">
        <div class="title-block">
          <h1>{{ attempt?.examTitle }}</h1>
          <p>{{ attempt?.candidateName }}</p>
        </div>
        <div class="timer" :class="{ urgent: timerUrgent, critical: timerCritical }">
          <span class="timer-label">{{ t('student.timeLeft') }}</span>
          <strong>{{ formattedTime }}</strong>
        </div>
      </div>
      <div class="header-meta">
        <span
          v-if="saveStatusLabel"
          class="save-status"
          :class="autoSave.saveStatus.value"
        >
          {{ saveStatusLabel }}
        </span>
        <span v-if="!autoSave.isOnline.value" class="offline">
          <el-icon><WarningFilled /></el-icon>
          {{ t('student.connectionLost') }}
        </span>
      </div>
    </header>

    <div v-if="attempt && !tabBlocked" class="exam-body">
      <aside v-if="!isMobile" class="sidebar">
        <h3>{{ t('student.questionPalette') }}</h3>
        <QuestionPalette
          :total="questions.length"
          :current-index="currentIndex"
          :statuses="paletteStatuses"
          @select="goToQuestion"
        />
      </aside>

      <main
        class="question-panel"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div v-if="isMobile" class="mobile-palette-toggle">
          <el-button :icon="Menu" :disabled="examLocked" @click="paletteOpen = true">
            {{ t('student.questionList', { current: currentIndex + 1, total: questions.length }) }}
          </el-button>
        </div>

        <fieldset :disabled="examLocked" class="exam-fieldset">
          <el-card v-if="currentQuestion" shadow="never" class="question-card">
            <div class="question-head">
              <span class="q-number">{{ t('student.questionOf', { current: currentIndex + 1, total: questions.length }) }}</span>
              <span class="q-score">{{ currentQuestion.score }} {{ t('student.ptsAbbr') }}</span>
            </div>
            <h2 class="stem">{{ currentQuestion.stem }}</h2>
            <QuestionRenderer
              v-model="answers[currentQuestion.id]"
              :question="currentQuestion"
            />
            <div class="question-actions">
              <el-button
                :type="marked[currentQuestion.id] ? 'warning' : 'default'"
                @click="toggleMarkForReview"
              >
                {{ marked[currentQuestion.id] ? t('student.unmarkReview') : t('student.markForReview') }}
              </el-button>
            </div>
          </el-card>

          <div class="nav-row">
            <el-button :disabled="currentIndex === 0 || examLocked" @click="prevQuestion">
              {{ t('student.previous') }}
            </el-button>
            <el-button
              v-if="currentIndex < questions.length - 1"
              type="primary"
              :disabled="examLocked"
              @click="nextQuestion"
            >
              {{ t('student.saveAndNext') }}
            </el-button>
            <el-button
              v-else
              type="primary"
              plain
              :disabled="examLocked"
              @click="autoSave.saveToServer(false)"
            >
              {{ t('common.save') }}
            </el-button>
          </div>

          <el-button
            type="danger"
            size="large"
            class="submit-btn"
            :loading="submitting"
            :disabled="examLocked"
            @click="handleSubmit"
          >
            {{ t('student.submitExam') }}
          </el-button>
        </fieldset>
      </main>
    </div>

    <el-drawer
      v-model="paletteOpen"
      :title="t('student.questionPalette')"
      direction="btt"
      size="70%"
    >
      <QuestionPalette
        compact
        :total="questions.length"
        :current-index="currentIndex"
        :statuses="paletteStatuses"
        @select="goToQuestion"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
.exam-taking {
  min-height: 100vh;
  background: #f8fafc;
  position: relative;
}
.exam-taking.locked .exam-fieldset {
  pointer-events: none;
  opacity: 0.72;
}
.exam-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.timeout-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
.timeout-overlay h2 {
  margin: 16px 0 8px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.exam-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 16px;
}
.header-main {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.title-block h1 {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.3;
}
.title-block p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}
.timer {
  text-align: right;
  padding: 8px 12px;
  border-radius: 10px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  min-width: 96px;
}
.timer.urgent {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}
.timer.critical {
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  50% { transform: scale(1.04); }
}
.timer-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.timer strong {
  font-size: 1.25rem;
}
.header-meta {
  margin-top: 8px;
  font-size: 12px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.save-status {
  color: #6b7280;
}
.save-status.saving { color: #2563eb; }
.save-status.saved { color: #16a34a; font-weight: 600; }
.save-status.offline,
.save-status.queued { color: #b45309; }
.save-status.error { color: #dc2626; }
.offline {
  color: #b45309;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.exam-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}
.sidebar {
  position: sticky;
  top: 110px;
  align-self: start;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
}
.sidebar h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
.question-panel {
  min-width: 0;
}
.mobile-palette-toggle {
  margin-bottom: 12px;
}
.question-card {
  border-radius: 12px;
}
.question-head {
  display: flex;
  justify-content: space-between;
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 8px;
}
.stem {
  margin: 0 0 16px;
  font-size: 1.05rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
.question-actions {
  margin-top: 16px;
}
.nav-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 16px 0;
}
.submit-btn {
  width: 100%;
  min-height: 48px;
}

@media (max-width: 768px) {
  .exam-body {
    grid-template-columns: 1fr;
    padding: 12px;
    padding-bottom: 24px;
  }
  .title-block h1 {
    font-size: 1rem;
  }
}
</style>
