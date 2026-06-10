<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { CopyDocument, Download, Refresh } from '@element-plus/icons-vue';
import {
  fetchSessionParticipants,
  fetchSessionQr,
  generateSessionQr,
  GenerateQrPayload,
  QrCodeResponse,
  revokeSessionQr,
} from '@/api/exams';

const { t } = useI18n();

const props = defineProps<{
  sessionId: string;
  sessionName: string;
}>();

const visible = defineModel<boolean>('visible', { default: false });

const loading = ref(false);
const qr = ref<QrCodeResponse | null>(null);
const participants = ref<Array<{ userId: string; user: { name: string; employeeNo: string } }>>([]);

const generateOptions = ref({
  expiryMode: 'validity_days' as 'validity_days' | 'custom' | 'session_end',
  validityDays: 7,
  expiresAt: '',
  maxScans: undefined as number | undefined,
  candidateId: '' as string,
});

async function loadParticipants() {
  try {
    const { data } = await fetchSessionParticipants(props.sessionId);
    participants.value = data.participants ?? [];
  } catch {
    participants.value = [];
  }
}

async function loadQr(generateIfMissing = false) {
  loading.value = true;
  try {
    const { data } = await fetchSessionQr(props.sessionId);
    qr.value = data;
  } catch {
    if (generateIfMissing) {
      await regenerate();
    } else {
      qr.value = null;
    }
  } finally {
    loading.value = false;
  }
}

function buildGeneratePayload(): GenerateQrPayload {
  const payload: GenerateQrPayload = {};
  if (generateOptions.value.expiryMode === 'validity_days') {
    payload.validityDays = generateOptions.value.validityDays;
  } else if (generateOptions.value.expiryMode === 'custom' && generateOptions.value.expiresAt) {
    payload.expiresAt = new Date(generateOptions.value.expiresAt).toISOString();
  }
  if (generateOptions.value.maxScans != null && generateOptions.value.maxScans > 0) {
    payload.maxScans = generateOptions.value.maxScans;
  }
  if (generateOptions.value.candidateId) {
    payload.candidateId = generateOptions.value.candidateId;
  }
  return payload;
}

async function regenerate() {
  loading.value = true;
  try {
    const { data } = await generateSessionQr(props.sessionId, buildGeneratePayload());
    qr.value = data;
    ElMessage.success(t('qr.generated'));
  } catch {
    ElMessage.error(t('qr.generateFailed'));
  } finally {
    loading.value = false;
  }
}

async function revoke() {
  loading.value = true;
  try {
    await revokeSessionQr(props.sessionId);
    qr.value = null;
    ElMessage.success(t('qr.revoked'));
  } catch {
    ElMessage.error(t('qr.revokeFailed'));
  } finally {
    loading.value = false;
  }
}

async function copyLink() {
  if (!qr.value?.entryUrl) return;
  await navigator.clipboard.writeText(qr.value.entryUrl);
  ElMessage.success(t('qr.linkCopied'));
}

function downloadPng() {
  if (!qr.value?.qrPngDataUrl) return;
  const link = document.createElement('a');
  link.href = qr.value.qrPngDataUrl;
  link.download = `exam-qr-${props.sessionName.replace(/\s+/g, '-').toLowerCase()}.png`;
  link.click();
}

watch(visible, (open) => {
  if (open) {
    loadParticipants();
    loadQr(true);
  }
});
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('qr.title', { name: sessionName })"
    width="min(480px, 92vw)"
    destroy-on-close
  >
    <div v-loading="loading" class="qr-dialog">
      <el-form label-position="top" class="options-form">
        <el-form-item :label="t('qr.validity')">
          <el-radio-group v-model="generateOptions.expiryMode">
            <el-radio value="validity_days">{{ t('qr.daysBeforeExam') }}</el-radio>
            <el-radio value="custom">{{ t('qr.customDate') }}</el-radio>
            <el-radio value="session_end">{{ t('qr.untilSessionEnds') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="generateOptions.expiryMode === 'validity_days'"
          :label="t('qr.validForDays')"
        >
          <el-input-number v-model="generateOptions.validityDays" :min="1" :max="365" />
        </el-form-item>
        <el-form-item v-else-if="generateOptions.expiryMode === 'custom'" :label="t('qr.expiresAt')">
          <el-date-picker
            v-model="generateOptions.expiresAt"
            type="datetime"
            :placeholder="t('qr.selectExpiration')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('qr.maxScans')">
          <el-input-number
            v-model="generateOptions.maxScans"
            :min="1"
            :max="1000"
            :placeholder="t('qr.unlimited')"
            controls-position="right"
          />
          <p class="field-hint">{{ t('qr.maxScansHint') }}</p>
        </el-form-item>
        <el-form-item :label="t('qr.bindCandidate')">
          <el-select
            v-model="generateOptions.candidateId"
            clearable
            filterable
            :placeholder="t('qr.anyParticipant')"
            style="width: 100%"
          >
            <el-option
              v-for="p in participants"
              :key="p.userId"
              :label="`${p.user.name} (${p.user.employeeNo})`"
              :value="p.userId"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template v-if="qr">
        <div class="qr-image-wrap">
          <img :src="qr.qrPngDataUrl" :alt="t('qr.qrAlt')" class="qr-image" />
        </div>
        <p class="expires">{{ t('qr.expires', { date: new Date(qr.expiresAt).toLocaleString() }) }}</p>
        <p v-if="qr.maxScans != null" class="expires">
          {{ t('qr.scanLimit', { count: qr.maxScans }) }}
        </p>
        <el-input :model-value="qr.entryUrl" readonly>
          <template #append>
            <el-button :icon="CopyDocument" @click="copyLink" />
          </template>
        </el-input>
        <div class="actions">
          <el-button :icon="CopyDocument" @click="copyLink">{{ t('qr.copyLink') }}</el-button>
          <el-button :icon="Download" @click="downloadPng">{{ t('qr.downloadPng') }}</el-button>
          <el-button :icon="Refresh" type="primary" @click="regenerate">{{ t('qr.regenerate') }}</el-button>
          <el-button type="danger" plain @click="revoke">{{ t('qr.revoke') }}</el-button>
        </div>
        <p class="hint">{{ t('qr.regenerateHint') }}</p>
      </template>
      <template v-else-if="!loading">
        <el-empty :description="t('qr.noQrYet')">
          <el-button type="primary" @click="regenerate">{{ t('qr.generateQr') }}</el-button>
        </el-empty>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.qr-dialog {
  min-height: 200px;
}
.options-form {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}
.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
.qr-image-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.qr-image {
  width: 280px;
  max-width: 100%;
  height: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.expires {
  text-align: center;
  color: #6b7280;
  font-size: 13px;
  margin: 0 0 12px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
</style>
