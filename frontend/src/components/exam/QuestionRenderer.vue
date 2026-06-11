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

function selectSingle(key: string) {
  singleKey.value = key;
}

function toggleMulti(key: string) {
  const set = new Set(multiKeys.value);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  multiKeys.value = [...set];
}
</script>

<template>
  <div class="question-renderer">
    <!-- Single choice: large tappable cards -->
    <template v-if="question.type === 'SINGLE_CHOICE'">
      <button
        v-for="opt in options"
        :key="opt.key"
        type="button"
        class="option-card"
        :class="{ selected: singleKey === opt.key }"
        :aria-pressed="singleKey === opt.key"
        @click="selectSingle(opt.key)"
      >
        <span class="option-key">{{ opt.key }}</span>
        <span class="option-label">{{ opt.label }}</span>
        <span class="option-indicator radio" :class="{ checked: singleKey === opt.key }" />
      </button>
    </template>

    <!-- True/False: two large side-by-side buttons -->
    <template v-else-if="question.type === 'TRUE_FALSE'">
      <div class="tf-row">
        <button
          v-for="opt in options"
          :key="opt.key"
          type="button"
          class="tf-btn"
          :class="{ selected: singleKey === opt.key }"
          :aria-pressed="singleKey === opt.key"
          @click="selectSingle(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>
    </template>

    <!-- Multiple choice: checkbox cards -->
    <template v-else-if="question.type === 'MULTIPLE_CHOICE'">
      <button
        v-for="opt in options"
        :key="opt.key"
        type="button"
        class="option-card"
        :class="{ selected: multiKeys.includes(opt.key) }"
        :aria-pressed="multiKeys.includes(opt.key)"
        @click="toggleMulti(opt.key)"
      >
        <span class="option-key">{{ opt.key }}</span>
        <span class="option-label">{{ opt.label }}</span>
        <span
          class="option-indicator checkbox"
          :class="{ checked: multiKeys.includes(opt.key) }"
        />
      </button>
    </template>

    <!-- Fill in blank: mobile-friendly native inputs -->
    <template v-else-if="question.type === 'FILL_BLANK'">
      <div v-for="(_, index) in blankCount" :key="index" class="blank-row">
        <label :for="`blank-${question.id}-${index}`" class="blank-label">
          {{ t('student.blankLabel', { n: index + 1 }) }}
        </label>
        <input
          :id="`blank-${question.id}-${index}`"
          class="mobile-input"
          type="text"
          inputmode="text"
          enterkeyhint="next"
          autocomplete="off"
          autocapitalize="off"
          :value="blankAnswers[index]"
          :placeholder="t('student.answerPlaceholder')"
          @input="updateBlank(index, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </template>

    <!-- Short answer: large textarea -->
    <textarea
      v-else-if="question.type === 'SHORT_ANSWER'"
      v-model="textValue"
      class="mobile-textarea"
      rows="4"
      inputmode="text"
      enterkeyhint="done"
      autocomplete="off"
      :placeholder="t('student.shortAnswerPlaceholder')"
    />
  </div>
</template>

<style scoped>
.question-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 14px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 16px;
  line-height: 1.45;
  color: #111827;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.option-card:active {
  transform: scale(0.99);
}

.option-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 1px #2563eb;
}

.option-key {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #f3f4f6;
  font-weight: 700;
  font-size: 14px;
  color: #374151;
}

.option-card.selected .option-key {
  background: #2563eb;
  color: #fff;
}

.option-label {
  flex: 1;
  min-width: 0;
}

.option-indicator {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 2px solid #9ca3af;
  transition: border-color 0.15s, background 0.15s;
}

.option-indicator.radio {
  border-radius: 50%;
}

.option-indicator.checkbox {
  border-radius: 6px;
}

.option-indicator.checked {
  border-color: #2563eb;
  background: #2563eb;
  box-shadow: inset 0 0 0 3px #fff;
}

.tf-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tf-btn {
  min-height: 56px;
  padding: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  font-size: 18px;
  font-weight: 700;
  color: #374151;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.tf-btn.selected {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.tf-btn:active {
  transform: scale(0.98);
}

.blank-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blank-label {
  font-size: 14px;
  font-weight: 600;
  color: #4b5563;
}

.mobile-input,
.mobile-textarea {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  font-size: 16px;
  line-height: 1.5;
  color: #111827;
  background: #fff;
  -webkit-appearance: none;
  appearance: none;
}

.mobile-input:focus,
.mobile-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.mobile-textarea {
  min-height: 140px;
  resize: vertical;
}

@media (min-width: 769px) {
  .option-card {
    min-height: 48px;
  }
}
</style>
