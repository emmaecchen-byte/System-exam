<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import {
  confirmQuestionImport,
  downloadQuestionTemplate,
  ImportValidateResult,
  validateQuestionImport,
} from '@/api/questions';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { categoryName } = useSeedDataLabels();

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [boolean]; imported: [] }>();

const step = ref<'upload' | 'preview' | 'done'>('upload');
const file = ref<File | null>(null);
const validating = ref(false);
const importing = ref(false);
const skipInvalid = ref(true);
const validation = ref<ImportValidateResult | null>(null);
const importSummary = ref('');

function close() {
  emit('update:visible', false);
  setTimeout(reset, 300);
}

function reset() {
  step.value = 'upload';
  file.value = null;
  validation.value = null;
  importSummary.value = '';
}

function onFileChange(uploadFile: { raw?: File }) {
  file.value = uploadFile.raw ?? null;
}

async function validate() {
  if (!file.value) {
    ElMessage.warning(t('import.selectFile'));
    return;
  }
  validating.value = true;
  try {
    const { data } = await validateQuestionImport(file.value);
    validation.value = data;
    step.value = 'preview';
  } catch {
    ElMessage.error(t('import.validateFailed'));
  } finally {
    validating.value = false;
  }
}

async function confirmImport() {
  if (!file.value) return;
  importing.value = true;
  try {
    const { data } = await confirmQuestionImport(file.value, skipInvalid.value);
    importSummary.value =
      data.summary ?? t('import.importedCount', { count: data.importedCount });
    step.value = 'done';
    emit('imported');
    ElMessage.success(importSummary.value);
  } catch {
    ElMessage.error(t('import.importFailed'));
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('import.title')"
    width="720px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @closed="reset"
  >
    <div v-if="step === 'upload'" class="step">
      <el-button type="primary" link @click="downloadQuestionTemplate">
        {{ t('import.downloadExcelTemplate') }}
      </el-button>
      <p class="hint">{{ t('import.uploadHint') }}</p>
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls,.pdf,.docx"
        @change="onFileChange"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          {{ t('import.dragHintPrefix') }} <em>{{ t('import.dragHintAction') }}</em>
        </div>
      </el-upload>
    </div>

    <div v-else-if="step === 'preview' && validation" class="step">
      <el-row :gutter="12" class="stats">
        <el-col :span="6">
          <el-statistic :title="t('import.statTotal')" :value="validation.totalRows" />
        </el-col>
        <el-col :span="6">
          <el-statistic :title="t('import.statValid')" :value="validation.validCount" />
        </el-col>
        <el-col :span="6">
          <el-statistic :title="t('import.statInvalid')" :value="validation.invalidCount" />
        </el-col>
        <el-col :span="6">
          <el-statistic :title="t('import.statDuplicates')" :value="validation.duplicateWarnings" />
        </el-col>
      </el-row>

      <el-alert
        v-if="validation.answerKeyVoided"
        type="warning"
        show-icon
        :closable="false"
        class="format-alert"
        :title="t('import.answerKeyVoidedTitle')"
        :description="t('import.answerKeyVoidedDesc')"
      />

      <el-alert
        v-if="validation.detectedFormat"
        :title="t('import.detectedFormat', { format: validation.detectedFormat })"
        :description="
          validation.defaultCategoryName
            ? t('import.defaultCategoryHint', { name: validation.defaultCategoryName })
            : undefined
        "
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 12px"
      />

      <h4>{{ t('import.previewTitle') }}</h4>
      <el-table :data="validation.preview" size="small" stripe max-height="280">
        <el-table-column prop="row" :label="t('import.colRow')" width="60" />
        <el-table-column :label="t('import.statValid')" width="70">
          <template #default="{ row }">
            <el-tag :type="row.valid ? 'success' : 'danger'" size="small">
              {{ row.valid ? t('common.yes') : t('common.no') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('questions.colStem')" min-width="200">
          <template #default="{ row }">
            {{ row.data?.stem ?? row.errors.join('; ') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('questions.colCategory')" width="140">
          <template #default="{ row }">
            {{ row.data?.categoryName ? categoryName(undefined, row.data.categoryName) : '—' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('questions.colPoints')" width="60">
          <template #default="{ row }">{{ row.data?.score ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('import.colDup')" width="60">
          <template #default="{ row }">
            <el-tag v-if="row.duplicateWarning" type="warning" size="small">!</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        v-if="validation.errors.length"
        :title="t('import.validationErrors', { count: validation.errors.length })"
        type="error"
        show-icon
        :closable="false"
        style="margin-top: 12px"
      >
        <ul class="error-list">
          <li v-for="(e, i) in validation.errors.slice(0, 8)" :key="i">
            {{ t('import.rowError', { row: e.row, message: e.message }) }}
          </li>
          <li v-if="validation.errors.length > 8">
            {{ t('import.andMoreErrors', { count: validation.errors.length - 8 }) }}
          </li>
        </ul>
      </el-alert>

      <el-checkbox v-model="skipInvalid" style="margin-top: 12px">
        {{ t('import.skipInvalidOnly') }}
      </el-checkbox>
    </div>

    <div v-else-if="step === 'done'" class="step">
      <el-result icon="success" :title="t('import.complete')" :sub-title="importSummary" />
    </div>

    <template #footer>
      <el-button @click="close">{{ step === 'done' ? t('common.close') : t('common.cancel') }}</el-button>
      <el-button v-if="step === 'upload'" type="primary" :loading="validating" @click="validate">
        {{ t('import.validatePreview') }}
      </el-button>
      <el-button
        v-if="step === 'preview'"
        type="primary"
        :loading="importing"
        :disabled="validation?.validCount === 0"
        @click="confirmImport"
      >
        {{ t('import.confirmImport') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hint {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}
.upload-icon {
  font-size: 48px;
  color: #9ca3af;
}
.stats {
  margin-bottom: 8px;
}
.error-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
