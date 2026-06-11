<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Download, Upload } from '@element-plus/icons-vue';
import type { UploadProps, UploadRawFile, UploadRequestOptions } from 'element-plus';
import {
  deletePaperAttachment,
  downloadPaperAttachment,
  uploadPaperAttachment,
  type PaperAttachmentMeta,
  type PaperDetail,
} from '@/api/papers';

const props = defineProps<{
  paperId: string;
  isEditable: boolean;
  attachment: PaperAttachmentMeta | null;
}>();

const emit = defineEmits<{
  updated: [paper: PaperDetail];
}>();

const { t } = useI18n();
const uploading = ref(false);
const activeNames = ref(['attachment']);

const acceptTypes = '.doc,.docx,.pdf';
const maxSizeMb = 20;

const hasAttachment = computed(() => Boolean(props.attachment?.fileName));

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const beforeUpload: UploadProps['beforeUpload'] = (rawFile: UploadRawFile) => {
  const ext = rawFile.name.toLowerCase().slice(rawFile.name.lastIndexOf('.'));
  if (!['.doc', '.docx', '.pdf'].includes(ext)) {
    ElMessage.error(t('paperForm.invalidType'));
    return false;
  }
  if (rawFile.size > maxSizeMb * 1024 * 1024) {
    ElMessage.error(t('paperForm.tooLarge', { size: maxSizeMb }));
    return false;
  }
  return true;
};

async function handleUpload(file: UploadRawFile) {
  if (!props.isEditable) return false;
  uploading.value = true;
  try {
    const { data } = await uploadPaperAttachment(props.paperId, file);
    emit('updated', data);
    ElMessage.success(t('paperForm.uploaded'));
  } catch {
    ElMessage.error(t('paperForm.uploadFailed'));
  } finally {
    uploading.value = false;
  }
  return false;
}

async function handleDownload() {
  try {
    await downloadPaperAttachment(props.paperId, props.attachment?.fileName ?? undefined);
  } catch {
    ElMessage.error(t('paperForm.downloadFailed'));
  }
}

async function handleDelete() {
  try {
    await ElMessageBox.confirm(t('paperForm.deleteConfirm'), t('common.confirm'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  uploading.value = true;
  try {
    const { data } = await deletePaperAttachment(props.paperId);
    emit('updated', data);
    ElMessage.success(t('paperForm.deleted'));
  } catch {
    ElMessage.error(t('paperForm.deleteFailed'));
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <el-collapse v-model="activeNames" class="paper-form-attachment">
    <el-collapse-item :title="t('paperForm.sectionTitle')" name="attachment">
      <p class="hint">{{ t('paperForm.auditNote') }}</p>

      <div v-if="hasAttachment" class="current-file">
        <div class="file-meta">
          <strong>{{ attachment?.fileName }}</strong>
          <span class="size">{{ formatFileSize(attachment?.fileSize) }}</span>
        </div>
        <div class="file-actions">
          <el-button :icon="Download" @click="handleDownload">{{ t('paperForm.download') }}</el-button>
          <el-button
            v-if="isEditable"
            type="danger"
            plain
            :icon="Delete"
            :loading="uploading"
            @click="handleDelete"
          >
            {{ t('paperForm.delete') }}
          </el-button>
        </div>
      </div>

      <el-upload
        v-if="isEditable"
        drag
        :accept="acceptTypes"
        :show-file-list="false"
        :before-upload="beforeUpload"
        :http-request="(options: UploadRequestOptions) => handleUpload(options.file)"
        :disabled="uploading"
        class="upload-area"
      >
        <el-icon class="upload-icon"><Upload /></el-icon>
        <div class="upload-text">{{ t('paperForm.dropHint') }}</div>
        <template #tip>
          <div class="upload-tip">{{ t('paperForm.acceptHint', { size: maxSizeMb }) }}</div>
        </template>
      </el-upload>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.paper-form-attachment {
  border: none;
}

.paper-form-attachment :deep(.el-collapse-item__header) {
  font-weight: 600;
  border-bottom: none;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.current-file {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f9fafb;
  border-radius: 8px;
  flex-wrap: wrap;
}

.file-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.size {
  font-size: 12px;
  color: #6b7280;
}

.file-actions {
  display: flex;
  gap: 8px;
}

.upload-area {
  width: 100%;
}

.upload-icon {
  font-size: 40px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.upload-text {
  color: #4b5563;
}

.upload-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
