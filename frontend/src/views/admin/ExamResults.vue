<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Download, Edit } from '@element-plus/icons-vue';
import {
  ExamDetail,
  fetchExam,
  publishExamResults,
  unpublishExamResults,
} from '@/api/exams';
import {
  ExamResultStats,
  exportExamResults,
  fetchExamStats,
  fetchResults,
  fetchResultsFilters,
  regradeAttempt,
  ResultRow,
} from '@/api/results';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import { useExamListBasePath } from '@/composables/useExamListBasePath';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const auth = useAuthStore();
const { examTitle, personName, departmentName } = useSeedDataLabels();
const { passResult, gradingStatusFromAttempt } = useLocalizedLabels();
const examBasePath = useExamListBasePath();

const examId = computed(() => route.params.examId as string);
const loading = ref(false);
const tableLoading = ref(false);
const exporting = ref(false);
const publishing = ref(false);
const exam = ref<ExamDetail | null>(null);
const stats = ref<ExamResultStats | null>(null);
const rows = ref<ResultRow[]>([]);
const departments = ref<Array<{ id: string; name: string }>>([]);

const filters = reactive({
  result: 'ALL' as string,
  departmentIds: [] as string[],
  gradingStatus: 'ALL' as string,
});

const sort = reactive({
  sortBy: 'submittedAt' as 'submittedAt' | 'totalScore',
  sortOrder: 'desc' as 'asc' | 'desc',
});

const pagination = reactive({ page: 1, pageSize: 20, total: 0 });

const correctionVisible = ref(false);
const correcting = ref(false);
const correctionTarget = ref<ResultRow | null>(null);
const correctionFormRef = ref<FormInstance>();
const correctionForm = reactive({
  adjustedScore: 0,
  reason: '',
});

const isPublished = computed(() => Boolean(exam.value?.resultsPublished));

const canCorrect = computed(
  () =>
    auth.hasPermission('result:correct') &&
    auth.hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN),
);

const correctionRules = computed<FormRules>(() => ({
  adjustedScore: [{ required: true, message: 'Score is required', trigger: 'blur' }],
  reason: [{ required: true, message: t('examResults.correctionReasonRequired'), trigger: 'blur' }],
}));

const resultOptions = computed(() => [
  { label: t('results.gradingAll'), value: 'ALL' },
  { label: t('common.pass'), value: 'PASS' },
  { label: t('common.fail'), value: 'FAIL' },
  { label: t('common.pending'), value: 'PENDING' },
]);

const statusOptions = computed(() => [
  { label: t('results.gradingAll'), value: 'ALL' },
  { label: t('examResults.statusPending'), value: 'NOT_STARTED' },
  { label: t('results.gradingInProgress'), value: 'IN_PROGRESS' },
  { label: t('examResults.statusCompleted'), value: 'COMPLETED' },
]);

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  return msg ?? fallback;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function resultTagType(code: string) {
  if (code === 'PASS') return 'success';
  if (code === 'FAIL') return 'danger';
  return 'warning';
}

function gradingTagType(status: string) {
  if (status === 'COMPLETED') return 'success';
  if (status === 'GRADING') return 'warning';
  return 'info';
}

function buildQuery() {
  return {
    examId: examId.value,
    departmentIds: filters.departmentIds.length ? filters.departmentIds : undefined,
    result: filters.result === 'ALL' ? undefined : filters.result,
    gradingStatus: filters.gradingStatus === 'ALL' ? undefined : filters.gradingStatus,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

async function loadStats() {
  const { data } = await fetchExamStats(examId.value);
  stats.value = data;
}

async function loadTable() {
  tableLoading.value = true;
  try {
    const { data } = await fetchResults(buildQuery());
    rows.value = data.data;
    pagination.total = data.meta.total;
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('results.loadFailed')));
  } finally {
    tableLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const [examRes] = await Promise.all([
      fetchExam(examId.value),
      loadStats(),
      loadTable(),
    ]);
    exam.value = examRes.data;
    const filtersRes = await fetchResultsFilters();
    departments.value = filtersRes.data.departments;
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('examResults.loadFailed')));
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  pagination.page = 1;
  loadTable();
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  if (prop === 'totalScore' && order) {
    sort.sortBy = 'totalScore';
    sort.sortOrder = order === 'ascending' ? 'asc' : 'desc';
    loadTable();
    return;
  }
  if (prop === 'submissionTime' && order) {
    sort.sortBy = 'submittedAt';
    sort.sortOrder = order === 'ascending' ? 'asc' : 'desc';
    loadTable();
  }
}

function onPageChange(page: number) {
  pagination.page = page;
  loadTable();
}

function onSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadTable();
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportExamResults(examId.value);
  } catch {
    ElMessage.error(t('examResults.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

function openCorrection(row: ResultRow) {
  correctionTarget.value = row;
  correctionForm.adjustedScore = row.totalScore;
  correctionForm.reason = '';
  correctionVisible.value = true;
}

async function submitCorrection() {
  const valid = await correctionFormRef.value?.validate().catch(() => false);
  if (!valid || !correctionTarget.value) return;

  correcting.value = true;
  try {
    await regradeAttempt(correctionTarget.value.attemptId, {
      reason: correctionForm.reason.trim(),
      newScore: correctionForm.adjustedScore,
    });
    ElMessage.success(t('examResults.scoreCorrected'));
    correctionVisible.value = false;
    await Promise.all([loadStats(), loadTable()]);
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('examResults.scoreCorrectFailed')));
  } finally {
    correcting.value = false;
  }
}

async function publishResults() {
  try {
    await ElMessageBox.confirm(
      t('examEdit.publishResultsConfirm'),
      t('examEdit.publishResultsTitle'),
      { type: 'warning', confirmButtonText: t('examEdit.publishResults') },
    );
  } catch {
    return;
  }

  publishing.value = true;
  try {
    const { data } = await publishExamResults(examId.value);
    ElMessage.success(
      t('examEdit.publishResultsSuccess', { count: data.publishedCount ?? 0 }),
    );
    await load();
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('examEdit.publishResultsFailed')));
  } finally {
    publishing.value = false;
  }
}

async function unpublishResults() {
  try {
    await ElMessageBox.confirm(
      t('examEdit.unpublishResultsConfirm'),
      t('examEdit.unpublishResultsTitle'),
      { type: 'warning', confirmButtonText: t('examEdit.unpublishResults') },
    );
  } catch {
    return;
  }

  publishing.value = true;
  try {
    await unpublishExamResults(examId.value);
    ElMessage.success(t('examEdit.unpublishResultsSuccess'));
    await load();
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('examEdit.unpublishResultsFailed')));
  } finally {
    publishing.value = false;
  }
}

function goBack() {
  router.push(`${examBasePath.value}/${examId.value}/edit`);
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="exam-results-page">
    <div class="page-header">
      <div>
        <el-button link @click="goBack">{{ t('examResults.backToExam') }}</el-button>
        <h2>{{ t('examResults.title') }}</h2>
        <p v-if="exam" class="subtitle">{{ examTitle(examId, exam.title) }}</p>
      </div>
      <div class="header-badges">
        <el-tag v-if="isPublished" type="success" size="large">
          {{ t('examResults.statusPublished') }}
        </el-tag>
        <el-tag v-else type="warning" size="large">
          {{ t('examResults.statusDraft') }}
        </el-tag>
      </div>
    </div>

    <el-card shadow="never" class="publish-card">
      <h3>{{ t('examResults.publishSectionTitle') }}</h3>
      <p class="hint">{{ t('examResults.publishSectionDesc') }}</p>
      <p v-if="exam?.resultsPublishedAt" class="published-meta">
        {{
          t('examEdit.resultsPublishedAt', {
            date: new Date(exam.resultsPublishedAt).toLocaleString(),
            name: exam.resultsPublishedBy?.name ?? '—',
          })
        }}
      </p>
      <div class="actions">
        <el-button
          v-if="!isPublished"
          type="success"
          size="large"
          :loading="publishing"
          @click="publishResults"
        >
          {{ t('examEdit.publishResults') }}
        </el-button>
        <el-button
          v-else
          type="danger"
          size="large"
          plain
          :loading="publishing"
          @click="unpublishResults"
        >
          {{ t('examEdit.unpublishResults') }}
        </el-button>
      </div>
    </el-card>

    <el-row v-if="stats" :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.totalParticipants') }}</p>
          <p class="stat-value">{{ stats.totalParticipants }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.completedCount') }}</p>
          <p class="stat-value">{{ stats.completedCount }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.passRate') }}</p>
          <p class="stat-value success">{{ stats.passRate }}%</p>
          <el-progress :percentage="stats.passRate" :stroke-width="8" status="success" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.failRate') }}</p>
          <p class="stat-value danger">{{ stats.failRate }}%</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.avgScore') }}</p>
          <p class="stat-value">{{ stats.avgScore }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.highestScore') }}</p>
          <p class="stat-value">{{ stats.highestScore }}</p>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6" :lg="4">
        <el-card shadow="hover" class="stat-card">
          <p class="stat-label">{{ t('examResults.lowestScore') }}</p>
          <p class="stat-value">{{ stats.lowestScore }}</p>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="table-card">
      <div class="table-header">
        <h3>{{ t('examResults.resultsTable') }}</h3>
        <el-button
          type="primary"
          :icon="Download"
          :loading="exporting"
          @click="handleExport"
        >
          {{ t('examResults.exportExcel') }}
        </el-button>
      </div>

      <el-form inline class="filters" @submit.prevent="onFilterChange">
        <el-form-item :label="t('results.colResult')">
          <el-select v-model="filters.result" style="width: 120px" @change="onFilterChange">
            <el-option v-for="o in resultOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colDepartment')">
          <el-select
            v-model="filters.departmentIds"
            multiple
            collapse-tags
            clearable
            :placeholder="t('results.allDepartments')"
            style="width: 220px"
            @change="onFilterChange"
          >
            <el-option
              v-for="d in departments"
              :key="d.id"
              :label="departmentName(d.id, d.name)"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colGradingStatus')">
          <el-select v-model="filters.gradingStatus" style="width: 140px" @change="onFilterChange">
            <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table
        v-loading="tableLoading"
        :data="rows"
        stripe
        @sort-change="onSortChange"
      >
        <el-table-column :label="t('results.colCandidateName')" min-width="140">
          <template #default="{ row }">
            {{ personName({ employeeNo: row.employeeNo, name: row.candidateName }) }}
          </template>
        </el-table-column>
        <el-table-column prop="employeeNo" :label="t('results.colEmployeeNo')" width="120" />
        <el-table-column :label="t('results.colDepartment')" width="130">
          <template #default="{ row }">{{ departmentName(undefined, row.department) }}</template>
        </el-table-column>
        <el-table-column :label="t('results.colStartTime')" width="170">
          <template #default="{ row }">{{ formatDate(row.startTime) }}</template>
        </el-table-column>
        <el-table-column
          prop="submissionTime"
          :label="t('results.colSubmissionTime')"
          width="170"
          sortable="custom"
        >
          <template #default="{ row }">{{ formatDate(row.submissionTime) }}</template>
        </el-table-column>
        <el-table-column
          prop="totalScore"
          :label="t('results.colTotalScore')"
          width="100"
          sortable="custom"
          align="right"
        />
        <el-table-column :label="t('results.colResult')" width="100">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row.resultCode)" size="small">
              {{ passResult(row.resultCode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('results.colGradingStatus')" width="120">
          <template #default="{ row }">
            <el-tag :type="gradingTagType(row.attemptStatus)" size="small">
              {{ gradingStatusFromAttempt(row.attemptStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canCorrect" :label="t('common.actions')" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openCorrection(row)" />
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="correctionVisible"
      :title="t('examResults.correctScore')"
      width="440px"
      destroy-on-close
    >
      <el-form
        v-if="correctionTarget"
        ref="correctionFormRef"
        :model="correctionForm"
        :rules="correctionRules"
        label-width="130px"
      >
        <el-form-item :label="t('results.colCandidateName')">
          <span>{{ correctionTarget.candidateName }}</span>
        </el-form-item>
        <el-form-item :label="t('results.colTotalScore')">
          <span>{{ correctionTarget.totalScore }} / {{ correctionTarget.passingScore }}</span>
        </el-form-item>
        <el-form-item :label="t('examResults.adjustedScore')" prop="adjustedScore">
          <el-input-number
            v-model="correctionForm.adjustedScore"
            :min="0"
            :max="correctionTarget.passingScore * 2"
            :precision="1"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('examResults.correctionReason')" prop="reason">
          <el-input
            v-model="correctionForm.reason"
            type="textarea"
            :rows="3"
            :placeholder="t('results.regradeReasonPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="correctionVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="correcting" @click="submitCorrection">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.exam-results-page {
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
  margin: 4px 0;
}

.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.publish-card {
  border-radius: 12px;
  max-width: 640px;
}

.publish-card h3 {
  margin: 0 0 8px;
}

.hint {
  margin: 0 0 16px;
  color: #6b7280;
  line-height: 1.5;
}

.published-meta {
  margin: 0 0 16px;
  font-size: 13px;
  color: #16a34a;
}

.actions {
  display: flex;
  gap: 8px;
}

.stats-row {
  margin-bottom: 0;
}

.stat-card {
  margin-bottom: 16px;
  min-height: 100px;
}

.stat-label {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.stat-value {
  margin: 8px 0 4px;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.stat-value.success {
  color: #16a34a;
}

.stat-value.danger {
  color: #dc2626;
}

.table-card {
  border-radius: 12px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-header h3 {
  margin: 0;
}

.filters {
  margin-bottom: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
