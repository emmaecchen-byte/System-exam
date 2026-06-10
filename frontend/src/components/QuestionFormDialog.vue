<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, FormInstance, FormRules } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { fetchCategoryOptions } from '@/api/categories';
import {
  createQuestion,
  QUESTION_TYPES,
  Question,
  QuestionFormData,
  QuestionOption,
  QuestionType,
  updateQuestion,
} from '@/api/questions';

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  question?: Question | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  saved: [];
}>();

const formRef = ref<FormInstance>();
const saving = ref(false);
const categories = ref<Array<{ id: string; name: string }>>([]);

const isEdit = computed(() => !!props.question);

const form = reactive({
  categoryId: '',
  type: 'SINGLE_CHOICE' as QuestionType,
  stem: '',
  score: 2,
  explanation: '',
  scoringRubric: '',
  difficulty: 2,
  tagsInput: '',
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  options: [{ key: 'A', label: '' }, { key: 'B', label: '' }] as QuestionOption[],
  singleAnswer: 'A',
  multiAnswers: [] as string[],
  trueFalseAnswer: 'T',
  fillAnswers: [''] as string[],
  shortReference: '',
});

const rules = computed<FormRules>(() => ({
  categoryId: [{ required: true, message: t('questionForm.categoryRequired'), trigger: 'change' }],
  type: [{ required: true, message: t('questionForm.typeRequired'), trigger: 'change' }],
  stem: [{ required: true, message: t('questionForm.stemRequired'), trigger: 'blur' }],
  score: [{ required: true, message: t('questionForm.pointsRequired'), trigger: 'blur' }],
}));

const showOptions = computed(() =>
  ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(form.type),
);

const dialogTitle = computed(() =>
  isEdit.value ? t('questionForm.editTitle') : t('questionForm.newTitle'),
);

watch(
  () => props.visible,
  async (open) => {
    if (!open) return;
    const { data } = await fetchCategoryOptions();
    categories.value = data;
    if (props.question) {
      loadQuestion(props.question);
    } else {
      resetForm();
    }
  },
);

watch(
  () => form.type,
  (type) => {
    if (type === 'TRUE_FALSE') {
      form.options = [
        { key: 'T', label: 'True' },
        { key: 'F', label: 'False' },
      ];
    } else if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      if (form.options.length < 2) {
        form.options = [
          { key: 'A', label: '' },
          { key: 'B', label: '' },
        ];
      }
    }
  },
);

function resetForm() {
  form.categoryId = '';
  form.type = 'SINGLE_CHOICE';
  form.stem = '';
  form.score = 2;
  form.explanation = '';
  form.scoringRubric = '';
  form.difficulty = 2;
  form.tagsInput = '';
  form.status = 'ACTIVE';
  form.options = [{ key: 'A', label: '' }, { key: 'B', label: '' }];
  form.singleAnswer = 'A';
  form.multiAnswers = [];
  form.trueFalseAnswer = 'T';
  form.fillAnswers = [''];
  form.shortReference = '';
  formRef.value?.clearValidate();
}

function loadQuestion(q: Question) {
  form.categoryId = q.categoryId;
  form.type = q.type;
  form.stem = q.stem;
  form.score = q.score;
  form.explanation = q.explanation ?? '';
  form.scoringRubric = q.scoringRubric ?? '';
  form.difficulty = q.difficulty;
  form.tagsInput = (q.tagsJson ?? []).join(', ');
  form.status = q.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';

  const answer = q.standardAnswerJson ?? {};
  if (q.type === 'SINGLE_CHOICE') {
    form.options = (q.optionsJson as QuestionOption[]) ?? [];
    form.singleAnswer = String(answer.key ?? 'A');
  } else if (q.type === 'MULTIPLE_CHOICE') {
    form.options = (q.optionsJson as QuestionOption[]) ?? [];
    form.multiAnswers = (answer.keys as string[]) ?? [];
  } else if (q.type === 'TRUE_FALSE') {
    form.trueFalseAnswer = String(answer.key ?? 'T');
  } else if (q.type === 'FILL_BLANK') {
    form.fillAnswers = (answer.answers as string[])?.length
      ? (answer.answers as string[])
      : [String(answer.text ?? '')];
  } else if (q.type === 'SHORT_ANSWER') {
    form.shortReference = String(answer.reference ?? answer.text ?? '');
  }
}

function addOption() {
  const nextKey = String.fromCharCode(65 + form.options.length);
  form.options.push({ key: nextKey, label: '' });
}

function removeOption(index: number) {
  if (form.options.length <= 2) {
    ElMessage.warning(t('questionForm.minOptions'));
    return;
  }
  const removed = form.options[index].key;
  form.options.splice(index, 1);
  form.options.forEach((o, i) => {
    o.key = String.fromCharCode(65 + i);
  });
  if (form.singleAnswer === removed) form.singleAnswer = form.options[0]?.key ?? 'A';
  form.multiAnswers = form.multiAnswers.filter((k) => k !== removed);
}

function addFillAnswer() {
  form.fillAnswers.push('');
}

function removeFillAnswer(index: number) {
  if (form.fillAnswers.length <= 1) return;
  form.fillAnswers.splice(index, 1);
}

function buildPayload(): QuestionFormData {
  let optionsJson: QuestionOption[] | undefined;
  let standardAnswerJson: Record<string, unknown> = {};
  let scoringRubric = form.scoringRubric.trim() || undefined;

  if (form.type === 'SINGLE_CHOICE') {
    optionsJson = form.options.map((o) => ({ key: o.key, label: o.label.trim() }));
    standardAnswerJson = { key: form.singleAnswer };
  } else if (form.type === 'MULTIPLE_CHOICE') {
    optionsJson = form.options.map((o) => ({ key: o.key, label: o.label.trim() }));
    standardAnswerJson = { keys: form.multiAnswers };
  } else if (form.type === 'TRUE_FALSE') {
    optionsJson = [
      { key: 'T', label: 'True' },
      { key: 'F', label: 'False' },
    ];
    standardAnswerJson = { key: form.trueFalseAnswer };
  } else if (form.type === 'FILL_BLANK') {
    const answers = form.fillAnswers.map((a) => a.trim()).filter(Boolean);
    standardAnswerJson = { answers };
  } else if (form.type === 'SHORT_ANSWER') {
    standardAnswerJson = { reference: form.shortReference.trim() };
    if (!scoringRubric) scoringRubric = form.shortReference.trim();
  }

  const tagsJson = form.tagsInput
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    categoryId: form.categoryId,
    type: form.type,
    stem: form.stem.trim(),
    optionsJson,
    standardAnswerJson,
    score: Number(form.score),
    explanation: form.explanation.trim() || undefined,
    scoringRubric,
    difficulty: form.difficulty,
    tagsJson,
    status: form.status,
  };
}

async function submit(forceDuplicate = false) {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  if (showOptions.value && form.options.some((o) => !o.label.trim())) {
    ElMessage.error(t('questionForm.allOptionsLabeled'));
    return;
  }
  if (form.type === 'MULTIPLE_CHOICE' && form.multiAnswers.length === 0) {
    ElMessage.error(t('questionForm.selectCorrectAnswer'));
    return;
  }
  if (form.type === 'FILL_BLANK' && !form.fillAnswers.some((a) => a.trim())) {
    ElMessage.error(t('questionForm.addAcceptableAnswer'));
    return;
  }
  if (form.type === 'SHORT_ANSWER' && !form.scoringRubric.trim() && !form.shortReference.trim()) {
    ElMessage.error(t('questionForm.shortAnswerRubricRequired'));
    return;
  }

  saving.value = true;
  try {
    const payload = buildPayload();
    if (isEdit.value && props.question) {
      await updateQuestion(props.question.id, payload);
      ElMessage.success(t('questionForm.updated'));
    } else {
      await createQuestion({ ...payload, forceDuplicate });
      ElMessage.success(t('questionForm.created'));
    }
    emit('saved');
    emit('update:visible', false);
  } catch (err: unknown) {
    const res = (err as { response?: { status?: number; data?: { message?: string; warning?: boolean } } })
      ?.response;
    if (res?.status === 409 && res.data?.warning && !forceDuplicate) {
      saving.value = false;
      const { ElMessageBox } = await import('element-plus');
      try {
        await ElMessageBox.confirm(
          t('questionForm.duplicateConfirm'),
          t('questionForm.duplicateTitle'),
          { type: 'warning' },
        );
        return submit(true);
      } catch {
        return;
      }
    }
    const msg = res?.data?.message ?? t('questionForm.saveFailed');
    ElMessage.error(typeof msg === 'string' ? msg : t('questionForm.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:visible', false);
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="680px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
      <el-form-item :label="t('questionForm.questionType')" prop="type">
        <el-select v-model="form.type" style="width: 100%" :disabled="isEdit">
          <el-option
            v-for="qt in QUESTION_TYPES"
            :key="qt.value"
            :label="t(`questions.types.${qt.value}`)"
            :value="qt.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('common.category')" prop="categoryId">
        <el-select
          v-model="form.categoryId"
          filterable
          :placeholder="t('questionForm.selectCategory')"
          style="width: 100%"
        >
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('questionForm.questionStem')" prop="stem">
        <el-input
          v-model="form.stem"
          type="textarea"
          :rows="4"
          :placeholder="t('questionForm.enterQuestionText')"
        />
      </el-form-item>

      <template v-if="showOptions">
        <el-form-item :label="t('questionForm.options')">
          <div class="options-list">
            <div v-for="(opt, idx) in form.options" :key="opt.key" class="option-row">
              <span class="option-key">{{ opt.key }}</span>
              <el-input v-model="opt.label" :placeholder="t('questionForm.optionText')" />
              <el-button
                :icon="Delete"
                circle
                type="danger"
                plain
                @click="removeOption(idx)"
              />
            </div>
            <el-button :icon="Plus" @click="addOption">{{ t('questionForm.addOption') }}</el-button>
          </div>
        </el-form-item>

        <el-form-item v-if="form.type === 'SINGLE_CHOICE'" :label="t('questionForm.correctAnswer')">
          <el-radio-group v-model="form.singleAnswer">
            <el-radio v-for="opt in form.options" :key="opt.key" :value="opt.key">
              {{ opt.key }} — {{ opt.label || t('questionForm.empty') }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-else :label="t('questionForm.correctAnswers')">
          <el-checkbox-group v-model="form.multiAnswers">
            <el-checkbox v-for="opt in form.options" :key="opt.key" :value="opt.key">
              {{ opt.key }} — {{ opt.label || t('questionForm.empty') }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </template>

      <el-form-item v-if="form.type === 'TRUE_FALSE'" :label="t('questionForm.correctAnswer')">
        <el-radio-group v-model="form.trueFalseAnswer">
          <el-radio value="T">{{ t('questionForm.true') }}</el-radio>
          <el-radio value="F">{{ t('questionForm.false') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <template v-if="form.type === 'FILL_BLANK'">
        <el-form-item :label="t('questionForm.acceptableAnswers')">
          <div class="options-list">
            <div v-for="(_, idx) in form.fillAnswers" :key="idx" class="option-row">
              <el-input
                v-model="form.fillAnswers[idx]"
                :placeholder="t('questionForm.acceptableAnswer')"
              />
              <el-button :icon="Delete" circle type="danger" plain @click="removeFillAnswer(idx)" />
            </div>
            <el-button :icon="Plus" @click="addFillAnswer">{{ t('questionForm.addAnswer') }}</el-button>
          </div>
        </el-form-item>
      </template>

      <template v-if="form.type === 'SHORT_ANSWER'">
        <el-form-item :label="t('questionForm.referenceAnswer')">
          <el-input
            v-model="form.shortReference"
            type="textarea"
            :rows="2"
            :placeholder="t('questionForm.modelAnswerPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('questionForm.scoringRubric')">
          <el-input
            v-model="form.scoringRubric"
            type="textarea"
            :rows="3"
            :placeholder="t('questionForm.rubricPlaceholder')"
          />
        </el-form-item>
      </template>

      <el-form-item :label="t('common.points')" prop="score">
        <el-input-number v-model="form.score" :min="0.5" :max="100" :step="0.5" />
      </el-form-item>

      <el-form-item :label="t('questionForm.difficulty')">
        <el-radio-group v-model="form.difficulty">
          <el-radio :value="1">{{ t('questionForm.easy') }}</el-radio>
          <el-radio :value="2">{{ t('questionForm.medium') }}</el-radio>
          <el-radio :value="3">{{ t('questionForm.hard') }}</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="t('questionForm.tags')">
        <el-input v-model="form.tagsInput" :placeholder="t('questionForm.tagsPlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('questionForm.explanation')">
        <el-input
          v-model="form.explanation"
          type="textarea"
          :rows="2"
          :placeholder="t('questionForm.explanationPlaceholder')"
        />
      </el-form-item>

      <el-form-item :label="t('questionForm.status')">
        <el-radio-group v-model="form.status">
          <el-radio value="ACTIVE">{{ t('questionForm.active') }}</el-radio>
          <el-radio value="DISABLED">{{ t('questionForm.inactive') }}</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit(false)">
        {{ isEdit ? t('common.save') : t('common.create') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.options-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.option-key {
  font-weight: 700;
  width: 24px;
  color: #6b7280;
}
</style>
