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
const examManageRoles: RoleCode[] = [ROLES.ADMIN, ROLES.EXAM_ADMIN];
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
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { titleKey: 'meta.dashboard' },
      },
      {
        path: 'users',
        component: () => import('@/views/admin/UserManagement.vue'),
        meta: {
          titleKey: 'meta.userManagement',
          permission: 'user:manage',
          roles: superAdminAndAdmin,
        },
      },
      {
        path: 'departments',
        component: () => import('@/views/admin/DepartmentManagement.vue'),
        meta: {
          titleKey: 'meta.departments',
          permission: 'user:manage',
          roles: superAdminAndAdmin,
        },
      },
      {
        path: 'roles',
        component: () => import('@/views/admin/RolePermission.vue'),
        meta: {
          titleKey: 'meta.roles',
          permission: 'role:manage',
          roles: [ROLES.SUPER_ADMIN],
        },
      },
      {
        path: 'reports',
        component: () => import('@/views/admin/Reports.vue'),
        meta: { ...resultsReportsMeta },
      },
      {
        path: 'categories',
        component: () => import('@/views/admin/CategoriesView.vue'),
        meta: {
          titleKey: 'meta.categories',
          roles: [ROLES.ADMIN],
          permission: 'category:manage',
        },
      },
      {
        path: 'results',
        component: () => import('@/views/admin/ResultsView.vue'),
        meta: { ...resultsReportsMeta },
      },
      {
        path: 'questions',
        component: () => import('@/views/admin/QuestionsView.vue'),
        meta: {
          titleKey: 'meta.questionBank',
          roles: [ROLES.ADMIN],
          permission: 'question:manage',
        },
      },
      {
        path: 'papers',
        component: () => import('@/views/admin/PapersView.vue'),
        meta: {
          titleKey: 'meta.papers',
          roles: [ROLES.ADMIN],
          permission: 'paper:manage',
        },
      },
      {
        path: 'papers/:id/edit',
        component: () => import('@/views/admin/PaperEditView.vue'),
        meta: {
          titleKey: 'meta.editPaper',
          roles: [ROLES.ADMIN],
          permission: 'paper:manage',
        },
      },
      {
        path: 'exams',
        component: () => import('@/views/admin/ExamsView.vue'),
        meta: {
          titleKey: 'meta.exams',
          roles: [ROLES.ADMIN],
          permission: 'exam:manage',
        },
      },
      {
        path: 'exams/new/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: {
          titleKey: 'meta.createExam',
          roles: [ROLES.ADMIN],
          permission: 'exam:manage',
        },
      },
      {
        path: 'exams/:id/edit',
        component: () => import('@/views/admin/ExamEditView.vue'),
        meta: {
          titleKey: 'meta.editExam',
          roles: [ROLES.ADMIN],
          permission: 'exam:manage',
        },
      },
      {
        path: 'exams/:examId/sessions',
        component: () => import('@/views/admin/SessionManagement.vue'),
        meta: {
          titleKey: 'meta.sessionManagement',
          roles: examManageRoles,
          permission: 'exam:manage',
        },
      },
      {
        path: 'exams/:examId/results',
        component: () => import('@/views/admin/ExamResults.vue'),
        meta: {
          titleKey: 'meta.examResults',
          roles: examManageRoles,
          permission: 'result:export',
        },
      },
      {
        path: 'audit-logs',
        component: () => import('@/views/admin/AuditLogs.vue'),
        meta: {
          titleKey: 'meta.auditLogs',
          roles: [ROLES.SUPER_ADMIN],
          permission: 'audit:view',
        },
      },
    ],
  },

  // Exam Admin
  {
    path: '/exam-sessions',
    component: () => import('@/layouts/ExamAdminLayout.vue'),
    meta: {
      requiresAuth: true,
      roles: [ROLES.EXAM_ADMIN],
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
      {
        path: ':examId/sessions',
        component: () => import('@/views/admin/SessionManagement.vue'),
        meta: { titleKey: 'meta.sessionManagement', permission: 'exam:manage' },
      },
      {
        path: ':examId/results',
        component: () => import('@/views/admin/ExamResults.vue'),
        meta: { titleKey: 'meta.examResults', permission: 'result:export' },
      },
    ],
  },
  {
    path: '/exam-admin/results',
    component: () => import('@/layouts/ExamAdminLayout.vue'),
    meta: {
      requiresAuth: true,
      roles: [ROLES.EXAM_ADMIN],
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

  // Grader workbench (grader portal only — not in admin sidebar)
  {
    path: '/admin/grading',
    component: () => import('@/layouts/GraderLayout.vue'),
    meta: { requiresAuth: true, roles: graderRoles, permission: 'grading:manage' },
    children: [
      {
        path: '',
        component: () => import('@/views/admin/GradingWorkbench.vue'),
        meta: { titleKey: 'meta.gradingQueue' },
      },
    ],
  },

  // Grader portal (dashboard + legacy routes)
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
      { path: 'queue', redirect: '/admin/grading' },
      {
        path: 'attempts/:attemptId',
        component: () => import('@/views/admin/GradingWorkbenchView.vue'),
        meta: { titleKey: 'meta.gradeAttempt' },
      },
      { path: 'pending', redirect: '/admin/grading' },
    ],
  },

  // Candidate / student portal
  {
    path: '/student',
    component: () => import('@/layouts/StudentLayout.vue'),
    meta: { requiresAuth: true, roles: [ROLES.CANDIDATE] },
    children: [
      { path: '', redirect: '/student/exams' },
      {
        path: 'exams',
        component: () => import('@/views/candidate/MyExams.vue'),
        meta: { titleKey: 'meta.myExams' },
      },
      {
        path: 'exams/:examId/instructions',
        component: () => import('@/views/candidate/ExamInstructions.vue'),
        meta: { titleKey: 'meta.examInstructions' },
      },
      {
        path: 'attempts/:attemptId/success',
        component: () => import('@/views/candidate/SubmissionSuccess.vue'),
        meta: { titleKey: 'meta.examSubmitted' },
      },
    ],
  },
  { path: '/candidate', redirect: '/student/exams' },
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
        component: () => import('@/views/candidate/ExamTaking.vue'),
        meta: { titleKey: 'meta.takeExam', examMode: true },
      },
      {
        path: 'attempts/:attemptId/result',
        component: () => import('@/views/candidate/ExamResult.vue'),
        meta: { titleKey: 'meta.examResult' },
      },
    ],
  },

  // Legacy redirects (old top-level admin paths)
  { path: '/questions', redirect: '/admin/questions' },
  { path: '/papers', redirect: '/admin/papers' },
  { path: '/papers/:id/edit', redirect: (to) => `/admin/papers/${to.params.id}/edit` },
  { path: '/exams', redirect: '/admin/exams' },
  { path: '/exams/new/edit', redirect: '/admin/exams/new/edit' },
  { path: '/exams/:id/edit', redirect: (to) => `/admin/exams/${to.params.id}/edit` },
  { path: '/exams/:examId/sessions', redirect: (to) => `/admin/exams/${to.params.examId}/sessions` },
  { path: '/exams/:examId/results', redirect: (to) => `/admin/exams/${to.params.examId}/results` },
  { path: '/audit-logs', redirect: '/admin/audit-logs' },
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
