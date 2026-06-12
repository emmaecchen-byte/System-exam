<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { QuestionFilled } from '@element-plus/icons-vue';
import type { ExamFormData } from '@/api/exams';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const props = defineProps<{
  modelValue: ExamFormData;
  disabled?: boolean;
  saving?: boolean;
  categories: Array<{ id: string; name: string }>;
  papers: Array<{ id: string; label: string; totalScore: number }>;
  showPublish?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ExamFormData];
  save: [];
  publish: [];
}>();

const { t } = useI18n();
const { categoryName, paperLabel } = useSeedDataLabels();

const form = computed({
  get: () => props.modelValue,
  set: (value: ExamFormData) => emit('update:modelValue', value),
});

const selectedPaper = computed(() => props.papers.find((p) => p.id === form.value.paperId));
</script>

<template>
  <el-form label-width="180px" :disabled="disabled">
    <el-form-item :label="t('examEdit.title')" required>
      <el-input v-model="form.title" />
    </el-form-item>
    <el-form-item :label="t('common.description')">
      <el-input v-model="form.description" type="textarea" :rows="2" />
    </el-form-item>
    <el-form-item :label="t('examEdit.category')" required>
      <el-select v-model="form.categoryId" filterable style="width: 100%">
        <el-option
          v-for="c in categories"
          :key="c.id"
          :label="categoryName(c.id, c.name)"
          :value="c.id"
        />
      </el-select>
    </el-form-item>
    <el-form-item :label="t('examEdit.paperPublished')" required>
      <el-select v-model="form.paperId" filterable style="width: 100%">
        <el-option
          v-for="p in papers"
          :key="p.id"
          :label="paperLabel(p.label)"
          :value="p.id"
        />
      </el-select>
      <p v-if="selectedPaper" class="hint">
        {{ t('examEdit.paperTotal', { score: selectedPaper.totalScore }) }}
      </p>
    </el-form-item>
    <el-form-item :label="t('examEdit.passScore')" required>
      <el-input-number v-model="form.passScore" :min="1" :max="selectedPaper?.totalScore ?? 999" />
    </el-form-item>
    <el-form-item :label="t('examEdit.duration')" required>
      <el-input-number v-model="form.durationMinutes" :min="1" :max="480" />
    </el-form-item>
    <el-form-item :label="t('examEdit.allowRetake')">
      <el-switch v-model="form.allowRetake" />
    </el-form-item>
    <el-form-item v-if="form.allowRetake" :label="t('examEdit.maxAttempts')">
      <el-input-number v-model="form.maxAttempts" :min="2" :max="10" />
    </el-form-item>

    <el-form-item>
      <el-checkbox v-model="form.randomQuestionOrder">
        {{ t('examEdit.randomQuestionOrder') }}
        <el-tooltip :content="t('examEdit.randomOrderTooltip')" placement="top">
          <el-icon class="random-order-tooltip"><QuestionFilled /></el-icon>
        </el-tooltip>
      </el-checkbox>
    </el-form-item>
    <el-form-item>
      <el-checkbox v-model="form.randomOptionOrder">
        {{ t('examEdit.randomOptionOrder') }}
        <el-tooltip :content="t('examEdit.randomOrderTooltip')" placement="top">
          <el-icon class="random-order-tooltip"><QuestionFilled /></el-icon>
        </el-tooltip>
      </el-checkbox>
    </el-form-item>

    <el-form-item>
      <el-button type="primary" :loading="saving" @click="emit('save')">
        {{ t('examEdit.saveExam') }}
      </el-button>
      <el-button v-if="showPublish" type="success" @click="emit('publish')">
        {{ t('examEdit.publish') }}
      </el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.random-order-tooltip {
  margin-left: 4px;
  vertical-align: middle;
  color: var(--el-text-color-secondary);
}
</style>
