<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { useExamListBasePath } from '@/composables/useExamListBasePath';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import { fetchCategoryOptions } from '@/api/categories';
import {
  archiveExam,
  closeExam,
  deleteExam,
  ExamListItem,
  ExamSession,
  fetchExamSessions,
  fetchExams,
  publishExam,
} from '@/api/exams';
import QrCodeDialog from '@/components/QrCodeDialog.vue';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { examStatus } = useLocalizedLabels();
const { categoryName, examTitle, paperLabel } = useSeedDataLabels();
const router = useRouter();
const auth = useAuthStore();
const examBasePath = useExamListBasePath();
const isExamAdminPortal = computed(() => auth.primaryRole === ROLES.EXAM_ADMIN);
const loading = ref(false);
const list = ref<ExamListItem[]>([]);
const categories = ref<Array<{ id: string; name: string }>>([]);

const qrDialogVisible = ref(false);
const qrSession = ref<{ id: string; name: string } | null>(null);
const sessionPickerVisible = ref(false);
const qrLoadingExamId = ref<string | null>(null);
const sessionPickerExamTitle = ref('');
const sessionPickerOptions = ref<ExamSession[]>([]);

const filters = reactive({ search: '', categoryId: '', status: 'ALL' });
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });

const statusOptions = computed(() => [
  { label: t('status.allActive'), value: 'ALL' },
  { label: t('status.draft'), value: 'DRAFT' },
  { label: t('status.published'), value: 'PUBLISHED' },
  { label: t('status.inProgress'), value: 'IN_PROGRESS' },
  { label: t('status.pendingGrading'), value: 'PENDING_GRADING' },
  { label: t('status.closed'), value: 'COMPLETED' },
  { label: t('status.archived'), value: 'ARCHIVED' },
]);

function statusTag(status: string) {
  if (status === 'DRAFT') return 'info';
  if (status === 'PUBLISHED') return 'success';
  if (status === 'IN_PROGRESS') return 'warning';
  if (status === 'PENDING_GRADING') return '';
  if (status === 'COMPLETED') return 'info';
  if (status === 'ARCHIVED') return 'info';
  return '';
}

function canDelete(row: ExamListItem) {
  return row.status === 'DRAFT';
}

function canPublish(row: ExamListItem) {
  return row.status === 'DRAFT' || row.status === 'READY';
}

function canClose(row: ExamListItem) {
  return row.status === 'PUBLISHED' || row.status === 'IN_PROGRESS';
}

function canArchive(row: ExamListItem) {
  return row.status !== 'DRAFT' && row.status !== 'ARCHIVED';
}

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchExams({
      ...filters,
      search: filters.search || undefined,
      categoryId: filters.categoryId || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    list.value = data.data;
    pagination.total = data.meta.total;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
  load();
}

function createExam() {
  router.push(`${examBasePath.value}/new/edit`);
}

function editExam(row: ExamListItem) {
  router.push(`${examBasePath.value}/${row.id}/edit`);
}

function openQrSession(session: Pick<ExamSession, 'id' | 'name'>) {
  qrSession.value = { id: session.id, name: session.name };
  sessionPickerVisible.value = false;
  qrDialogVisible.value = true;
}

async function openQrForExam(row: ExamListItem) {
  if (row.sessionCount === 0) {
    ElMessage.warning(t('exams.addSessionFirst'));
    return;
  }

  qrLoadingExamId.value = row.id;
  try {
    const { data: sessions } = await fetchExamSessions(row.id);
    if (!sessions.length) {
      ElMessage.warning(t('exams.noSessions'));
      return;
    }
    if (sessions.length === 1) {
      openQrSession(sessions[0]);
      return;
    }
    sessionPickerExamTitle.value = row.title;
    sessionPickerOptions.value = sessions;
    sessionPickerVisible.value = true;
  } catch {
    ElMessage.error(t('exams.loadSessionsFailed'));
  } finally {
    qrLoadingExamId.value = null;
  }
}

function canShowQr(row: ExamListItem) {
  return row.sessionCount > 0 && row.status !== 'ARCHIVED';
}

function apiErrorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  return msg ?? fallback;
}

async function publish(row: ExamListItem) {
  if (row.sessionCount === 0) {
    ElMessage.warning(t('exams.addSessionBeforePublish'));
    return;
  }
  if (row.participantCount === 0) {
    ElMessage.warning(t('exams.assignParticipantsBeforePublish'));
    return;
  }

  try {
    await ElMessageBox.confirm(t('exams.publishConfirm'), t('exams.publishTitle'));
  } catch {
    return;
  }

  try {
    await publishExam(row.id);
    ElMessage.success(t('exams.published'));
    load();
  } catch (err: unknown) {
    ElMessage.error(apiErrorMessage(err, t('exams.publishFailed')));
  }
}

async function closeExamRow(row: ExamListItem) {
  try {
    await ElMessageBox.confirm(t('exams.closeConfirm'), t('exams.closeTitle'));
    await closeExam(row.id);
    ElMessage.success(t('exams.closed'));
    load();
  } catch { /* cancelled */ }
}

async function archiveRow(row: ExamListItem) {
  try {
    await ElMessageBox.confirm(
      t('exams.archiveConfirm', { title: row.title }),
      t('exams.archiveTitle'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await archiveExam(row.id);
    ElMessage.success(t('exams.archived'));
    load();
  } catch (err: unknown) {
    ElMessage.error(apiErrorMessage(err, t('exams.archiveFailed')));
  }
}

async function deleteRow(row: ExamListItem) {
  try {
    await ElMessageBox.confirm(
      t('exams.deleteConfirm', { title: row.title }),
      t('exams.deleteTitle'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteExam(row.id);
    ElMessage.success(t('exams.deleted'));
    load();
  } catch (err: unknown) {
    ElMessage.error(apiErrorMessage(err, t('exams.deleteFailed')));
  }
}

onMounted(async () => {
  const { data } = await fetchCategoryOptions();
  categories.value = data;
  await load();
});
</script>

<template>
  <div class="exams-page">
    <div class="page-header">
      <div>
        <h2>{{ isExamAdminPortal ? t('exams.sessionsTitle') : t('exams.title') }}</h2>
        <p class="subtitle">
          {{
            isExamAdminPortal
              ? t('exams.sessionsSubtitle')
              : t('exams.subtitle')
          }}
        </p>
      </div>
      <el-button type="primary" :icon="Plus" @click="createExam">{{ t('exams.newExam') }}</el-button>
    </div>

    <el-card shadow="never" class="toolbar">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('common.search')">
          <el-input v-model="filters.search" clearable :prefix-icon="Search" @clear="onSearch" />
        </el-form-item>
        <el-form-item :label="t('common.category')">
          <el-select v-model="filters.categoryId" clearable @change="onSearch">
            <el-option v-for="c in categories" :key="c.id" :label="categoryName(c.id, c.name)" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="filters.status" style="width: 200px" @change="onSearch">
            <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">{{ t('common.search') }}</el-button>
        </el-form-item>
      </el-form>
      <p v-if="filters.status === 'ALL'" class="filter-hint">
        {{ t('exams.archivedHint') }}
      </p>
      <p v-else-if="filters.status === 'DRAFT'" class="filter-hint">
        {{ t('exams.draftHint') }}
      </p>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column :label="t('exams.colTitle')" min-width="180">
          <template #default="{ row }">{{ examTitle(row.id, row.title) }}</template>
        </el-table-column>
        <el-table-column :label="t('exams.colCategory')" width="150">
          <template #default="{ row }">{{ categoryName(row.category?.id, row.category?.name) }}</template>
        </el-table-column>
        <el-table-column :label="t('exams.colPaper')" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ paperLabel(row.paper?.label) }}</template>
        </el-table-column>
        <el-table-column :label="t('exams.colQrCode')" width="100" align="center">
          <template #default="{ row }">
            <el-button
              v-if="canShowQr(row)"
              link
              type="primary"
              :loading="qrLoadingExamId === row.id"
              @click="openQrForExam(row)"
            >
              {{ t('exams.showQr') }}
            </el-button>
            <el-tooltip
              v-else-if="row.sessionCount === 0"
              :content="t('exams.qrTooltip')"
              placement="top"
            >
              <span class="qr-muted">—</span>
            </el-tooltip>
            <span v-else class="qr-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="passScore" :label="t('common.passScore')" width="90" />
        <el-table-column prop="durationMinutes" :label="t('common.duration')" width="80" />
        <el-table-column :label="t('exams.colSessions')" width="90">
          <template #default="{ row }">{{ row.sessionCount }}</template>
        </el-table-column>
        <el-table-column :label="t('exams.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ examStatus(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('exams.colUpdated')" width="170">
          <template #default="{ row }">{{ new Date(row.updatedAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column :label="t('exams.colActions')" width="300" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button link type="primary" @click="editExam(row)">
                {{ row.status === 'ARCHIVED' ? t('common.view') : t('common.edit') }}
              </el-button>
              <el-button v-if="canPublish(row)" link type="success" @click="publish(row)">{{ t('common.publish') }}</el-button>
              <el-button v-if="canClose(row)" link type="warning" @click="closeExamRow(row)">{{ t('exams.close') }}</el-button>
              <el-button v-if="canArchive(row)" link @click="archiveRow(row)">{{ t('common.archive') }}</el-button>
              <el-button v-if="canDelete(row)" link type="danger" @click="deleteRow(row)">{{ t('common.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </el-card>

    <el-dialog v-model="sessionPickerVisible" :title="t('exams.qrDialogTitle', { title: sessionPickerExamTitle })" width="420px">
      <p class="picker-hint">{{ t('exams.qrPickerHint') }}</p>
      <div class="session-picker-list">
        <el-button
          v-for="s in sessionPickerOptions"
          :key="s.id"
          class="session-picker-item"
          @click="openQrSession(s)"
        >
          <span class="session-picker-name">{{ s.name }}</span>
          <span class="session-picker-meta">
            {{ new Date(s.startTime).toLocaleDateString() }}
            · {{ t('exams.participantCount', { count: s.participantCount }) }}
          </span>
        </el-button>
      </div>
    </el-dialog>

    <QrCodeDialog
      v-if="qrSession"
      v-model:visible="qrDialogVisible"
      :session-id="qrSession.id"
      :session-name="qrSession.name"
    />
  </div>
</template>

<style scoped>
.exams-page { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
.page-header h2 { margin: 0 0 4px; }
.subtitle { margin: 0; color: #6b7280; font-size: 14px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.filter-hint {
  margin: 0 0 4px;
  font-size: 13px;
  color: #6b7280;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.qr-muted {
  color: #c0c4cc;
}
.picker-hint {
  margin: 0 0 12px;
  color: #6b7280;
  font-size: 14px;
}
.session-picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.session-picker-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: auto;
  padding: 12px 16px;
  width: 100%;
}
.session-picker-name {
  font-weight: 600;
}
.session-picker-meta {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
</style>
