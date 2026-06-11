<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Loading, Menu, WarningFilled } from '@element-plus/icons-vue';
import {
  AttemptDetail,
  fetchAttempt,
  submitAttempt,
} from '@/api/candidate';
import { useExamAuditEvents } from '@/composables/useExamAuditEvents';
import { useExamAutoSave } from '@/composables/useExamAutoSave';
import { useExamTabLock } from '@/composables/useExamTabLock';
import { useExamTimer } from '@/composables/useExamTimer';
import QuestionPalette from '@/components/exam/QuestionPalette.vue';
import QuestionRenderer from '@/components/exam/QuestionRenderer.vue';
import {
  countAnswered,
  initAnswerState,
  isAnswerFilled,
  paletteStatus,
} from '@/utils/examAnswers';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { examTitle } = useSeedDataLabels();
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

async function handleTimeout() {
  if (examSubmitted.value || autoSubmitting.value) return;
  autoSubmitting.value = true;
  try {
    await finalizeSubmit('TIMEOUT');
  } catch {
    autoSubmitting.value = false;
  }
}

const examTimer = useExamTimer(attemptId, () => {
  void handleTimeout();
});
const { formattedTime, timerUrgent, timerCritical, start: startTimer, stop: stopTimer } = examTimer;

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
  if (Math.abs(delta) < 72) return;
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

function onResize() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

async function finalizeSubmit(submitType: 'MANUAL' | 'TIMEOUT') {
  examSubmitted.value = true;
  stopTimer();
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

  if (examTimer.remainingSeconds.value <= 30) {
    try {
      await ElMessageBox.confirm(
        t('student.lessThan30Seconds'),
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
  window.addEventListener('resize', onResize);

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
    currentIndex.value = data.currentQuestionIndex ?? 0;

    const state = initAnswerState(data.questions);
    Object.assign(answers, state.answers);
    Object.assign(marked, state.marked);
    visited.value = state.visited;
    autoSave.markSynced();

    await autoSave.mergeDraftFromLocal(data);
    markVisited(currentIndex.value);

    startTimer(data.remainingSeconds);
  } catch {
    ElMessage.error(t('student.loadAttemptFailed'));
    router.push('/candidate');
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  stopTimer();
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div v-loading="loading" class="exam-taking" :class="{ locked: examLocked, mobile: isMobile }">
    <div v-if="autoSubmitting" class="timeout-overlay">
      <el-icon class="spin" :size="32"><Loading /></el-icon>
      <h2>{{ t('student.timesUp') }}</h2>
      <p>{{ t('student.timesUpHint') }}</p>
    </div>

    <!-- Sticky header: question progress + countdown always visible -->
    <header class="exam-header">
      <div class="header-row">
        <div class="progress-block">
          <span class="q-progress">
            {{ t('student.questionOf', { current: currentIndex + 1, total: questions.length }) }}
          </span>
          <span v-if="attempt" class="exam-name">{{ examTitle(undefined, attempt.examTitle) }}</span>
        </div>
        <div class="timer" :class="{ urgent: timerUrgent, critical: timerCritical }" role="timer" aria-live="polite">
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
        <button
          v-if="isMobile"
          type="button"
          class="palette-chip"
          :disabled="examLocked"
          @click="paletteOpen = true"
        >
          <el-icon><Menu /></el-icon>
          {{ t('student.paletteChip') }}
        </button>
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
        <fieldset :disabled="examLocked" class="exam-fieldset">
          <article v-if="currentQuestion" class="question-card">
            <div class="question-head">
              <span class="q-score">{{ currentQuestion.score }} {{ t('student.ptsAbbr') }}</span>
              <button
                type="button"
                class="mark-btn"
                :class="{ active: marked[currentQuestion.id] }"
                @click="toggleMarkForReview"
              >
                {{ marked[currentQuestion.id] ? t('student.unmarkReview') : t('student.markForReview') }}
              </button>
            </div>
            <h2 class="stem">{{ currentQuestion.stem }}</h2>
            <QuestionRenderer
              v-model="answers[currentQuestion.id]"
              :question="currentQuestion"
            />
          </article>

          <!-- Desktop navigation -->
          <div v-if="!isMobile" class="desktop-nav">
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
              type="danger"
              size="large"
              class="submit-btn-desktop"
              :loading="submitting"
              :disabled="examLocked"
              @click="handleSubmit"
            >
              {{ t('student.submitExam') }}
            </el-button>
          </div>
        </fieldset>
      </main>
    </div>

    <!-- Mobile fixed bottom bar -->
    <nav v-if="isMobile && attempt && !tabBlocked" class="mobile-bottom-bar">
      <div class="bottom-nav-row">
        <button
          type="button"
          class="nav-btn"
          :disabled="currentIndex === 0 || examLocked"
          @click="prevQuestion"
        >
          <el-icon><ArrowLeft /></el-icon>
          {{ t('student.previous') }}
        </button>
        <span class="nav-indicator">{{ currentIndex + 1 }} / {{ questions.length }}</span>
        <button
          type="button"
          class="nav-btn primary"
          :disabled="currentIndex >= questions.length - 1 || examLocked"
          @click="nextQuestion"
        >
          {{ t('student.next') }}
          <el-icon><ArrowRight /></el-icon>
        </button>
      </div>
      <button
        type="button"
        class="submit-btn-mobile"
        :disabled="examLocked"
        @click="handleSubmit"
      >
        <span v-if="submitting" class="submit-loading">{{ t('student.submitting') }}</span>
        <span v-else>{{ t('student.submitExam') }}</span>
      </button>
    </nav>

    <el-drawer
      v-model="paletteOpen"
      :title="t('student.questionPalette')"
      direction="btt"
      size="72%"
      class="palette-drawer"
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
  min-height: 100dvh;
  background: #f8fafc;
  position: relative;
  display: flex;
  flex-direction: column;
}

.exam-taking.mobile {
  padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
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
  z-index: 200;
  background: rgba(15, 23, 42, 0.88);
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
  z-index: 30;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 16px;
  padding-top: max(10px, env(safe-area-inset-top, 0px));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.progress-block {
  min-width: 0;
  flex: 1;
}

.q-progress {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.exam-name {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timer {
  flex-shrink: 0;
  text-align: center;
  padding: 8px 14px;
  border-radius: 12px;
  background: #fef9c3;
  border: 2px solid #fde047;
  min-width: 88px;
}

.timer.urgent {
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}

.timer.critical {
  background: #fee2e2;
  border-color: #ef4444;
  color: #b91c1c;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  50% { transform: scale(1.05); }
}

.timer-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.timer strong {
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
}

.header-meta {
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.save-status { color: #6b7280; }
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

.palette-chip {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #f9fafb;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.exam-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 16px;
}

.sidebar {
  position: sticky;
  top: 100px;
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

.question-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
}

.question-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.q-score {
  font-size: 14px;
  color: #6b7280;
  font-weight: 600;
}

.mark-btn {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mark-btn.active {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #b45309;
}

.stem {
  margin: 0 0 20px;
  font-size: 17px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #111827;
}

.desktop-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  align-items: center;
}

.submit-btn-desktop {
  margin-left: auto;
  min-height: 44px;
}

.mobile-bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  padding: 10px 12px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}

.bottom-nav-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.nav-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.nav-btn.primary {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.nav-indicator {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: #6b7280;
  min-width: 52px;
  text-align: center;
}

.submit-btn-mobile {
  width: 100%;
  min-height: 52px;
  padding: 14px 16px;
  border: none;
  border-radius: 12px;
  background: #dc2626;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.submit-btn-mobile:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.submit-btn-mobile:active:not(:disabled) {
  background: #b91c1c;
}

.submit-loading {
  opacity: 0.9;
}

@media (max-width: 768px) {
  .exam-body {
    grid-template-columns: 1fr;
    padding: 12px;
    padding-bottom: 8px;
  }

  .question-card {
    padding: 14px;
    border-radius: 12px;
  }

  .stem {
    font-size: 16px;
  }
}
</style>
