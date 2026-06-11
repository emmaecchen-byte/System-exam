import { computed, onUnmounted, ref } from 'vue';
import { fetchAttempt, type AttemptDetail } from '@/api/candidate';

const SYNC_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 1_000;

type FetchAttemptFn = (attemptId: string) => Promise<{ data: AttemptDetail }>;

export function useExamTimer(
  attemptId: string,
  onTimeout: () => void,
  fetchFn: FetchAttemptFn = fetchAttempt,
) {
  const remainingSeconds = ref(0);
  let tickId: ReturnType<typeof setInterval> | undefined;
  let syncId: ReturnType<typeof setInterval> | undefined;
  let timeoutTriggered = false;

  const formattedTime = computed(() => {
    const m = Math.floor(remainingSeconds.value / 60);
    const s = remainingSeconds.value % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });

  const timerUrgent = computed(() => remainingSeconds.value <= 60 && remainingSeconds.value > 30);
  const timerCritical = computed(() => remainingSeconds.value <= 30);

  function triggerTimeout() {
    if (timeoutTriggered) return;
    timeoutTriggered = true;
    stop();
    onTimeout();
  }

  async function syncWithServer() {
    try {
      const { data } = await fetchFn(attemptId);
      remainingSeconds.value = Math.max(0, data.remainingSeconds);
      if (remainingSeconds.value <= 0) triggerTimeout();
    } catch {
      // Keep local countdown if sync fails
    }
  }

  function start(initialSeconds: number) {
    stop();
    timeoutTriggered = false;
    remainingSeconds.value = Math.max(0, initialSeconds);

    if (remainingSeconds.value <= 0) {
      triggerTimeout();
      return;
    }

    tickId = setInterval(() => {
      if (remainingSeconds.value <= 0) {
        triggerTimeout();
        return;
      }
      remainingSeconds.value -= 1;
      if (remainingSeconds.value <= 0) triggerTimeout();
    }, TICK_INTERVAL_MS);

    syncId = setInterval(() => {
      void syncWithServer();
    }, SYNC_INTERVAL_MS);
  }

  function stop() {
    clearInterval(tickId);
    clearInterval(syncId);
  }

  onUnmounted(stop);

  return {
    remainingSeconds,
    formattedTime,
    timerUrgent,
    timerCritical,
    start,
    stop,
    syncWithServer,
  };
}
