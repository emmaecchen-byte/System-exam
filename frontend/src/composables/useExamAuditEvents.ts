import { onMounted, onUnmounted } from 'vue';
import { logCandidateAuditEvent } from '@/api/audit';

export function useExamAuditEvents(attemptId: () => string | undefined) {
  let leaveSent = false;

  function sendEvent(eventType: 'PAGE_LEAVE' | 'SCREEN_SWITCH') {
    const id = attemptId();
    if (!id) return;
    logCandidateAuditEvent(id, eventType).catch(() => {
      /* best-effort audit */
    });
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      sendEvent('SCREEN_SWITCH');
    }
  }

  function onPageLeave() {
    if (leaveSent) return;
    leaveSent = true;
    sendEvent('PAGE_LEAVE');
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageLeave);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageLeave);
  });
}
