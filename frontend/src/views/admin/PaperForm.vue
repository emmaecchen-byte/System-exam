<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Download, Plus, Rank, Upload, View } from '@element-plus/icons-vue';
import type { UploadProps, UploadRawFile, UploadRequestOptions } from 'element-plus';
import draggable from 'vuedraggable';
import type { Question } from '@/api/questions';
import {
  addPaperQuestions,
  createPaperNewVersion,
  deletePaperAttachment,
  downloadPaperAttachment,
  fetchPaper,
  fetchPaperPreview,
  removePaperQuestion,
  reorderPaperQuestions,
  updatePaperQuestionScore,
  uploadPaperAttachment,
  type PaperAttachmentMeta,
  type PaperDetail,
  type PaperQuestionItem,
} from '@/api/papers';
import QuestionPickerDialog from '@/components/QuestionPickerDialog.vue';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';

const props = defineProps<{
  paperId: string;
  paper: PaperDetail | null;
  isEditable: boolean;
  attachment: PaperAttachmentMeta | null;
}>();

const emit = defineEmits<{
  updated: [paper: PaperDetail];
}>();

const { t } = useI18n();
const router = useRouter();
const { questionType } = useLocalizedLabels();

const uploading = ref(false);
const activeNames = ref(['attachment']);
const pickerVisible = ref(false);
const previewVisible = ref(false);
const previewData = ref<{
  questions: Array<{
    sortOrder: number;
    score: number;
    stem: string;
    type?: string;
    options?: unknown;
  }>;
} | null>(null);
const reordering = ref(false);
const localQuestions = ref<PaperQuestionItem[]>([]);

const acceptTypes = '.doc,.docx,.pdf';
const maxSizeMb = 20;

const hasAttachment = computed(() => Boolean(props.attachment?.fileName));

const excludeQuestionIds = computed(
  () => props.paper?.questions.map((q) => q.questionId) ?? [],
);

const computedTotal = computed(() =>
  localQuestions.value.reduce((sum, q) => sum + Number(q.score || 0), 0),
);

const scoreMismatch = computed(() => {
  if (!props.paper) return false;
  return Math.abs(computedTotal.value - Number(props.paper.totalScore)) > 0.01;
});

watch(
  () => props.paper?.questions,
  (questions) => {
    localQuestions.value = [...(questions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  },
  { immediate: true, deep: true },
);

function truncate(text: string | undefined, max = 140) {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function typeLabel(type?: string) {
  if (!type) return '—';
  return questionType(type);
}

function typeTagType(type?: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  switch (type) {
    case 'SINGLE_CHOICE':
      return '';
    case 'MULTIPLE_CHOICE':
      return 'success';
    case 'TRUE_FALSE':
      return 'warning';
    case 'FILL_BLANK':
      return 'info';
    case 'SHORT_ANSWER':
      return 'danger';
    default:
      return 'info';
  }
}

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
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
    await uploadPaperAttachment(props.paperId, file);
    const { data: paper } = await fetchPaper(props.paperId);
    emit('updated', paper);
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

async function handleDeleteAttachment() {
  try {
    await ElMessageBox.confirm(t('paperForm.deleteConfirm'), t('common.confirm'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  uploading.value = true;
  try {
    await deletePaperAttachment(props.paperId);
    const { data: paper } = await fetchPaper(props.paperId);
    emit('updated', paper);
    ElMessage.success(t('paperForm.deleted'));
  } catch {
    ElMessage.error(t('paperForm.deleteFailed'));
  } finally {
    uploading.value = false;
  }
}

async function onQuestionsSelected(questions: Question[]) {
  if (!props.isEditable || !questions.length) return;

  const existing = new Set(excludeQuestionIds.value);
  const duplicates = questions.filter((q) => existing.has(q.id));
  const toAdd = questions.filter((q) => !existing.has(q.id));

  if (duplicates.length) {
    ElMessage.warning(t('paperForm.duplicateWarning', { count: duplicates.length }));
  }
  if (!toAdd.length) return;

  const scores: Record<string, number> = {};
  toAdd.forEach((q) => {
    scores[q.id] = q.score;
  });

  try {
    const { data } = await addPaperQuestions(
      props.paperId,
      toAdd.map((q) => q.id),
      scores,
    );
    emit('updated', data);
    ElMessage.success(t('paperForm.addedQuestions', { count: toAdd.length }));
  } catch {
    ElMessage.error(t('paperForm.saveFailed'));
  }
}

async function removeQuestion(questionId: string) {
  try {
    const { data } = await removePaperQuestion(props.paperId, questionId);
    emit('updated', data);
  } catch {
    ElMessage.error(t('paperForm.saveFailed'));
  }
}

async function updateScore(questionId: string, score: number) {
  if (!Number.isFinite(score) || score <= 0) return;
  try {
    const { data } = await updatePaperQuestionScore(props.paperId, questionId, score);
    emit('updated', data);
  } catch {
    ElMessage.error(t('paperForm.saveFailed'));
  }
}

async function onDragEnd() {
  if (!props.isEditable) return;
  reordering.value = true;
  try {
    const orders = localQuestions.value.map((q, index) => ({
      questionId: q.questionId,
      sortOrder: index,
    }));
    const { data } = await reorderPaperQuestions(props.paperId, orders);
    emit('updated', data);
  } catch {
    ElMessage.error(t('paperForm.reorderFailed'));
    if (props.paper?.questions) {
      localQuestions.value = [...props.paper.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    }
  } finally {
    reordering.value = false;
  }
}

async function showPreview() {
  try {
    const { data } = await fetchPaperPreview(props.paperId);
    previewData.value = data;
    previewVisible.value = true;
  } catch {
    ElMessage.error(t('paperForm.previewFailed'));
  }
}

async function createNewVersion() {
  try {
    await ElMessageBox.confirm(t('paperForm.newVersionConfirm'), t('paperForm.newVersionTitle'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const { data } = await createPaperNewVersion(props.paperId);
    ElMessage.success(t('paperForm.newVersionCreated'));
    router.push(`/admin/papers/${data.id}/edit`);
  } catch {
    ElMessage.error(t('paperForm.newVersionFailed'));
  }
}
</script>

<template>
  <div class="paper-form">
    <el-card shadow="never" class="composition-card">
      <template #header>
        <div class="composition-header">
          <div class="composition-meta">
            <span class="total-score">
              {{ t('paperForm.totalScore', { score: computedTotal }) }}
            </span>
            <el-tag v-if="paper" type="info">v{{ paper.version }}</el-tag>
            <span v-if="paper" class="question-count">
              {{ t('paperForm.questionCount', { count: localQuestions.length }) }}
            </span>
          </div>
          <div class="composition-actions">
            <el-button :icon="View" @click="showPreview">{{ t('paperForm.preview') }}</el-button>
            <el-button
              v-if="paper?.status === 'ACTIVE'"
              type="warning"
              @click="createNewVersion"
            >
              {{ t('paperForm.createNewVersion') }}
            </el-button>
            <el-button
              v-if="isEditable"
              type="primary"
              :icon="Plus"
              @click="pickerVisible = true"
            >
              {{ t('paperForm.addFromBank') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="scoreMismatch"
        type="warning"
        :title="t('paperForm.scoreMismatch', { expected: paper?.totalScore, actual: computedTotal })"
        show-icon
        :closable="false"
        class="score-alert"
      />

      <p v-if="isEditable" class="drag-hint">{{ t('paperForm.dragHint') }}</p>

      <el-empty v-if="!localQuestions.length" :description="t('paperForm.noQuestions')" />

      <draggable
        v-else
        v-model="localQuestions"
        item-key="questionId"
        handle=".drag-handle"
        :disabled="!isEditable || reordering"
        class="question-list"
        @end="onDragEnd"
      >
        <template #item="{ element: q, index }">
          <el-card shadow="hover" class="question-card" :body-style="{ padding: '12px 16px' }">
            <div class="question-row">
              <el-icon v-if="isEditable" class="drag-handle" :size="18"><Rank /></el-icon>
              <span v-else class="q-index">{{ index + 1 }}</span>

              <div class="question-body">
                <div class="question-top">
                  <el-tag :type="typeTagType(q.snapshot?.type)" size="small">
                    {{ typeLabel(q.snapshot?.type) }}
                  </el-tag>
                  <span class="question-stem">{{ truncate(q.snapshot?.stem) }}</span>
                </div>
              </div>

              <div class="question-score">
                <el-input-number
                  v-if="isEditable"
                  :model-value="q.score"
                  :min="0.5"
                  :max="100"
                  :step="0.5"
                  size="small"
                  controls-position="right"
                  @change="(v: number | undefined) => v != null && updateScore(q.questionId, v)"
                />
                <strong v-else>{{ q.score }}</strong>
              </div>

              <el-button
                v-if="isEditable"
                type="danger"
                link
                :icon="Delete"
                @click="removeQuestion(q.questionId)"
              />
            </div>
          </el-card>
        </template>
      </draggable>
    </el-card>

    <el-collapse v-model="activeNames" class="paper-form-attachment">
      <el-collapse-item :title="t('paperForm.sectionTitle')" name="attachment">
        <p class="hint">{{ t('paperForm.auditNote') }}</p>

        <div v-if="hasAttachment" class="current-file">
          <div class="file-meta">
            <strong>{{ attachment?.fileName }}</strong>
            <span class="size">{{ formatFileSize(attachment?.fileSize) }}</span>
            <span class="uploaded-at">
              {{ t('paperForm.uploadedAt', { date: formatUploadDate(attachment?.uploadedAt) }) }}
            </span>
          </div>
          <div class="file-actions">
            <el-button :icon="Download" @click="handleDownload">{{ t('paperForm.download') }}</el-button>
            <el-button
              v-if="isEditable"
              type="danger"
              plain
              :icon="Delete"
              :loading="uploading"
              @click="handleDeleteAttachment"
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

    <QuestionPickerDialog
      v-model:visible="pickerVisible"
      :exclude-ids="excludeQuestionIds"
      @select="onQuestionsSelected"
    />

    <el-dialog
      v-model="previewVisible"
      :title="t('paperForm.paperPreview')"
      width="720px"
      destroy-on-close
    >
      <el-tag type="info" class="preview-badge">{{ t('paperForm.previewDevOnly') }}</el-tag>
      <p class="preview-total">
        {{ t('paperForm.previewTotal', { score: paper?.totalScore ?? computedTotal }) }}
      </p>
      <div
        v-for="(q, i) in previewData?.questions ?? []"
        :key="i"
        class="preview-q"
      >
        <div class="preview-q-head">
          <span>{{ i + 1 }}.</span>
          <el-tag size="small" :type="typeTagType(q.type)">{{ typeLabel(q.type) }}</el-tag>
          <span class="preview-score">({{ q.score }} {{ t('common.pointsAbbr') }})</span>
        </div>
        <p class="preview-stem">{{ q.stem }}</p>
        <ul v-if="Array.isArray(q.options) && q.options.length" class="preview-options">
          <li v-for="(opt, oi) in q.options as Array<{ key?: string; label?: string; text?: string }>" :key="oi">
            {{ opt.key ? `${opt.key}. ` : '' }}{{ opt.label ?? opt.text }}
          </li>
        </ul>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.paper-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.composition-card :deep(.el-card__header) {
  padding-bottom: 12px;
}

.composition-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.composition-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.total-score {
  font-weight: 600;
  font-size: 15px;
}

.question-count {
  color: #6b7280;
  font-size: 13px;
}

.composition-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.score-alert {
  margin-bottom: 12px;
}

.drag-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #9ca3af;
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-card {
  border: 1px solid #e5e7eb;
}

.question-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drag-handle {
  cursor: grab;
  color: #9ca3af;
  flex-shrink: 0;
}

.drag-handle:active {
  cursor: grabbing;
}

.q-index {
  min-width: 18px;
  font-weight: 600;
  color: #6b7280;
}

.question-body {
  flex: 1;
  min-width: 0;
}

.question-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.question-stem {
  font-size: 14px;
  line-height: 1.45;
  color: #374151;
}

.question-score {
  flex-shrink: 0;
  width: 110px;
}

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

.preview-badge {
  margin-bottom: 12px;
}

.preview-total {
  font-weight: 600;
  margin: 0 0 16px;
}

.preview-q {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e5e7eb;
}

.preview-q-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-weight: 600;
}

.preview-score {
  font-weight: 400;
  color: #6b7280;
  font-size: 13px;
}

.preview-stem {
  margin: 0 0 8px;
  line-height: 1.5;
}

.preview-options {
  margin: 0;
  padding-left: 20px;
  color: #4b5563;
}
</style>
