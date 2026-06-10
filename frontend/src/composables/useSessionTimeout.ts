import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES ?? 30);
const CHECK_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export function useSessionTimeout() {
  const auth = useAuthStore();
  const router = useRouter();
  const { t } = useI18n();
  let timer: ReturnType<typeof setInterval> | undefined;

  function onActivity() {
    if (auth.isAuthenticated) {
      auth.touchActivity();
    }
  }

  async function checkIdle() {
    if (!auth.isAuthenticated) return;

    const idleMs = Date.now() - auth.getLastActivity();
    const limitMs = TIMEOUT_MINUTES * 60_000;

    if (idleMs >= limitMs) {
      await auth.logout();
      ElMessageBox.alert(
        t('sessionTimeout.message', { minutes: TIMEOUT_MINUTES }),
        t('sessionTimeout.title'),
        { type: 'warning' },
      );
      router.push('/login?reason=idle');
    }
  }

  onMounted(() => {
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));
    timer = setInterval(checkIdle, CHECK_INTERVAL_MS);
  });

  onUnmounted(() => {
    ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
    if (timer) clearInterval(timer);
  });
}
