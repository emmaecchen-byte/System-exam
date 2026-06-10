import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';

/** Base path for exam list / edit routes (admin portal vs exam-admin portal). */
export function useExamListBasePath() {
  const route = useRoute();
  const auth = useAuthStore();

  return computed(() => {
    if (route.path.startsWith('/exam-sessions')) {
      return '/exam-sessions';
    }
    if (auth.primaryRole === ROLES.EXAM_ADMIN) {
      return '/exam-sessions';
    }
    return '/exams';
  });
}
