/** Editable system configuration (UI framework — persisted locally until API exists). */
export interface SystemSettings {
  general: {
    organizationName: string;
    supportEmail: string;
    defaultTimezone: string;
    systemLocale: string;
  };
  security: {
    sessionInactivityMinutes: number;
    jwtExpiresIn: string;
    rememberMeDays: number;
    minPasswordLength: number;
    requirePasswordUppercase: boolean;
    requirePasswordNumber: boolean;
    maxLoginAttempts: number;
    lockoutMinutes: number;
  };
  exam: {
    autoSaveIntervalSeconds: number;
    submitGracePeriodSeconds: number;
    lockBrowserTabSwitching: boolean;
    allowQuestionNavigation: boolean;
    autoSubmitOnTimeout: boolean;
    defaultExamDurationMinutes: number;
    showCountdownTimer: boolean;
  };
  grading: {
    requireGradingQualityReview: boolean;
    allowBulkRegrade: boolean;
    defaultPublishResultsToCandidates: boolean;
    showCorrectAnswersAfterPublish: boolean;
    defaultPassingScorePercent: number;
  };
  qrEntry: {
    frontendBaseUrl: string;
    qrTokenDefaultExpiryHours: number;
    allowQrCodeReuse: boolean;
  };
  audit: {
    auditLogRetentionDays: number;
    requireNoteOnSensitiveActions: boolean;
    enableScheduledAuditExport: boolean;
  };
  notifications: {
    emailOnExamSubmit: boolean;
    emailOnGradingComplete: boolean;
    emailOnResultPublish: boolean;
    emailOnAccountLockout: boolean;
  };
  maintenance: {
    maxUploadSizeMb: number;
    backupReminderDays: number;
    enableMaintenanceMode: boolean;
  };
}
