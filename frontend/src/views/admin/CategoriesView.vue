<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import {
  createCategory,
  deleteCategory,
  ExamCategory,
  fetchCategories,
  fetchCategoryOptions,
  CategoryOption,
  updateCategory,
  updateCategoryStatus,
} from '@/api/categories';

const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const list = ref<ExamCategory[]>([]);
const parentOptions = ref<CategoryOption[]>([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();

const filters = reactive({
  search: '',
  status: 'ALL' as string,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

const sort = reactive({
  prop: 'createdAt',
  order: 'descending' as 'ascending' | 'descending' | null,
});

const form = reactive({
  name: '',
  description: '',
  parentId: null as string | null,
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
});

const rules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('categories.nameRequired'), trigger: 'blur' },
    { min: 1, max: 100, message: t('categories.nameLength'), trigger: 'blur' },
  ],
}));

const statusOptions = computed(() => [
  { label: t('common.all'), value: 'ALL' },
  { label: t('common.active'), value: 'ACTIVE' },
  { label: t('status.inactive'), value: 'DISABLED' },
]);

const dialogTitle = computed(() =>
  isEdit.value ? t('categories.editTitle') : t('categories.createTitle'),
);

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusTagType(status: string) {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DISABLED') return 'info';
  return 'warning';
}

function statusDisplay(status: string) {
  if (status === 'ACTIVE') return t('common.active');
  if (status === 'DISABLED') return t('status.inactive');
  return status;
}

async function loadList() {
  loading.value = true;
  try {
    const { data } = await fetchCategories({
      search: filters.search || undefined,
      status: filters.status,
      page: pagination.page,
      pageSize: pagination.pageSize,
      sortBy: sort.prop,
      sortOrder: sort.order === 'ascending' ? 'asc' : 'desc',
    });
    list.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('categories.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadParentOptions(excludeId?: string) {
  const { data } = await fetchCategoryOptions(excludeId);
  parentOptions.value = data;
}

function resetForm() {
  form.name = '';
  form.description = '';
  form.parentId = null;
  form.status = 'ACTIVE';
  editingId.value = null;
  formRef.value?.clearValidate();
}

function openCreate() {
  isEdit.value = false;
  resetForm();
  loadParentOptions();
  dialogVisible.value = true;
}

async function openEdit(row: ExamCategory) {
  isEdit.value = true;
  editingId.value = row.id;
  form.name = row.name;
  form.description = row.description ?? '';
  form.parentId = row.parentId;
  form.status = row.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
  await loadParentOptions(row.id);
  dialogVisible.value = true;
}

async function submitForm() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      parentId: form.parentId || null,
      status: form.status,
    };

    if (isEdit.value && editingId.value) {
      await updateCategory(editingId.value, payload);
      ElMessage.success(t('categories.updated'));
    } else {
      await createCategory(payload);
      ElMessage.success(t('categories.created'));
    }

    dialogVisible.value = false;
    await loadList();
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
        ?.message ?? t('categories.saveFailed');
    ElMessage.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: ExamCategory) {
  const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';

  try {
    await ElMessageBox.confirm(
      next === 'ACTIVE'
        ? t('categories.toggleEnableConfirm', { name: row.name })
        : t('categories.toggleDisableConfirm', { name: row.name }),
      next === 'ACTIVE' ? t('categories.enableTitle') : t('categories.disableTitle'),
      { type: 'warning' },
    );
    await updateCategoryStatus(row.id, next);
    ElMessage.success(next === 'ACTIVE' ? t('categories.enabled') : t('categories.disabled'));
    await loadList();
  } catch {
    // cancelled or failed
  }
}

async function confirmDelete(row: ExamCategory) {
  if (row.counts.exams > 0) {
    await ElMessageBox.alert(
      t('categories.deletionBlockedMessage', { name: row.name, count: row.counts.exams }),
      t('categories.deletionBlocked'),
      { type: 'error' },
    );
    return;
  }

  const warnings: string[] = [];
  if (row.counts.children > 0) warnings.push(t('categories.hasChildren', { count: row.counts.children }));
  if (row.counts.questions > 0) warnings.push(t('categories.hasQuestions', { count: row.counts.questions }));
  if (row.counts.papers > 0) warnings.push(t('categories.hasPapers', { count: row.counts.papers }));

  const extra =
    warnings.length > 0
      ? `\n\n${t('categories.deleteNote', { items: warnings.join(', ') })}`
      : '';

  try {
    await ElMessageBox.confirm(
      t('categories.deleteConfirm', { name: row.name, extra }),
      t('categories.deleteTitle'),
      { type: 'warning', confirmButtonText: t('common.archive') },
    );
    await deleteCategory(row.id);
    ElMessage.success(t('categories.archived'));
    await loadList();
  } catch (err: unknown) {
    const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
    if (data?.message) {
      ElMessage.error(data.message);
    }
  }
}

function onSearch() {
  pagination.page = 1;
  loadList();
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  sort.prop = prop || 'createdAt';
  sort.order = (order as typeof sort.order) ?? 'descending';
  loadList();
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

onMounted(loadList);
</script>

<template>
  <div class="categories-page">
    <div class="page-header">
      <div>
        <h2>{{ t('categories.title') }}</h2>
        <p class="subtitle">{{ t('categories.subtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">{{ t('categories.newCategory') }}</el-button>
    </div>

    <el-card shadow="never" class="toolbar-card">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('categories.searchPlaceholder')"
            clearable
            :prefix-icon="Search"
            style="width: 240px"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="filters.status" style="width: 140px" @change="onSearch">
            <el-option
              v-for="opt in statusOptions"
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
        v-loading="loading"
        :data="list"
        stripe
        @sort-change="onSortChange"
      >
        <el-table-column prop="name" :label="t('categories.colName')" sortable="custom" min-width="180" />
        <el-table-column prop="description" :label="t('categories.colDescription')" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.description || '—' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('categories.colParent')" min-width="160">
          <template #default="{ row }">
            {{ row.parent?.name || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('categories.colStatus')" sortable="custom" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusDisplay(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" :label="t('categories.colCreatedDate')" sortable="custom" width="170">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('categories.colActions')" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
            <el-button
              link
              :type="row.status === 'ACTIVE' ? 'warning' : 'success'"
              @click="toggleStatus(row)"
            >
              {{ row.status === 'ACTIVE' ? t('common.disable') : t('common.enable') }}
            </el-button>
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

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="520px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item :label="t('common.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('categories.namePlaceholder')" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :placeholder="t('categories.descriptionPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('common.parentCategory')">
          <el-select
            v-model="form.parentId"
            :placeholder="t('common.noneTopLevel')"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="opt in parentOptions"
              :key="opt.id"
              :label="opt.name"
              :value="opt.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="form.status">
            <el-radio value="ACTIVE">{{ t('common.active') }}</el-radio>
            <el-radio value="DISABLED">{{ t('status.inactive') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">
          {{ isEdit ? t('common.saveChanges') : t('common.create') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.categories-page {
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
.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
