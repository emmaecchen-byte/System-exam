import type { SystemSettings } from '@/types/settings';

const STORAGE_KEY = 'exam-system-settings';

export const DEFAULT_SETTINGS: SystemSettings = {
  general: {
    organizationName: 'Examination System',
    supportEmail: 'support@example.com',
    defaultTimezone: 'Asia/Shanghai',
    systemLocale: 'zh-CN',
  },
  security: {
    sessionInactivityMinutes: 30,
    jwtExpiresIn: '8h',
    rememberMeDays: 7,
    minPasswordLength: 8,
    requirePasswordUppercase: true,
    requirePasswordNumber: true,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
  },
  exam: {
    autoSaveIntervalSeconds: 30,
    submitGracePeriodSeconds: 30,
    lockBrowserTabSwitching: true,
    allowQuestionNavigation: true,
    autoSubmitOnTimeout: true,
    defaultExamDurationMinutes: 60,
    showCountdownTimer: true,
  },
  grading: {
    requireGradingQualityReview: false,
    allowBulkRegrade: true,
    defaultPublishResultsToCandidates: false,
    showCorrectAnswersAfterPublish: false,
    defaultPassingScorePercent: 60,
  },
  qrEntry: {
    frontendBaseUrl: 'http://localhost:5173',
    qrTokenDefaultExpiryHours: 24,
    allowQrCodeReuse: false,
  },
  audit: {
    auditLogRetentionDays: 365,
    requireNoteOnSensitiveActions: true,
    enableScheduledAuditExport: false,
  },
  notifications: {
    emailOnExamSubmit: false,
    emailOnGradingComplete: false,
    emailOnResultPublish: false,
    emailOnAccountLockout: true,
  },
  maintenance: {
    maxUploadSizeMb: 10,
    backupReminderDays: 7,
    enableMaintenanceMode: false,
  },
};

export function loadSettings(): SystemSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    return {
      general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
      security: { ...DEFAULT_SETTINGS.security, ...parsed.security },
      exam: { ...DEFAULT_SETTINGS.exam, ...parsed.exam },
      grading: { ...DEFAULT_SETTINGS.grading, ...parsed.grading },
      qrEntry: { ...DEFAULT_SETTINGS.qrEntry, ...parsed.qrEntry },
      audit: { ...DEFAULT_SETTINGS.audit, ...parsed.audit },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
      maintenance: { ...DEFAULT_SETTINGS.maintenance, ...parsed.maintenance },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: SystemSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetSettings(): SystemSettings {
  localStorage.removeItem(STORAGE_KEY);
  return structuredClone(DEFAULT_SETTINGS);
}
