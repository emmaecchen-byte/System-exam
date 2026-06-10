<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { AxiosError } from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { fetchCategoryOptions } from '@/api/categories';
import {
  archivePaper,
  unarchivePaper,
  createPaper,
  deletePaper,
  fetchPapers,
  PaperListItem,
} from '@/api/papers';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const list = ref<PaperListItem[]>([]);
const categories = ref<Array<{ id: string; name: string }>>([]);
const createVisible = ref(false);
const createForm = ref({ title: '', categoryId: '' });
const creating = ref(false);

const filters = reactive({
  search: '',
  categoryId: '',
  status: 'ALL',
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

const statusOptions = computed(() => [
  { label: t('common.all'), value: 'ALL' },
  { label: t('status.draft'), value: 'DRAFT' },
  { label: t('status.published'), value: 'ACTIVE' },
  { label: t('status.archived'), value: 'ARCHIVED' },
]);

function statusTagType(status: string) {
  if (status === 'DRAFT') return 'info';
  if (status === 'ACTIVE') return 'success';
  return 'warning';
}

async function loadCategories() {
  const { data } = await fetchCategoryOptions();
  categories.value = data;
}

async function loadList() {
  loading.value = true;
  try {
    const { data } = await fetchPapers({
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      status: filters.status,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    list.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('papers.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
  loadList();
}

async function submitCreate() {
  if (!createForm.value.title.trim() || !createForm.value.categoryId) {
    ElMessage.warning(t('papers.requiredFields'));
    return;
  }
  creating.value = true;
  try {
    const { data } = await createPaper({
      title: createForm.value.title.trim(),
      categoryId: createForm.value.categoryId,
    });
    createVisible.value = false;
    createForm.value = { title: '', categoryId: '' };
    router.push(`/papers/${data.id}/edit`);
  } catch {
    ElMessage.error(t('papers.createFailed'));
  } finally {
    creating.value = false;
  }
}

function editPaper(row: PaperListItem) {
  router.push(`/papers/${row.id}/edit`);
}

function deleteDisabledReason(row: PaperListItem): string | null {
  if (row.status === 'ACTIVE') {
    return t('papers.archiveBeforeDelete');
  }
  if (row.examCount > 0) {
    return t('papers.referencedByExams', { count: row.examCount });
  }
  if (row.status !== 'DRAFT' && row.status !== 'ARCHIVED') {
    return t('papers.cannotDelete');
  }
  return null;
}

async function deletePaperRow(row: PaperListItem) {
  const blocked = deleteDisabledReason(row);
  if (blocked) {
    ElMessage.warning(blocked);
    return;
  }

  try {
    await ElMessageBox.confirm(
      t('papers.deleteConfirm', { title: row.title, version: row.versionLabel }),
      t('papers.deleteTitle'),
      { type: 'warning' },
    );
    await deletePaper(row.id);
    ElMessage.success(t('papers.deleted'));
    loadList();
  } catch (err) {
    if (err === 'cancel' || (err as { message?: string })?.message === 'cancel') return;
    const axiosErr = err as AxiosError<{ message?: string | string[] }>;
    const msg = axiosErr.response?.data?.message;
    ElMessage.error(Array.isArray(msg) ? msg[0] : msg ?? t('papers.deleteFailed'));
  }
}

async function archivePaperRow(row: PaperListItem) {
  try {
    await ElMessageBox.confirm(
      t('papers.archiveConfirm', { title: row.title, version: row.versionLabel }),
      t('papers.archiveTitle'),
      { type: 'warning' },
    );
    await archivePaper(row.id);
    ElMessage.success(t('papers.archived'));
    loadList();
  } catch {
    /* cancelled */
  }
}

async function unarchivePaperRow(row: PaperListItem) {
  try {
    await ElMessageBox.confirm(
      t('papers.unarchiveConfirm', { title: row.title, version: row.versionLabel }),
      t('papers.unarchiveTitle'),
      { type: 'info', confirmButtonText: t('common.restore') },
    );
    await unarchivePaper(row.id);
    ElMessage.success(t('papers.restored'));
    loadList();
  } catch {
    /* cancelled */
  }
}

function formatDate(v: string) {
  return new Date(v).toLocaleString();
}

onMounted(async () => {
  await loadCategories();
  await loadList();
});
</script>

<template>
  <div class="papers-page">
    <div class="page-header">
      <div>
        <h2>{{ t('papers.title') }}</h2>
        <p class="subtitle">{{ t('papers.subtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="createVisible = true">{{ t('papers.newPaper') }}</el-button>
    </div>

    <el-card shadow="never" class="toolbar">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('papers.searchPlaceholder')"
            clearable
            :prefix-icon="Search"
            style="width: 200px"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item :label="t('common.category')">
          <el-select v-model="filters.categoryId" clearable :placeholder="t('common.all')" style="width: 180px" @change="onSearch">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="filters.status" style="width: 140px" @change="onSearch">
            <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">{{ t('common.search') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="title" :label="t('papers.colTitle')" min-width="200" />
        <el-table-column :label="t('papers.colCategory')" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.category?.name }}</template>
        </el-table-column>
        <el-table-column prop="versionLabel" :label="t('papers.colVersion')" width="90" />
        <el-table-column prop="totalScore" :label="t('papers.colTotalScore')" width="110" />
        <el-table-column :label="t('papers.colQuestions')" width="100">
          <template #default="{ row }">{{ row.questionCount }}</template>
        </el-table-column>
        <el-table-column :label="t('papers.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('papers.colLastModified')" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('papers.colActions')" width="140" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button link type="primary" @click="editPaper(row)">{{ t('common.edit') }}</el-button>
              <el-tooltip
                v-if="deleteDisabledReason(row)"
                :content="deleteDisabledReason(row)!"
                placement="top"
              >
                <span class="action-disabled-wrap">
                  <el-button link type="danger" disabled>{{ t('common.delete') }}</el-button>
                </span>
              </el-tooltip>
              <el-button v-else link type="danger" @click="deletePaperRow(row)">{{ t('common.delete') }}</el-button>
              <el-button
                v-if="row.status === 'ACTIVE'"
                link
                type="warning"
                @click="archivePaperRow(row)"
              >
                {{ t('common.archive') }}
              </el-button>
              <el-button
                v-if="row.status === 'ARCHIVED'"
                link
                type="success"
                @click="unarchivePaperRow(row)"
              >
                {{ t('common.unarchive') }}
              </el-button>
            </div>
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
          @current-change="(p: number) => { pagination.page = p; loadList(); }"
          @size-change="(s: number) => { pagination.pageSize = s; pagination.page = 1; loadList(); }"
        />
      </div>
    </el-card>

    <el-dialog v-model="createVisible" :title="t('papers.createTitle')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('common.title')" required>
          <el-input v-model="createForm.title" :placeholder="t('papers.createPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('common.category')" required>
          <el-select v-model="createForm.categoryId" filterable style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">{{ t('papers.createAndEdit') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.papers-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
.toolbar :deep(.el-card__body) {
  padding-bottom: 2px;
}
.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.action-buttons {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.action-disabled-wrap {
  display: inline-block;
}
</style>
