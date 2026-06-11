<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableInstance } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Plus, Search, Upload } from '@element-plus/icons-vue';
import { fetchCategoryOptions } from '@/api/categories';
import {
  deleteQuestion,
  fetchQuestions,
  Question,
} from '@/api/questions';
import QuestionFormDialog from '@/components/QuestionFormDialog.vue';
import QuestionImportDialog from '@/components/QuestionImportDialog.vue';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { questionType, difficulty, questionTypeOptions } = useLocalizedLabels();
const { categoryName } = useSeedDataLabels();
const localizedQuestionTypes = computed(() => questionTypeOptions());
const loading = ref(false);
const selectingAll = ref(false);
const deleting = ref(false);
const isSyncingSelection = ref(false);
const tableRef = ref<TableInstance>();
const list = ref<Question[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const selectedCount = computed(() => selectedIds.value.size);

/** Backend caps pageSize at 100 — paginate when fetching every ID for Select All. */
const SELECT_ALL_PAGE_SIZE = 100;
const categories = ref<Array<{ id: string; name: string }>>([]);
const formVisible = ref(false);
const importVisible = ref(false);
const editingQuestion = ref<Question | null>(null);

const filters = reactive({
  search: '',
  categoryId: '',
  type: '',
  status: 'ALL',
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

const statusFilterOptions = computed(() => [
  { label: t('common.all'), value: 'ALL' },
  { label: t('common.active'), value: 'ACTIVE' },
  { label: t('status.inactive'), value: 'DISABLED' },
]);

async function loadCategories() {
  const { data } = await fetchCategoryOptions();
  categories.value = data;
}

async function loadList() {
  loading.value = true;
  try {
    const { data } = await fetchQuestions({
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      type: filters.type || undefined,
      status: filters.status,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    list.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('questions.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
  clearSelection();
  loadList();
}

function currentFilterParams() {
  return {
    search: filters.search || undefined,
    categoryId: filters.categoryId || undefined,
    type: filters.type || undefined,
    status: filters.status,
  };
}

function syncTableSelection() {
  nextTick(() => {
    if (!tableRef.value) return;
    isSyncingSelection.value = true;
    tableRef.value.clearSelection();
    list.value.forEach((row) => {
      if (selectedIds.value.has(row.id)) {
        tableRef.value!.toggleRowSelection(row, true);
      }
    });
    nextTick(() => {
      isSyncingSelection.value = false;
    });
  });
}

function onSelectionChange(rows: Question[]) {
  if (isSyncingSelection.value) return;

  const pageIds = list.value.map((q) => q.id);
  const selectedOnPage = new Set(rows.map((r) => r.id));
  const next = new Set(selectedIds.value);
  for (const id of pageIds) {
    if (selectedOnPage.has(id)) next.add(id);
    else next.delete(id);
  }
  selectedIds.value = next;
}

function clearSelection() {
  selectedIds.value = new Set();
  isSyncingSelection.value = true;
  tableRef.value?.clearSelection();
  nextTick(() => {
    isSyncingSelection.value = false;
  });
}

async function fetchAllQuestionIds(): Promise<string[]> {
  const ids: string[] = [];
  const totalPages = Math.max(1, Math.ceil(pagination.total / SELECT_ALL_PAGE_SIZE));

  for (let page = 1; page <= totalPages; page++) {
    const { data } = await fetchQuestions({
      ...currentFilterParams(),
      page,
      pageSize: SELECT_ALL_PAGE_SIZE,
    });
    ids.push(...data.data.map((q) => q.id));
    if (data.data.length < SELECT_ALL_PAGE_SIZE) break;
  }

  return ids;
}

async function selectAllMatching() {
  if (pagination.total === 0) return;
  selectingAll.value = true;
  try {
    const ids = await fetchAllQuestionIds();
    selectedIds.value = new Set(ids);
    syncTableSelection();

    if (selectedIds.value.size !== pagination.total) {
      ElMessage.warning(
        t('questions.selectAllPartialFull', {
          selected: selectedIds.value.size,
          total: pagination.total,
        }),
      );
    } else {
      ElMessage.success(t('questions.selectedAll', { count: selectedIds.value.size }));
    }
  } catch {
    ElMessage.error(t('questions.selectAllFailed'));
  } finally {
    selectingAll.value = false;
  }
}

async function confirmBulkDelete() {
  if (selectedCount.value === 0) return;
  try {
    await ElMessageBox.confirm(
      t('questions.bulkDeleteConfirmFull', { count: selectedCount.value }),
      t('questions.bulkDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.delete') },
    );
  } catch {
    return;
  }

  deleting.value = true;
  let ok = 0;
  let failed = 0;
  for (const id of selectedIds.value) {
    try {
      await deleteQuestion(id);
      ok++;
    } catch {
      failed++;
    }
  }
  deleting.value = false;

  if (ok) ElMessage.success(t('questions.deleted', { count: ok }));
  if (failed) {
    ElMessage.warning(t('questions.deletePartial', { count: failed }));
  }
  clearSelection();
  loadList();
}

watch(list, syncTableSelection);

function openCreate() {
  editingQuestion.value = null;
  formVisible.value = true;
}

function openEdit(row: Question) {
  editingQuestion.value = row;
  formVisible.value = true;
}

async function confirmDelete(row: Question) {
  try {
    await ElMessageBox.confirm(
      t('questions.deleteOneConfirm', { stem: row.stem.slice(0, 60) }),
      t('questions.deleteOneTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
      },
    );
    await deleteQuestion(row.id);
    ElMessage.success(t('questions.deletedOne'));
    loadList();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (msg) ElMessage.error(msg);
  }
}

function onPageChange(page: number) {
  pagination.page = page;
  loadList();
}

function onSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadList();
}

function statusTag(status: string) {
  return status === 'ACTIVE' ? 'success' : 'info';
}

onMounted(async () => {
  await loadCategories();
  await loadList();
});
</script>

<template>
  <div class="questions-page">
    <div class="page-header">
      <div>
        <h2>{{ t('questions.title') }}</h2>
        <p class="subtitle">{{ t('questions.subtitle') }}</p>
      </div>
      <div class="actions">
        <el-button
          :loading="selectingAll"
          :disabled="pagination.total === 0"
          @click="selectAllMatching"
        >
          {{ t('questions.selectAllCount', { count: pagination.total }) }}
        </el-button>
        <el-button
          v-if="selectedCount > 0"
          type="danger"
          :icon="Delete"
          :loading="deleting"
          @click="confirmBulkDelete"
        >
          {{ t('questions.deleteSelected', { count: selectedCount }) }}
        </el-button>
        <el-button v-if="selectedCount > 0" @click="clearSelection">{{ t('common.clearSelection') }}</el-button>
        <el-button :icon="Upload" @click="importVisible = true">{{ t('common.import') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">{{ t('questions.newQuestion') }}</el-button>
      </div>
    </div>

    <el-card shadow="never" class="toolbar">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('questions.searchPlaceholderStem')"
            clearable
            :prefix-icon="Search"
            style="width: 200px"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item :label="t('common.category')">
          <el-select v-model="filters.categoryId" clearable :placeholder="t('common.all')" style="width: 180px" @change="onSearch">
            <el-option v-for="c in categories" :key="c.id" :label="categoryName(c.id, c.name)" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('questions.colType')">
          <el-select v-model="filters.type" clearable :placeholder="t('common.all')" style="width: 160px" @change="onSearch">
            <el-option v-for="typeOpt in localizedQuestionTypes" :key="typeOpt.value" :label="typeOpt.label" :value="typeOpt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="filters.status" style="width: 120px" @change="onSearch">
            <el-option
              v-for="opt in statusFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">{{ t('common.search') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="list"
        stripe
        row-key="id"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column :label="t('questions.colType')" width="130">
          <template #default="{ row }">{{ questionType(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="stem" :label="t('questions.colStem')" min-width="280" show-overflow-tooltip />
        <el-table-column :label="t('questions.colCategory')" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ categoryName(row.category?.id, row.category?.name) }}</template>
        </el-table-column>
        <el-table-column prop="score" :label="t('questions.colPoints')" width="70" />
        <el-table-column :label="t('questions.colDifficulty')" width="100">
          <template #default="{ row }">{{ difficulty(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column :label="t('questions.colStatus')" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">
              {{ row.status === 'ACTIVE' ? t('common.active') : t('status.inactive') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('questions.colTags')" width="140" show-overflow-tooltip>
          <template #default="{ row }">
            {{ (row.tagsJson ?? []).join(', ') || '—' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('questions.colActions')" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
            <el-button link type="danger" @click="confirmDelete(row)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <QuestionFormDialog
      v-model:visible="formVisible"
      :question="editingQuestion"
      @saved="loadList"
    />
    <QuestionImportDialog v-model:visible="importVisible" @imported="loadList" />
  </div>
</template>

<style scoped>
.questions-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.toolbar :deep(.el-card__body) {
  padding-bottom: 2px;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
