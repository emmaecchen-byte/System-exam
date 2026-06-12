import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import {
  autoSaveAttempt,
  saveAttemptAnswers,
  type AnswerPayload,
  type AttemptDetail,
} from '@/api/candidate';
import { getApiBaseUrl, needsTunnelBypassHeader } from '@/config/apiBase';

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
import { clearExamDraft, saveExamDraft, type ExamDraft } from '@/utils/examDraftStorage';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'queued';

const AUTO_SAVE_INTERVAL_MS = 30_000;
const SAVED_INDICATOR_MS = 3_000;

interface UseExamAutoSaveOptions {
  attemptId: string;
  attempt: Ref<AttemptDetail | null>;
  answers: Record<string, Record<string, unknown>>;
  marked: Record<string, boolean>;
  visited: Ref<Set<number>>;
  currentIndex: Ref<number>;
  disabled: Ref<boolean>;
  api?: ExamAutoSaveApi;
  /** API route prefix for keepalive unload saves (default: candidate). */
  apiPathPrefix?: 'student' | 'candidate';
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
  let saveInFlight = false;
  let pendingQueue = false;
  const apiPathPrefix = options.apiPathPrefix ?? 'candidate';

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

  function getAuthToken(): string | null {
    return localStorage.getItem('accessToken') ?? sessionStorage.getItem('accessToken');
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
  }

  async function saveOnNavigation() {
    if (answersChanged.value) {
      await saveToServer(false);
    }
  }

  /** Fire-and-forget save when the page is closing (keepalive fetch). */
  function saveOnPageHide() {
    if (options.disabled.value || !options.attempt.value || !answersChanged.value) return;

    const token = getAuthToken();
    if (!token) return;

    const payload = buildPayload();
    const url = `${getApiBaseUrl()}/${apiPathPrefix}/attempts/${options.attemptId}/auto-save`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (needsTunnelBypassHeader()) {
      headers['Bypass-Tunnel-Reminder'] = 'true';
    }

    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* best-effort — server is source of truth on next load */
    });
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
    saveOnPageHide,
    clearDraft,
    persistLocal,
  };
}
