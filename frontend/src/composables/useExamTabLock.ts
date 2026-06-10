import { onMounted, onUnmounted, ref } from 'vue';

const LOCK_TTL_MS = 8000;

function lockKey(attemptId: string) {
  return `exam-tab-lock-${attemptId}`;
}

function tabId() {
  const existing = sessionStorage.getItem('exam-tab-id');
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem('exam-tab-id', id);
  return id;
}

export function useExamTabLock(attemptId: string) {
  const blocked = ref(false);
  const channel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(`exam-attempt-${attemptId}`)
    : null;
  const ownerId = tabId();
  let heartbeatId: ReturnType<typeof setInterval> | undefined;

  function writeLock() {
    localStorage.setItem(
      lockKey(attemptId),
      JSON.stringify({ tabId: ownerId, heartbeatAt: Date.now() }),
    );
    channel?.postMessage({ type: 'heartbeat', tabId: ownerId });
  }

  function isOtherTabActive(): boolean {
    const raw = localStorage.getItem(lockKey(attemptId));
    if (!raw) return false;
    try {
      const lock = JSON.parse(raw) as { tabId: string; heartbeatAt: number };
      if (lock.tabId === ownerId) return false;
      return Date.now() - lock.heartbeatAt < LOCK_TTL_MS;
    } catch {
      return false;
    }
  }

  onMounted(() => {
    if (isOtherTabActive()) {
      blocked.value = true;
      return;
    }

    writeLock();
    heartbeatId = setInterval(writeLock, 3000);

    channel?.addEventListener('message', (event) => {
      const data = event.data as { type?: string; tabId?: string };
      if (data.type === 'heartbeat' && data.tabId && data.tabId !== ownerId) {
        blocked.value = true;
      }
    });

    window.addEventListener('storage', (event) => {
      if (event.key === lockKey(attemptId) && event.newValue) {
        try {
          const lock = JSON.parse(event.newValue) as { tabId: string };
          if (lock.tabId !== ownerId) blocked.value = true;
        } catch {
          /* ignore */
        }
      }
    });
  });

  onUnmounted(() => {
    clearInterval(heartbeatId);
    channel?.close();
    const raw = localStorage.getItem(lockKey(attemptId));
    if (raw) {
      try {
        const lock = JSON.parse(raw) as { tabId: string };
        if (lock.tabId === ownerId) localStorage.removeItem(lockKey(attemptId));
      } catch {
        /* ignore */
      }
    }
  });

  return { blocked };
}
