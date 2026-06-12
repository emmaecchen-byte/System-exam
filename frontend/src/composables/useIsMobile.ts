import { onMounted, onUnmounted, ref } from 'vue';

const MOBILE_QUERY = '(max-width: 768px)';

export function useIsMobile() {
  const isMobile = ref(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  );

  onMounted(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => {
      isMobile.value = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    onUnmounted(() => mq.removeEventListener('change', sync));
  });

  return { isMobile };
}