<script setup lang="ts">
import { onMounted, ref } from 'vue';
import api from '@/api/client';

const list = ref<unknown[]>([]);

onMounted(async () => {
  const { data } = await api.get('/admin/reviews/pending');
  list.value = data;
});
</script>

<template>
  <div>
    <h2>Grading Workbench</h2>
    <el-empty v-if="!list.length" description="No pending subjective answers" />
    <el-table v-else :data="list" stripe />
  </div>
</template>
