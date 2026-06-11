import { onMounted, onUnmounted } from 'vue';
import { postStudentAttemptAuditEvent } from '@/api/studentExam';

/** @deprecated Prefer inline tracking in ExamTaking.vue */
export function useExamAuditEvents(attemptId: () => string | undefined) {
  let tabLeftAt: number | null = null;

  function sendEvent(eventType: string, extra: Record<string, unknown> = {}) {
    const id = attemptId();
    if (!id) return;
    postStudentAttemptAuditEvent(id, {
      eventType,
      timestamp: new Date().toISOString(),
      ...extra,
    }).catch(() => {
      /* best-effort audit */
    });
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      tabLeftAt = Date.now();
      sendEvent('page_leave', { action: 'left' });
      return;
    }
    if (tabLeftAt !== null) {
      const durationSeconds = Math.round((Date.now() - tabLeftAt) / 1000);
      tabLeftAt = null;
      sendEvent('page_return', { duration_seconds: durationSeconds });
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
}
