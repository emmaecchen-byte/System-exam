import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import {
  autoSaveAttempt,
  saveAttemptAnswers,
  type AnswerPayload,
  type AttemptDetail,
} from '@/api/candidate';

export interface ExamAutoSaveApi {
  autoSaveAttempt: (
    attemptId: string,
    data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
  ) => Promise<unknown>;
  saveAttemptAnswers: (
    attemptId: string,
    data: { answers: AnswerPayload[]; currentQuestionIndex?: number },
  ) => Promise<unknown>;
}
import { buildSavePayload } from '@/utils/examAnswers';
import { clearExamDraft, loadExamDraft, saveExamDraft, type ExamDraft } from '@/utils/examDraftStorage';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'queued';

const AUTO_SAVE_INTERVAL_MS = 30_000;
const SAVED_INDICATOR_MS = 3_000;
const LOCAL_DEBOUNCE_MS = 500;

interface UseExamAutoSaveOptions {
  attemptId: string;
  attempt: Ref<AttemptDetail | null>;
  answers: Record<string, Record<string, unknown>>;
  marked: Record<string, boolean>;
  visited: Ref<Set<number>>;
  currentIndex: Ref<number>;
  disabled: Ref<boolean>;
  api?: ExamAutoSaveApi;
}

const defaultApi: ExamAutoSaveApi = { autoSaveAttempt, saveAttemptAnswers };

export function useExamAutoSave(options: UseExamAutoSaveOptions) {
  const api = options.api ?? defaultApi;
  const saveStatus = ref<SaveStatus>('idle');
  const isOnline = ref(navigator.onLine);
  const answersChanged = ref(false);
  const hasUnsavedChanges = ref(false);

  let lastSyncedSnapshot = '';
  let autoSaveTimer: ReturnType<typeof setInterval> | undefined;
  let savedIndicatorTimer: ReturnType<typeof setTimeout> | undefined;
  let localDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let saveInFlight = false;
  let pendingQueue = false;

  function snapshot() {
    return JSON.stringify({
      answers: options.answers,
      marked: options.marked,
      currentIndex: options.currentIndex.value,
    });
  }

  function markDirty() {
    const next = snapshot();
    answersChanged.value = next !== lastSyncedSnapshot;
    hasUnsavedChanges.value = answersChanged.value;
  }

  function markSynced() {
    lastSyncedSnapshot = snapshot();
    answersChanged.value = false;
    hasUnsavedChanges.value = false;
  }

  function buildPayload(): { answers: AnswerPayload[]; currentQuestionIndex: number } {
    const questions = options.attempt.value?.questions ?? [];
    return {
      answers: buildSavePayload(questions, options.answers, options.marked),
      currentQuestionIndex: options.currentIndex.value,
    };
  }

  async function persistLocal() {
    if (!options.attempt.value) return;
    const draft: ExamDraft = {
      attemptId: options.attemptId,
      answers: { ...options.answers },
      marked: { ...options.marked },
      visited: [...options.visited.value],
      currentIndex: options.currentIndex.value,
      savedAt: new Date().toISOString(),
    };
    await saveExamDraft(draft);
  }

  function scheduleLocalPersist() {
    clearTimeout(localDebounceTimer);
    localDebounceTimer = setTimeout(() => {
      void persistLocal();
    }, LOCAL_DEBOUNCE_MS);
  }

  function showSavedBriefly() {
    saveStatus.value = 'saved';
    clearTimeout(savedIndicatorTimer);
    savedIndicatorTimer = setTimeout(() => {
      if (saveStatus.value === 'saved') saveStatus.value = 'idle';
    }, SAVED_INDICATOR_MS);
  }

  async function saveToServer(isAuto = false): Promise<boolean> {
    if (options.disabled.value || !options.attempt.value) return true;
    if (!answersChanged.value && isAuto) return true;

    if (!navigator.onLine) {
      saveStatus.value = 'offline';
      pendingQueue = true;
      await persistLocal();
      return false;
    }

    if (saveInFlight) {
      pendingQueue = true;
      return false;
    }

    saveInFlight = true;
    saveStatus.value = 'saving';

    try {
      const payload = buildPayload();
      if (isAuto) {
        await api.autoSaveAttempt(options.attemptId, payload);
      } else {
        await api.saveAttemptAnswers(options.attemptId, payload);
      }
      markSynced();
      await persistLocal();
      pendingQueue = false;
      showSavedBriefly();
      return true;
    } catch {
      saveStatus.value = 'error';
      pendingQueue = true;
      await persistLocal();
      return false;
    } finally {
      saveInFlight = false;
      if (pendingQueue && navigator.onLine) {
        pendingQueue = false;
        void saveToServer(true);
      }
    }
  }

  async function flushQueue() {
    if (answersChanged.value || pendingQueue) {
      await saveToServer(false);
    }
  }

  function onAnswerChange() {
    markDirty();
    scheduleLocalPersist();
  }

  async function saveOnNavigation() {
    if (answersChanged.value) {
      await saveToServer(false);
    } else {
      await persistLocal();
    }
  }

  async function mergeDraftFromLocal(server: AttemptDetail) {
    const local = await loadExamDraft(options.attemptId);
    if (!local) return;

    const serverTime = server.lastAutoSavedAt ? new Date(server.lastAutoSavedAt).getTime() : 0;
    const localTime = new Date(local.savedAt).getTime();

    if (localTime > serverTime) {
      Object.assign(options.answers, local.answers);
      Object.assign(options.marked, local.marked);
      if (local.visited?.length) options.visited.value = new Set(local.visited);
      if (typeof local.currentIndex === 'number') options.currentIndex.value = local.currentIndex;
      answersChanged.value = true;
      hasUnsavedChanges.value = true;
    }
  }

  async function clearDraft() {
    await clearExamDraft(options.attemptId);
  }

  function onOnline() {
    isOnline.value = true;
    void flushQueue();
  }

  function onOffline() {
    isOnline.value = false;
    saveStatus.value = 'offline';
  }

  onMounted(() => {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    autoSaveTimer = setInterval(() => {
      if (answersChanged.value) void saveToServer(true);
    }, AUTO_SAVE_INTERVAL_MS);
  });

  onUnmounted(() => {
    clearInterval(autoSaveTimer);
    clearTimeout(savedIndicatorTimer);
    clearTimeout(localDebounceTimer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  });

  return {
    saveStatus,
    isOnline,
    answersChanged,
    hasUnsavedChanges,
    markSynced,
    onAnswerChange,
    saveToServer,
    saveOnNavigation,
    mergeDraftFromLocal,
    clearDraft,
    persistLocal,
  };
}
