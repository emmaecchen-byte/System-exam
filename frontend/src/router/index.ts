import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { hasAnyRole, RoleCode, ROLES } from '@/constants/roles';
import { i18n } from '@/i18n';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    guest?: boolean;
    roles?: RoleCode[];
    permission?: string;
    titleKey?: string;
    examMode?: boolean;
    resultsTitleKey?: string;
    resultsSubtitleKey?: string;
    resultsSummary?: boolean;
  }
}

const superAdminAndAdmin: RoleCode[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
const resultsRoles: RoleCode[] = [
  ROLES.EXAM_ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.GRADER,
];
const graderRoles: RoleCode[] = [ROLES.GRADER, ROLES.SUPER_ADMIN, ROLES.ADMIN];

/** Shared results page config — same experience as Super Admin portal. */
const resultsReportsMeta = {
  titleKey: 'meta.resultsReports',
  permission: 'result:view',
  resultsTitleKey: 'results.title',
  resultsSubtitleKey: 'results.subtitle',
  resultsSummary: true,
} as const;

function updateDocumentTitle(titleKey?: string) {
  if (!titleKey) return;
  const title = i18n.global.t(titleKey);
  const appName = i18n.global.t('app.name');
  document.title = `${title} · ${appName}`;
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: () => {
      const auth = useAuthStore();
      return auth.isAuthenticated ? auth.homeRoute : '/login';
    },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guest: true, titleKey: 'meta.login' },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
    meta: { titleKey: 'meta.accessDenied' },
  },
  {
    path: '/exam-entry',
    component: () => import('@/views/student/QrEntryView.vue'),
    meta: { titleKey: 'meta.examEntry' },
  },

  // Super Admin + Admin portal
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: superAdminAndAdmin },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      {
        path: 'dashboard',
        component: () => import('@/views/dashboards/RoleDashboardView.vue'),
        meta: { titleKey: 'meta.dashboard' },
      },
      {
        path: 'categories',
        component: () => import('@/views/admin/CategoriesView.vue'),
        meta: { titleKey: 'meta.categories', roles: superAdminAndAdmin },
      },
      {
        path: 'results',
        component: () => import('@/views/admin/ResultsView.vue'),
        meta: { ...resultsReportsMeta },
      },
    ],
  },

  // Super Admin only
  {
    path: '/settings',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: [ROLES.SUPER_ADMIN] },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/SettingsView.vue'),
        meta: { titleKey: 'meta.systemSettings' },
      },
    ],
  },
  {
    path: '/audit-logs',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: superAdminAndAdmin, permission: 'audit:view' },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/AuditLogsView.vue'),
        meta: { titleKey: 'meta.auditLogs', permission: 'audit:view' },
      },
    ],
  },

  // Admin content management
  {
    path: '/exams',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: superAdminAndAdmin, permission: 'exam:manage' },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/ExamsView.vue'),
        meta: { titleKey: 'meta.exams', permission: 'exam:manage' },
      },
      {
        path: 'new/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: { titleKey: 'meta.createExam', permission: 'exam:manage' },
      },
      {
        path: ':id/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: { titleKey: 'meta.editExam', permission: 'exam:manage' },
      },
    ],
  },
  {
    path: '/questions',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: superAdminAndAdmin },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/QuestionsView.vue'),
        meta: { titleKey: 'meta.questionBank' },
      },
    ],
  },
  {
    path: '/papers',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, roles: superAdminAndAdmin },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/PapersView.vue'),
        meta: { titleKey: 'meta.papers' },
      },
      {
        path: ':id/edit',
        component: () => import('@/views/admin/PaperEditView.vue'),
        meta: { titleKey: 'meta.editPaper' },
      },
    ],
  },

  // Exam Admin
  {
    path: '/exam-sessions',
    component: () => import('@/layouts/ExamAdminLayout.vue'),
    meta: {
      requiresAuth: true,
      roles: [ROLES.EXAM_ADMIN, ROLES.SUPER_ADMIN],
      permission: 'exam:manage',
    },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/ExamsView.vue'),
        meta: { titleKey: 'meta.examSessions', permission: 'exam:manage' },
      },
      {
        path: 'new/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: { titleKey: 'meta.createExam', permission: 'exam:manage' },
      },
      {
        path: ':id/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: { titleKey: 'meta.editExam', permission: 'exam:manage' },
      },
    ],
  },
  {
    path: '/exam-admin/results',
    component: () => import('@/layouts/ExamAdminLayout.vue'),
    meta: {
      requiresAuth: true,
      roles: [ROLES.EXAM_ADMIN, ROLES.SUPER_ADMIN],
      permission: 'result:view',
    },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/ResultsView.vue'),
        meta: { ...resultsReportsMeta },
      },
    ],
  },
  {
    path: '/results',
    component: () => import('@/layouts/GraderLayout.vue'),
    meta: { requiresAuth: true, roles: resultsRoles, permission: 'result:view' },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/ResultsView.vue'),
        meta: { ...resultsReportsMeta },
      },
    ],
  },

  // Grader
  {
    path: '/grading',
    component: () => import('@/layouts/GraderLayout.vue'),
    meta: { requiresAuth: true, roles: graderRoles },
    children: [
      {
        path: '',
        component: () => import('@/views/dashboards/GraderDashboard.vue'),
        meta: { titleKey: 'meta.gradingDashboard' },
      },
      {
        path: 'queue',
        component: () => import('@/views/admin/GradingQueueView.vue'),
        meta: { titleKey: 'meta.gradingQueue' },
      },
      {
        path: 'attempts/:attemptId',
        component: () => import('@/views/admin/GradingWorkbenchView.vue'),
        meta: { titleKey: 'meta.gradeAttempt' },
      },
      { path: 'pending', redirect: '/grading/queue' },
    ],
  },

  // Candidate
  {
    path: '/candidate',
    component: () => import('@/layouts/StudentLayout.vue'),
    meta: { requiresAuth: true, roles: [ROLES.CANDIDATE] },
    children: [
      {
        path: '',
        component: () => import('@/views/student/MyExamsView.vue'),
        meta: { titleKey: 'meta.myExams' },
      },
    ],
  },
  {
    path: '/take-exam',
    component: () => import('@/layouts/StudentLayout.vue'),
    meta: { requiresAuth: true, roles: [ROLES.CANDIDATE] },
    children: [
      {
        path: 'exams/:examId/instructions',
        component: () => import('@/views/student/ExamInstructionsView.vue'),
        meta: { titleKey: 'meta.examInstructions' },
      },
      {
        path: 'attempts/:attemptId/exam',
        component: () => import('@/views/student/ExamTakingView.vue'),
        meta: { titleKey: 'meta.takeExam', examMode: true },
      },
      {
        path: 'attempts/:attemptId/result',
        component: () => import('@/views/student/ResultView.vue'),
        meta: { titleKey: 'meta.examResult' },
      },
    ],
  },

  // Legacy redirects
  { path: '/student', redirect: '/candidate' },
  { path: '/student/:pathMatch(.*)*', redirect: (to) => `/take-exam/${to.params.pathMatch}` },
  { path: '/admin/questions', redirect: '/questions' },
  { path: '/admin/papers', redirect: '/papers' },
  { path: '/admin/exams', redirect: '/exams' },
  { path: '/admin/grading', redirect: '/grading' },
  { path: '/admin/audit-logs', redirect: '/audit-logs' },
  { path: '/candidate-results', redirect: '/exam-admin/results' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.initialized) {
    await auth.fetchMe();
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return auth.homeRoute;
  }

  if (to.meta.requiresAuth) {
    if (!getStoredToken(auth)) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (!auth.user) {
      await auth.fetchMe();
    }
    if (!auth.user) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    const routeRoles = collectRouteRoles(to);
    if (routeRoles.length > 0 && !hasAnyRole(auth.user.roles, routeRoles)) {
      return '/403';
    }

    const requiredPermission = collectRoutePermission(to);
    if (requiredPermission && !auth.hasPermission(requiredPermission)) {
      return '/403';
    }
  }

  const titleKey = collectRouteTitleKey(to);
  updateDocumentTitle(titleKey);

  return true;
});

function getStoredToken(auth: ReturnType<typeof useAuthStore>) {
  return auth.getStoredToken();
}

function collectRouteRoles(to: { matched: { meta: { roles?: RoleCode[] } }[] }): RoleCode[] {
  const roles = new Set<RoleCode>();
  for (const record of to.matched) {
    record.meta.roles?.forEach((r) => roles.add(r));
  }
  return [...roles];
}

function collectRoutePermission(to: { matched: { meta: { permission?: string } }[] }): string | undefined {
  for (let i = to.matched.length - 1; i >= 0; i--) {
    const permission = to.matched[i].meta.permission;
    if (permission) return permission;
  }
  return undefined;
}

function collectRouteTitleKey(to: { matched: { meta: { titleKey?: string } }[] }): string | undefined {
  for (let i = to.matched.length - 1; i >= 0; i--) {
    const titleKey = to.matched[i].meta.titleKey;
    if (titleKey) return titleKey;
  }
  return undefined;
}

export default router;
