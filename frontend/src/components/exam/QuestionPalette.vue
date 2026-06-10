<script setup lang="ts">
import { computed } from 'vue';
import type { PaletteStatus } from '@/utils/examAnswers';

const props = defineProps<{
  total: number;
  currentIndex: number;
  statuses: PaletteStatus[];
  compact?: boolean;
}>();

const emit = defineEmits<{
  select: [index: number];
}>();

const legend = [
  { status: 'unvisited', label: 'Not visited' },
  { status: 'answered', label: 'Answered' },
  { status: 'marked', label: 'Marked' },
  { status: 'answered-marked', label: 'Both' },
] as const;

const gridClass = computed(() => (props.compact ? 'palette-grid compact' : 'palette-grid'));
</script>

<template>
  <div class="palette">
    <div :class="gridClass">
      <button
        v-for="(_, index) in total"
        :key="index"
        type="button"
        class="palette-item"
        :class="[statuses[index], { active: index === currentIndex }]"
        :aria-label="`Question ${index + 1}`"
        @click="emit('select', index)"
      >
        {{ index + 1 }}
      </button>
    </div>
    <div class="legend">
      <span v-for="item in legend" :key="item.status" class="legend-item">
        <i :class="['dot', item.status]" />
        {{ item.label }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.palette-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.palette-grid.compact {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.palette-item {
  min-height: 40px;
  min-width: 40px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  color: #374151;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.palette-item.active {
  box-shadow: 0 0 0 2px #2563eb;
  transform: scale(1.03);
}
.palette-item.unvisited {
  background: #f3f4f6;
  border-color: #d1d5db;
}
.palette-item.answered {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}
.palette-item.marked {
  background: #ffedd5;
  border-color: #fdba74;
  color: #9a3412;
}
.palette-item.answered-marked {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  font-size: 12px;
  color: #6b7280;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  display: inline-block;
  border: 1px solid #d1d5db;
}
.dot.unvisited { background: #f3f4f6; }
.dot.answered { background: #dcfce7; border-color: #86efac; }
.dot.marked { background: #ffedd5; border-color: #fdba74; }
.dot.answered-marked { background: #dbeafe; border-color: #93c5fd; }

@media (max-width: 768px) {
  .palette-item {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
