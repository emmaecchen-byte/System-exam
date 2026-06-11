<script setup lang="ts">
import * as echarts from 'echarts';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { EChartsOption } from 'echarts';

const props = defineProps<{
  option: EChartsOption;
  height?: string;
}>();

const chartEl = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;

function render() {
  if (!chartEl.value) return;
  chart ??= echarts.init(chartEl.value);
  chart.setOption(props.option, true);
}

function onResize() {
  chart?.resize();
}

watch(() => props.option, render, { deep: true });

onMounted(() => {
  render();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="chartEl" class="echart" :style="{ height: height ?? '320px' }" />
</template>

<style scoped>
.echart {
  width: 100%;
}
</style>
