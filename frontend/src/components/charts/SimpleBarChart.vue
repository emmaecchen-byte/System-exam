<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  data: Array<{ label: string; value: number }>;
  valueSuffix?: string;
  barColor?: string;
}>();

const max = computed(() => Math.max(...props.data.map((d) => d.value), 1));
</script>

<template>
  <div class="bar-chart">
    <div v-for="item in data" :key="item.label" class="bar-row">
      <span class="bar-label">{{ item.label }}</span>
      <div class="bar-track">
        <div
          class="bar-fill"
          :style="{
            width: `${(item.value / max) * 100}%`,
            background: barColor ?? '#2563eb',
          }"
        />
      </div>
      <span class="bar-value">{{ item.value }}{{ valueSuffix ?? '' }}</span>
    </div>
    <p v-if="!data.length" class="empty">No data</p>
  </div>
</template>

<style scoped>
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar-row {
  display: grid;
  grid-template-columns: 72px 1fr 48px;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.bar-label {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  height: 10px;
  background: #f3f4f6;
  border-radius: 999px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 999px;
  min-width: 2px;
  transition: width 0.3s ease;
}
.bar-value {
  text-align: right;
  font-weight: 600;
  color: #111827;
}
.empty {
  margin: 0;
  color: #9ca3af;
  font-size: 14px;
}
</style>
