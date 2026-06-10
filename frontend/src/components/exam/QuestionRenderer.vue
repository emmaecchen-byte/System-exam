<script setup lang="ts">
import { computed } from 'vue';
import type { ExamQuestion } from '@/api/candidate';
import { blankCountFromStem } from '@/utils/examAnswers';

const props = defineProps<{
  question: ExamQuestion;
  modelValue: Record<string, unknown>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const options = computed(() => {
  if (props.question.type === 'TRUE_FALSE') {
    return (
      props.question.options ?? [
        { key: 'T', label: 'True' },
        { key: 'F', label: 'False' },
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
        <label :for="`blank-${question.id}-${index}`">Blank {{ index + 1 }}</label>
        <el-input
          :id="`blank-${question.id}-${index}`"
          :model-value="blankAnswers[index]"
          size="large"
          placeholder="Your answer"
          @update:model-value="updateBlank(index, $event)"
        />
      </div>
    </template>

    <el-input
      v-else-if="question.type === 'SHORT_ANSWER'"
      v-model="textValue"
      type="textarea"
      :rows="5"
      placeholder="Type your answer"
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
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
}
.option-touch.selected {
  border-color: #2563eb;
  background: #eff6ff;
}
.native-input {
  width: 20px;
  height: 20px;
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
.blank-row label {
  font-size: 13px;
  color: #6b7280;
}
.short-answer :deep(textarea) {
  font-size: 16px;
}
</style>
