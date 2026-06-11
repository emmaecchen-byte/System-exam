<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ROLE_LABELS } from '@/constants/roles';
import { PERMISSION_LABELS, ROLE_PERMISSION_MAP } from '@/constants/permissions';
import { loadSettings, resetSettings, saveSettings } from '@/api/settings';
import type { SystemSettings } from '@/types/settings';

const { t } = useI18n();

const activeTab = ref('general');
const saving = ref(false);
const settings = reactive<SystemSettings>(loadSettings());

const timezoneOptions = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'UTC',
  'America/New_York',
  'Europe/London',
];

const localeOptions = computed(() => [
  { value: 'zh-CN', label: t('settings.localeZh') },
  { value: 'en-US', label: t('settings.localeEn') },
]);

const roleRows = Object.entries(ROLE_PERMISSION_MAP).map(([code, permissions]) => ({
  code,
  label: ROLE_LABELS[code as keyof typeof ROLE_LABELS],
  permissions,
}));

onMounted(() => {
  Object.assign(settings, loadSettings());
});

async function onSave() {
  if (settings.audit.auditLogRetentionDays < 365) {
    ElMessage.warning(t('settings.auditRetentionWarning'));
    return;
  }
  saving.value = true;
  try {
    saveSettings(settings);
    ElMessage.success(t('settings.savedLocal'));
  } finally {
    saving.value = false;
  }
}

async function onReset() {
  await ElMessageBox.confirm(
    t('settings.resetConfirm'),
    t('settings.resetTitle'),
    { type: 'warning', confirmButtonText: t('settings.resetDefaults'), cancelButtonText: t('common.cancel') },
  );
  Object.assign(settings, resetSettings());
  ElMessage.info(t('settings.resetDone'));
}

function onUserManagement() {
  ElMessage.info(t('settings.userManagementSoon'));
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <div>
        <h2>{{ t('settings.title') }}</h2>
        <p class="subtitle">{{ t('settings.pageSubtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button @click="onReset">{{ t('settings.resetDefaults') }}</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">{{ t('settings.saveSettings') }}</el-button>
      </div>
    </div>

    <el-alert
      class="info-banner"
      :title="t('settings.superAdminBanner')"
      :description="t('settings.superAdminBannerDesc')"
      type="info"
      show-icon
      :closable="false"
    />

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane :label="t('settings.tabGeneral')" name="general">
        <el-card shadow="never">
          <template #header>{{ t('settings.organization') }}</template>
          <el-form label-width="200px" label-position="left">
            <el-form-item :label="t('settings.organizationName')">
              <el-input v-model="settings.general.organizationName" maxlength="120" show-word-limit />
            </el-form-item>
            <el-form-item :label="t('settings.supportEmail')">
              <el-input v-model="settings.general.supportEmail" type="email" placeholder="support@example.com" />
            </el-form-item>
            <el-form-item :label="t('settings.defaultTimezone')">
              <el-select v-model="settings.general.defaultTimezone" filterable style="width: 100%">
                <el-option v-for="tz in timezoneOptions" :key="tz" :label="tz" :value="tz" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('settings.systemLocale')">
              <el-select v-model="settings.general.systemLocale" style="width: 100%">
                <el-option v-for="opt in localeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabSecurity')" name="security">
        <el-card shadow="never">
          <template #header>{{ t('settings.sessionTokens') }}</template>
          <el-form label-width="220px" label-position="left">
            <el-form-item :label="t('settings.sessionInactivity')">
              <el-input-number v-model="settings.security.sessionInactivityMinutes" :min="5" :max="480" />
              <span class="field-hint">{{ t('settings.sessionInactivityHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.jwtExpiry')">
              <el-input v-model="settings.security.jwtExpiresIn" placeholder="8h" />
              <span class="field-hint">{{ t('settings.jwtExpiryHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.rememberMeDays')">
              <el-input-number v-model="settings.security.rememberMeDays" :min="1" :max="30" />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header>{{ t('settings.passwordPolicy') }}</template>
          <el-form label-width="220px" label-position="left">
            <el-form-item :label="t('settings.minPasswordLength')">
              <el-input-number v-model="settings.security.minPasswordLength" :min="6" :max="32" />
            </el-form-item>
            <el-form-item :label="t('settings.requireUppercase')">
              <el-switch v-model="settings.security.requirePasswordUppercase" />
            </el-form-item>
            <el-form-item :label="t('settings.requireNumber')">
              <el-switch v-model="settings.security.requirePasswordNumber" />
            </el-form-item>
            <el-form-item :label="t('settings.maxLoginAttempts')">
              <el-input-number v-model="settings.security.maxLoginAttempts" :min="3" :max="20" />
            </el-form-item>
            <el-form-item :label="t('settings.lockoutMinutes')">
              <el-input-number v-model="settings.security.lockoutMinutes" :min="5" :max="120" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabExam')" name="exam">
        <el-card shadow="never">
          <template #header>{{ t('settings.candidateExperience') }}</template>
          <el-form label-width="240px" label-position="left">
            <el-form-item :label="t('settings.autoSaveInterval')">
              <el-input-number v-model="settings.exam.autoSaveIntervalSeconds" :min="10" :max="120" :step="5" />
            </el-form-item>
            <el-form-item :label="t('settings.submitGracePeriod')">
              <el-input-number v-model="settings.exam.submitGracePeriodSeconds" :min="0" :max="120" />
              <span class="field-hint">{{ t('settings.submitGraceHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.defaultExamDuration')">
              <el-input-number v-model="settings.exam.defaultExamDurationMinutes" :min="15" :max="480" :step="15" />
            </el-form-item>
            <el-form-item :label="t('settings.lockTabSwitching')">
              <el-switch v-model="settings.exam.lockBrowserTabSwitching" />
            </el-form-item>
            <el-form-item :label="t('settings.allowQuestionNav')">
              <el-switch v-model="settings.exam.allowQuestionNavigation" />
            </el-form-item>
            <el-form-item :label="t('settings.autoSubmitTimeout')">
              <el-switch v-model="settings.exam.autoSubmitOnTimeout" />
            </el-form-item>
            <el-form-item :label="t('settings.showCountdown')">
              <el-switch v-model="settings.exam.showCountdownTimer" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabGrading')" name="grading">
        <el-card shadow="never">
          <template #header>{{ t('settings.gradingWorkflow') }}</template>
          <el-form label-width="260px" label-position="left">
            <el-form-item :label="t('settings.requireQualityReview')">
              <el-switch v-model="settings.grading.requireGradingQualityReview" />
              <span class="field-hint">{{ t('settings.qualityReviewHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.allowBulkRegrade')">
              <el-switch v-model="settings.grading.allowBulkRegrade" />
            </el-form-item>
            <el-form-item :label="t('settings.defaultPassingScore')">
              <el-input-number v-model="settings.grading.defaultPassingScorePercent" :min="0" :max="100" />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header>{{ t('settings.resultVisibility') }}</template>
          <el-form label-width="260px" label-position="left">
            <el-form-item :label="t('settings.publishResultsDefault')">
              <el-switch v-model="settings.grading.defaultPublishResultsToCandidates" />
            </el-form-item>
            <el-form-item :label="t('settings.showCorrectAnswers')">
              <el-switch v-model="settings.grading.showCorrectAnswersAfterPublish" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabQr')" name="qr">
        <el-card shadow="never">
          <template #header>{{ t('settings.examEntryLinks') }}</template>
          <el-form label-width="240px" label-position="left">
            <el-form-item :label="t('settings.frontendBaseUrl')">
              <el-input v-model="settings.qrEntry.frontendBaseUrl" placeholder="http://localhost:5173" />
              <span class="field-hint">{{ t('settings.frontendBaseUrlHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.qrTokenExpiry')">
              <el-input-number v-model="settings.qrEntry.qrTokenDefaultExpiryHours" :min="1" :max="168" />
            </el-form-item>
            <el-form-item :label="t('settings.allowQrReuse')">
              <el-switch v-model="settings.qrEntry.allowQrCodeReuse" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabAudit')" name="audit">
        <el-card shadow="never">
          <template #header>{{ t('settings.auditLogPolicy') }}</template>
          <el-form label-width="260px" label-position="left">
            <el-form-item :label="t('settings.logRetention')">
              <el-input-number v-model="settings.audit.auditLogRetentionDays" :min="365" :max="3650" />
              <span class="field-hint">{{ t('settings.logRetentionHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.requireNoteSensitive')">
              <el-switch v-model="settings.audit.requireNoteOnSensitiveActions" />
            </el-form-item>
            <el-form-item :label="t('settings.scheduledAuditExport')">
              <el-switch v-model="settings.audit.enableScheduledAuditExport" disabled />
              <span class="field-hint">{{ t('settings.scheduledAuditHint') }}</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabRoles')" name="roles">
        <el-card shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>{{ t('settings.userManagement') }}</span>
              <el-button type="primary" plain size="small" @click="onUserManagement">
                {{ t('settings.manageUsers') }}
              </el-button>
            </div>
          </template>
          <p class="section-desc">{{ t('settings.userManagementDesc') }}</p>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header>{{ t('settings.rolePermissions') }}</template>
          <el-table :data="roleRows" stripe border size="small">
            <el-table-column prop="label" :label="t('settings.colRole')" width="180" />
            <el-table-column :label="t('settings.colPermissions')">
              <template #default="{ row }">
                <template v-if="row.permissions.length">
                  <el-tag
                    v-for="perm in row.permissions"
                    :key="perm"
                    size="small"
                    class="perm-tag"
                    type="info"
                  >
                    {{ PERMISSION_LABELS[perm as keyof typeof PERMISSION_LABELS] ?? perm }}
                  </el-tag>
                </template>
                <span v-else class="muted">{{ t('settings.noAdminPermissions') }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabNotifications')" name="notifications">
        <el-alert
          :title="t('settings.emailNotConfigured')"
          :description="t('settings.emailNotConfiguredDesc')"
          type="warning"
          show-icon
          :closable="false"
          class="section-card"
        />
        <el-card shadow="never">
          <template #header>{{ t('settings.emailTriggers') }}</template>
          <el-form label-width="260px" label-position="left">
            <el-form-item :label="t('settings.emailOnExamSubmit')">
              <el-switch v-model="settings.notifications.emailOnExamSubmit" disabled />
            </el-form-item>
            <el-form-item :label="t('settings.emailOnGradingComplete')">
              <el-switch v-model="settings.notifications.emailOnGradingComplete" disabled />
            </el-form-item>
            <el-form-item :label="t('settings.emailOnResultPublish')">
              <el-switch v-model="settings.notifications.emailOnResultPublish" disabled />
            </el-form-item>
            <el-form-item :label="t('settings.emailOnAccountLockout')">
              <el-switch v-model="settings.notifications.emailOnAccountLockout" disabled />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('settings.tabMaintenance')" name="maintenance">
        <el-card shadow="never">
          <template #header>{{ t('settings.uploadsStorage') }}</template>
          <el-form label-width="220px" label-position="left">
            <el-form-item :label="t('settings.maxUploadSize')">
              <el-input-number v-model="settings.maintenance.maxUploadSizeMb" :min="1" :max="100" />
              <span class="field-hint">{{ t('settings.maxUploadHint') }}</span>
            </el-form-item>
            <el-form-item :label="t('settings.backupReminder')">
              <el-input-number v-model="settings.maintenance.backupReminderDays" :min="1" :max="90" />
            </el-form-item>
            <el-form-item :label="t('settings.maintenanceMode')">
              <el-switch v-model="settings.maintenance.enableMaintenanceMode" />
              <span class="field-hint">{{ t('settings.maintenanceModeHint') }}</span>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header>{{ t('settings.dataOperations') }}</template>
          <div class="ops-list">
            <div class="ops-item">
              <div>
                <strong>{{ t('settings.exportAuditLogs') }}</strong>
                <p>{{ t('settings.exportAuditLogsDesc') }}</p>
              </div>
              <router-link to="/admin/audit-logs" custom v-slot="{ navigate }">
                <el-button @click="navigate">{{ t('settings.openAuditLogs') }}</el-button>
              </router-link>
            </div>
            <div class="ops-item">
              <div>
                <strong>{{ t('settings.databaseBackup') }}</strong>
                <p>{{ t('settings.databaseBackupDesc') }}</p>
              </div>
              <el-button disabled>{{ t('settings.exportBackup') }}</el-button>
            </div>
            <div class="ops-item">
              <div>
                <strong>{{ t('settings.questionBankExport') }}</strong>
                <p>{{ t('settings.questionBankExportDesc') }}</p>
              </div>
              <router-link to="/questions" custom v-slot="{ navigate }">
                <el-button @click="navigate">{{ t('settings.openQuestionBank') }}</el-button>
              </router-link>
            </div>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <div class="footer-actions">
      <el-button @click="onReset">{{ t('settings.resetDefaults') }}</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">{{ t('settings.saveSettings') }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 960px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-header h2 {
  margin: 0 0 0.25rem;
}

.subtitle {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
  max-width: 42rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.info-banner {
  margin-bottom: 1rem;
}

.settings-tabs :deep(.el-tab-pane) {
  padding-top: 0.5rem;
}

.section-card {
  margin-top: 1rem;
}

.field-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-desc {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.perm-tag {
  margin: 0 0.35rem 0.35rem 0;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
}

.ops-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ops-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ops-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.ops-item p {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
