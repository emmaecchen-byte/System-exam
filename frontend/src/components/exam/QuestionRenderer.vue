<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExamQuestion } from '@/api/candidate';
import { blankCountFromStem } from '@/utils/examAnswers';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';

const props = defineProps<{
  question: ExamQuestion;
  modelValue: Record<string, unknown>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const { t } = useI18n();
const { trueFalseLabel } = useLocalizedLabels();

const options = computed(() => {
  if (props.question.type === 'TRUE_FALSE') {
    return (
      props.question.options ?? [
        { key: 'T', label: trueFalseLabel('T') },
        { key: 'F', label: trueFalseLabel('F') },
      ]
    );
  }
  return props.question.options ?? [];
});

const singleKey = computed({
  get: () => (props.modelValue.key as string) ?? '',
  set: (key: string) => emit('update:modelValue', { ...props.modelValue, key }),
});

const multiKeys = computed({
  get: () => (props.modelValue.keys as string[]) ?? [],
  set: (keys: string[]) => emit('update:modelValue', { ...props.modelValue, keys }),
});

const textValue = computed({
  get: () => (props.modelValue.text as string) ?? '',
  set: (text: string) => emit('update:modelValue', { ...props.modelValue, text }),
});

const blankCount = computed(() => blankCountFromStem(props.question.stem));

const blankAnswers = computed({
  get: () => {
    const current = props.modelValue.answers as string[] | undefined;
    if (Array.isArray(current) && current.length === blankCount.value) return current;
    return Array.from({ length: blankCount.value }, (_, i) => current?.[i] ?? '');
  },
  set: (answers: string[]) => emit('update:modelValue', { ...props.modelValue, answers }),
});

function updateBlank(index: number, value: string) {
  const next = [...blankAnswers.value];
  next[index] = value;
  blankAnswers.value = next;
}
</script>

<template>
  <div class="question-renderer">
    <template v-if="question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE'">
      <label
        v-for="opt in options"
        :key="opt.key"
        class="option-touch"
        :class="{ selected: singleKey === opt.key }"
      >
        <input v-model="singleKey" type="radio" :value="opt.key" class="native-input" />
        <span class="option-label">{{ opt.label }}</span>
      </label>
    </template>

    <template v-else-if="question.type === 'MULTIPLE_CHOICE'">
      <label
        v-for="opt in options"
        :key="opt.key"
        class="option-touch"
        :class="{ selected: multiKeys.includes(opt.key) }"
      >
        <input v-model="multiKeys" type="checkbox" :value="opt.key" class="native-input" />
        <span class="option-label">{{ opt.label }}</span>
      </label>
    </template>

    <template v-else-if="question.type === 'FILL_BLANK'">
      <div v-for="(_, index) in blankCount" :key="index" class="blank-row">
        <label :for="`blank-${question.id}-${index}`">{{ t('student.blankLabel', { n: index + 1 }) }}</label>
        <el-input
          :id="`blank-${question.id}-${index}`"
          :model-value="blankAnswers[index]"
          size="large"
          :placeholder="t('student.answerPlaceholder')"
          @update:model-value="updateBlank(index, $event)"
        />
      </div>
    </template>

    <el-input
      v-else-if="question.type === 'SHORT_ANSWER'"
      v-model="textValue"
      type="textarea"
      :rows="5"
      :placeholder="t('student.shortAnswerPlaceholder')"
      class="short-answer"
    />
  </div>
</template>

<style scoped>
.question-renderer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.option-touch {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.option-touch.selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.native-input {
  flex-shrink: 0;
}
.option-label {
  flex: 1;
  line-height: 1.4;
}
.blank-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.short-answer {
  width: 100%;
}
</style>
