export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EXAM_ADMIN: 'EXAM_ADMIN',
  GRADER: 'GRADER',
  CANDIDATE: 'CANDIDATE',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/** Highest-priority role used for default redirect after login */
export const ROLE_PRIORITY: RoleCode[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.EXAM_ADMIN,
  ROLES.GRADER,
  ROLES.CANDIDATE,
];

export const ROLE_HOME_ROUTES: Record<RoleCode, string> = {
  [ROLES.SUPER_ADMIN]: '/admin/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
  [ROLES.EXAM_ADMIN]: '/exam-sessions',
  [ROLES.GRADER]: '/grading',
  [ROLES.CANDIDATE]: '/student/exams',
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.EXAM_ADMIN]: 'Exam Administrator',
  [ROLES.GRADER]: 'Grader',
  [ROLES.CANDIDATE]: 'Candidate',
};

export function resolvePrimaryRole(roles: string[]): RoleCode {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? (roles[0] as RoleCode);
}

export function getHomeRoute(roles: string[]): string {
  const primary = resolvePrimaryRole(roles);
  return ROLE_HOME_ROUTES[primary] ?? '/login';
}

export function hasAnyRole(userRoles: string[], allowed: RoleCode[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}
