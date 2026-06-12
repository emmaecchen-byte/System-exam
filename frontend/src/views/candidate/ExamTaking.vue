<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Loading, Menu, WarningFilled } from '@element-plus/icons-vue';
import type { AttemptDetail } from '@/api/candidate';
import {
  autoSaveStudentAttempt,
  fetchStudentAttempt,
  postStudentAttemptAuditEvent,
  saveStudentAttemptAnswers,
  submitStudentAttempt,
  type StudentAuditEventPayload,
} from '@/api/studentExam';
import { useExamAutoSave } from '@/composables/useExamAutoSave';
import { useExamTabLock } from '@/composables/useExamTabLock';
import { useExamTimer } from '@/composables/useExamTimer';
import QuestionPalette from '@/components/exam/QuestionPalette.vue';
import QuestionRenderer from '@/components/exam/QuestionRenderer.vue';
import {
  initAnswerState,
  isAnswerFilled,
  paletteStatus,
} from '@/utils/examAnswers';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const studentExamApi = {
  autoSaveAttempt: autoSaveStudentAttempt,
  saveAttemptAnswers: saveStudentAttemptAnswers,
};

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { examTitle } = useSeedDataLabels();
const attemptId = route.params.attemptId as string;

const loading = ref(true);
const submitting = ref(false);
const autoSubmitting = ref(false);
const isSubmitted = ref(false);
const examLocked = computed(() => isSubmitted.value || autoSubmitting.value || submitting.value);
const paletteOpen = ref(false);

const attempt = ref<AttemptDetail | null>(null);
const currentIndex = ref(0);
const answers = reactive<Record<string, Record<string, unknown>>>({});
const marked = reactive<Record<string, boolean>>({});
const visited = ref<Set<number>>(new Set());

const { blocked: tabBlocked } = useExamTabLock(attemptId);

let tabLeftAt: number | null = null;

function isExamInProgress() {
  return !isSubmitted.value && !autoSubmitting.value && !loading.value && Boolean(attempt.value);
}

function sendAuditEvent(payload: StudentAuditEventPayload) {
  if (!isExamInProgress()) return;
  postStudentAttemptAuditEvent(attemptId, payload).catch(() => {
    /* best-effort audit */
  });
}

function onVisibilityChange() {
  if (!isExamInProgress()) return;

  if (document.hidden) {
    tabLeftAt = Date.now();
    void autoSave.saveToServer(true);
    sendAuditEvent({
      eventType: 'page_leave',
      timestamp: new Date().toISOString(),
      action: 'left',
    });
    return;
  }

  if (tabLeftAt !== null) {
    const durationSeconds = Math.round((Date.now() - tabLeftAt) / 1000);
    tabLeftAt = null;
    sendAuditEvent({
      eventType: 'page_return',
      duration_seconds: durationSeconds,
      timestamp: new Date().toISOString(),
    });
  }
}

function preventCopy(e: ClipboardEvent) {
  if (!isExamInProgress()) return;
  e.preventDefault();
  ElMessage.warning(t('student.copyDisabled'));
  sendAuditEvent({
    eventType: 'copy_attempt',
    timestamp: new Date().toISOString(),
    metadata: { action: 'copy' },
  });
  return false;
}

function preventPaste(e: ClipboardEvent) {
  if (!isExamInProgress()) return;
  e.preventDefault();
  ElMessage.warning(t('student.pasteDisabled'));
  sendAuditEvent({
    eventType: 'copy_attempt',
    timestamp: new Date().toISOString(),
    metadata: { action: 'paste' },
  });
  return false;
}

function preventCut(e: ClipboardEvent) {
  if (!isExamInProgress()) return;
  e.preventDefault();
  ElMessage.warning(t('student.cutDisabled'));
  sendAuditEvent({
    eventType: 'copy_attempt',
    timestamp: new Date().toISOString(),
    metadata: { action: 'cut' },
  });
  return false;
}

const autoSave = useExamAutoSave({
  attemptId,
  attempt,
  answers,
  marked,
  visited,
  currentIndex,
  disabled: examLocked,
  api: studentExamApi,
  apiPathPrefix: 'student',
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

const unansweredNumbers = computed(() =>
  questions.value
    .map((q, index) => ({ q, num: index + 1 }))
    .filter(({ q }) => !isAnswerFilled(q.type, answers[q.id]))
    .map(({ num }) => num),
);

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

let saveToast: { close: () => void } | null = null;
let redirectTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => autoSave.saveStatus.value,
  (status, prev) => {
    if (status === 'saving') {
      saveToast?.close();
      saveToast = ElMessage({
        message: t('student.saving'),
        type: 'info',
        duration: 0,
        showClose: false,
      });
      return;
    }
    if (status === 'saved' && prev === 'saving') {
      saveToast?.close();
      saveToast = null;
      ElMessage.success({ message: t('student.saved'), duration: 2000 });
    }
  },
);

async function handleTimeout() {
  if (isSubmitted.value || autoSubmitting.value) return;
  autoSubmitting.value = true;
  stopTimer();
  ElMessageBox.alert(t('student.timesUp'), t('student.confirmSubmission'), {
    type: 'warning',
    showClose: false,
    confirmButtonText: t('common.confirm'),
  });
  try {
    await finalizeSubmit('TIMEOUT');
  } catch {
    autoSubmitting.value = false;
  }
}

const examTimer = useExamTimer(attemptId, () => {
  void handleTimeout();
}, fetchStudentAttempt);
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
  if (!isExamInProgress()) return;
  autoSave.saveOnPageHide();
  const message = t('student.leaveExamWarning');
  event.preventDefault();
  event.returnValue = message;
  return message;
}

function onPageHide() {
  if (!isExamInProgress()) return;
  autoSave.saveOnPageHide();
}

function onResize() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

function scheduleResultsRedirect() {
  clearTimeout(redirectTimer);
  redirectTimer = setTimeout(() => {
    router.push(`/student/attempts/${attemptId}/success`);
  }, 3000);
}

async function finalizeSubmit(submitType: 'MANUAL' | 'TIMEOUT') {
  isSubmitted.value = true;
  stopTimer();
  try {
    await autoSave.saveToServer(false);
    await submitStudentAttempt(attemptId, submitType);
    await autoSave.clearDraft();
    scheduleResultsRedirect();
  } catch {
    isSubmitted.value = false;
    clearTimeout(redirectTimer);
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

  const unanswered = unansweredNumbers.value.length;
  let message = t('student.submitConfirm');
  if (unanswered > 0) {
    message = [
      t('student.unansweredWarning', { count: unanswered }),
      t('student.unansweredList', { numbers: unansweredNumbers.value.join(', ') }),
      t('student.submitAnyway'),
    ].join('\n\n');
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
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('copy', preventCopy);
  document.addEventListener('cut', preventCut);
  document.addEventListener('paste', preventPaste);
  window.addEventListener('beforeunload', beforeUnloadHandler);
  window.addEventListener('pagehide', onPageHide);
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
    const { data } = await fetchStudentAttempt(attemptId);
    attempt.value = data;
    currentIndex.value = data.currentQuestionIndex ?? 0;

    // Server is the source of truth — restore all saved answers from the database.
    const state = initAnswerState(data.questions);
    Object.assign(answers, state.answers);
    Object.assign(marked, state.marked);
    visited.value = state.visited;
    autoSave.markSynced();
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
  clearTimeout(redirectTimer);
  saveToast?.close();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('copy', preventCopy);
  document.removeEventListener('cut', preventCut);
  document.removeEventListener('paste', preventPaste);
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  window.removeEventListener('pagehide', onPageHide);
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

    <div v-if="isSubmitted" class="success-banner" role="status">
      <strong>{{ t('student.submitSuccess') }}</strong>
      <p>{{ t('student.redirectingToResults') }}</p>
    </div>

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
      <p v-if="attempt && !isSubmitted" class="visibility-notice">
        {{ t('student.visibilityTrackingNotice') }}
      </p>
    </header>

    <section
      v-if="isMobile && attempt && !tabBlocked"
      class="mobile-palette-strip"
      :aria-label="t('student.questionPalette')"
    >
      <QuestionPalette
        compact
        :total="questions.length"
        :current-index="currentIndex"
        :statuses="paletteStatuses"
        @select="goToQuestion"
      />
    </section>

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
                :disabled="examLocked"
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
  padding-bottom: calc(148px + env(safe-area-inset-bottom, 0px));
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

.success-banner {
  background: #ecfdf5;
  border-bottom: 1px solid #6ee7b7;
  color: #065f46;
  padding: 12px 16px;
  text-align: center;
}

.success-banner p {
  margin: 4px 0 0;
  font-size: 14px;
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

.visibility-notice {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
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
  .exam-taking {
    padding-bottom: calc(148px + env(safe-area-inset-bottom, 0px));
  }

  .exam-header {
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .header-row {
    align-items: flex-start;
  }

  .q-progress {
    font-size: 16px;
    line-height: 1.3;
  }

  .exam-name {
    font-size: 12px;
  }

  .timer {
    min-width: 80px;
    min-height: 44px;
    padding: 6px 10px;
  }

  .timer strong {
    font-size: 1.25rem;
  }

  .palette-chip,
  .mark-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 10px 14px;
    font-size: 14px;
  }

  .mobile-palette-strip {
    position: sticky;
    top: calc(72px + env(safe-area-inset-top, 0px));
    z-index: 25;
    padding: 10px 12px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    max-height: min(220px, 32vh);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .exam-body {
    display: flex;
    flex-direction: column;
    grid-template-columns: 1fr;
    padding: 12px;
    padding-bottom: 8px;
    gap: 0;
  }

  .question-panel {
    width: 100%;
  }

  .question-card {
    padding: 14px;
    border-radius: 12px;
    border-width: 1px;
  }

  .question-head {
    flex-wrap: wrap;
  }

  .stem {
    font-size: 16px;
    line-height: 1.55;
    margin-bottom: 16px;
  }

  .desktop-nav {
    display: none;
  }

  .mobile-bottom-bar {
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px));
  }

  .bottom-nav-row {
    gap: 10px;
    margin-bottom: 10px;
  }

  .nav-btn {
    min-height: 48px;
    min-width: 44px;
    padding: 12px 14px;
    font-size: 16px;
    border-radius: 12px;
  }

  .nav-indicator {
    font-size: 15px;
    min-width: 56px;
  }

  .submit-btn-mobile {
    min-height: 52px;
    font-size: 17px;
    border-radius: 12px;
  }

  /* Option cards & form fields inside QuestionRenderer */
  .question-panel :deep(.question-renderer) {
    gap: 10px;
  }

  .question-panel :deep(.option-card) {
    width: 100%;
    min-height: 52px;
    padding: 14px 16px;
    font-size: 16px;
    cursor: pointer;
    border-radius: 12px;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .question-panel :deep(.option-card.selected) {
    background: #eff6ff;
    border-color: #2563eb;
  }

  .question-panel :deep(.tf-btn) {
    min-height: 52px;
    min-width: 44px;
    font-size: 17px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .question-panel :deep(.mobile-input) {
    font-size: 16px;
    padding: 12px;
    min-height: 48px;
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
  }

  .question-panel :deep(.mobile-textarea) {
    font-size: 16px;
    padding: 12px;
    min-height: 120px;
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
  }

  .question-panel :deep(.blank-label) {
    font-size: 14px;
  }
}

@media (max-width: 375px) {
  .header-row {
    gap: 8px;
  }

  .timer strong {
    font-size: 1.15rem;
  }

  .mobile-palette-strip {
    max-height: min(200px, 28vh);
  }

  .question-panel :deep(.option-card) {
    padding: 12px 14px;
  }
}
</style>
