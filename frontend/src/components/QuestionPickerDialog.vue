<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableInstance } from 'element-plus';
import { fetchCategoryOptions } from '@/api/categories';
import { fetchQuestions, Question } from '@/api/questions';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { questionType, difficulty, questionTypeOptions } = useLocalizedLabels();
const { categoryName } = useSeedDataLabels();

const props = defineProps<{
  visible: boolean;
  excludeIds?: string[];
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  select: [questions: Question[]];
}>();

const SELECT_ALL_PAGE_SIZE = 100;

const loading = ref(false);
const selectingAll = ref(false);
const isSyncingSelection = ref(false);
const list = ref<Question[]>([]);
const selected = ref<Question[]>([]);
const totalMatching = ref(0);
const tableRef = ref<TableInstance>();
const categories = ref<Array<{ id: string; name: string }>>([]);

const filters = reactive({
  search: '',
  categoryId: '',
  type: '',
  difficulty: '' as string | number,
});

function buildQuery(page: number, pageSize: number) {
  return {
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    type: filters.type || undefined,
    status: 'ACTIVE' as const,
    page,
    pageSize,
  };
}

function applyClientFilters(questions: Question[]) {
  let rows = questions.filter((q) => !props.excludeIds?.includes(q.id));
  if (filters.difficulty) {
    rows = rows.filter((q) => q.difficulty === Number(filters.difficulty));
  }
  return rows;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchQuestions(buildQuery(1, SELECT_ALL_PAGE_SIZE));
    totalMatching.value = data.meta.total;
    list.value = applyClientFilters(data.data);
    syncTableSelection(selected.value);
  } finally {
    loading.value = false;
  }
}

/** Backend caps pageSize at 100 — paginate to load every matching question. */
async function fetchAllMatchingQuestions(): Promise<Question[]> {
  const all: Question[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { data } = await fetchQuestions(buildQuery(page, SELECT_ALL_PAGE_SIZE));
    all.push(...data.data);
    totalPages = data.meta.totalPages;
    page += 1;
  } while (page <= totalPages);

  return applyClientFilters(all);
}

function syncTableSelection(rowsToSelect: Question[]) {
  const idsToSelect = new Set(rowsToSelect.map((q) => q.id));
  nextTick(() => {
    if (!tableRef.value) return;
    isSyncingSelection.value = true;
    tableRef.value.clearSelection();
    list.value.forEach((row) => {
      if (idsToSelect.has(row.id)) {
        tableRef.value!.toggleRowSelection(row, true);
      }
    });
    selected.value = rowsToSelect;
    nextTick(() => {
      isSyncingSelection.value = false;
    });
  });
}

async function selectAllMatching() {
  if (totalMatching.value === 0 && !list.value.length) return;

  selectingAll.value = true;
  try {
    const all = await fetchAllMatchingQuestions();
    if (!all.length) return;
    list.value = all;
    selected.value = all;
    syncTableSelection(all);
  } finally {
    selectingAll.value = false;
  }
}

function clearSelection() {
  selected.value = [];
  isSyncingSelection.value = true;
  tableRef.value?.clearSelection();
  nextTick(() => {
    isSyncingSelection.value = false;
  });
}

watch(
  () => props.visible,
  async (open) => {
    if (!open) return;
    selected.value = [];
    const { data } = await fetchCategoryOptions();
    categories.value = data;
    await load();
  },
);

function onSelectionChange(rows: Question[]) {
  if (isSyncingSelection.value) return;
  selected.value = rows;
}

function confirm() {
  emit('select', selected.value);
  emit('update:visible', false);
}

function close() {
  emit('update:visible', false);
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('questionPicker.title')"
    width="900px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form inline class="filters">
      <el-form-item>
        <el-input
          v-model="filters.search"
          :placeholder="t('questionPicker.searchStem')"
          clearable
          @clear="load"
        />
      </el-form-item>
      <el-form-item>
        <el-select
          v-model="filters.categoryId"
          clearable
          :placeholder="t('common.category')"
          @change="load"
        >
          <el-option v-for="c in categories" :key="c.id" :label="categoryName(c.id, c.name)" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select v-model="filters.type" clearable :placeholder="t('questions.colType')" @change="load">
          <el-option
            v-for="qt in questionTypeOptions()"
            :key="qt.value"
            :label="qt.label"
            :value="qt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select
          v-model="filters.difficulty"
          clearable
          :placeholder="t('questions.colDifficulty')"
          @change="load"
        >
          <el-option :label="t('questionForm.easy')" :value="1" />
          <el-option :label="t('questionForm.medium')" :value="2" />
          <el-option :label="t('questionForm.hard')" :value="3" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="load">{{ t('common.search') }}</el-button>
      </el-form-item>
      <el-form-item>
        <el-button
          :loading="selectingAll"
          :disabled="!list.length && totalMatching === 0"
          @click="selectAllMatching"
        >
          {{ t('questionPicker.selectAll') }}
        </el-button>
        <el-button :disabled="!selected.length" @click="clearSelection">
          {{ t('common.clearSelection') }}
        </el-button>
      </el-form-item>
    </el-form>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="list"
      row-key="id"
      max-height="400"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column :label="t('questions.colType')" width="120">
        <template #default="{ row }">{{ questionType(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="stem" :label="t('questions.colStem')" show-overflow-tooltip />
      <el-table-column prop="score" :label="t('questionPicker.defaultPts')" width="90" />
      <el-table-column :label="t('questions.colDifficulty')" width="90">
        <template #default="{ row }">{{ difficulty(row.difficulty) }}</template>
      </el-table-column>
      <el-table-column :label="t('questionPicker.tags')" width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ (row.tagsJson ?? []).join(', ') }}</template>
      </el-table-column>
    </el-table>

    <template #footer>
      <span class="selected-count">
        {{ t('questionPicker.selected', { count: selected.length }) }}
        <template v-if="list.length"> · {{ t('questionPicker.shown', { count: list.length }) }}</template>
      </span>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!selected.length" @click="confirm">
        {{ t('questionPicker.addSelected') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.filters {
  margin-bottom: 8px;
}
.selected-count {
  margin-right: 12px;
  color: #6b7280;
  font-size: 13px;
}
</style>
