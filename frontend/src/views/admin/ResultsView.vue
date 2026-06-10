<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Refresh, Search } from '@element-plus/icons-vue';
import {
  exportResults,
  fetchResultDetail,
  fetchResults,
  fetchResultsFilters,
  regradeAttempt,
  ResultDetail,
  ResultRow,
} from '@/api/results';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';

const { t } = useI18n();

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const pageTitle = computed(() =>
  route.meta.resultsTitleKey
    ? t(route.meta.resultsTitleKey as string)
    : t('results.examResultsTitle'),
);
const pageSubtitle = computed(() =>
  route.meta.resultsSubtitleKey
    ? t(route.meta.resultsSubtitleKey as string)
    : t('results.examResultsSubtitle'),
);
const showResultsSummary = computed(() => route.meta.resultsSummary === true);

const pageSummary = computed(() => {
  const pass = rows.value.filter((r) => r.resultCode === 'PASS').length;
  const fail = rows.value.filter((r) => r.resultCode === 'FAIL').length;
  const pending = rows.value.length - pass - fail;
  return { pass, fail, pending };
});

const canExport = computed(() => auth.hasPermission('result:export'));
const canRegrade = computed(
  () =>
    auth.hasPermission('result:correct') &&
    (auth.hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN)),
);

const loading = ref(false);
const exporting = ref(false);
const rows = ref<ResultRow[]>([]);
const selected = ref<ResultRow[]>([]);

const filterOptions = reactive({
  exams: [] as Array<{ id: string; title: string }>,
  departments: [] as Array<{ id: string; name: string }>,
  sessions: [] as Array<{ id: string; name: string; examId: string; startTime: string }>,
});

const filters = reactive({
  examId: '',
  sessionId: '',
  departmentIds: [] as string[],
  result: 'ALL',
  gradingStatus: 'ALL',
  submittedRange: [] as string[],
  search: '',
});

const pagination = reactive({ page: 1, pageSize: 50, total: 0 });
const sort = reactive({
  sortBy: 'submittedAt' as 'submittedAt' | 'totalScore' | 'candidateName' | 'timeSpent',
  sortOrder: 'desc' as 'asc' | 'desc',
});

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<ResultDetail | null>(null);

const sessionOptions = computed(() => {
  if (!filters.examId) return filterOptions.sessions;
  return filterOptions.sessions.filter((s) => s.examId === filters.examId);
});

const resultOptions = computed(() => [
  { label: t('results.gradingAll'), value: 'ALL' },
  { label: t('common.pass'), value: 'PASS' },
  { label: t('common.fail'), value: 'FAIL' },
  { label: t('common.pending'), value: 'PENDING' },
]);

const gradingOptions = computed(() => [
  { label: t('results.gradingAll'), value: 'ALL' },
  { label: t('results.gradingNotStarted'), value: 'NOT_STARTED' },
  { label: t('results.gradingInProgress'), value: 'IN_PROGRESS' },
  { label: t('results.gradingCompleted'), value: 'COMPLETED' },
]);

function resultTagType(code: string) {
  if (code === 'PASS') return 'success';
  if (code === 'FAIL') return 'danger';
  return 'warning';
}

function gradingTagType(status: string) {
  if (status === 'Completed') return 'success';
  if (status === 'In Progress') return 'warning';
  return 'info';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function buildQuery(extra: Record<string, unknown> = {}) {
  return {
    examId: filters.examId || undefined,
    sessionId: filters.sessionId || undefined,
    departmentIds: filters.departmentIds.length ? filters.departmentIds : undefined,
    result: filters.result === 'ALL' ? undefined : filters.result,
    gradingStatus: filters.gradingStatus === 'ALL' ? undefined : filters.gradingStatus,
    submittedFrom: filters.submittedRange[0] || undefined,
    submittedTo: filters.submittedRange[1] || undefined,
    search: filters.search.trim() || undefined,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    page: pagination.page,
    pageSize: pagination.pageSize,
    ...extra,
  };
}

async function loadFilters() {
  const { data } = await fetchResultsFilters();
  filterOptions.exams = data.exams;
  filterOptions.departments = data.departments;
  filterOptions.sessions = data.sessions;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchResults(buildQuery());
    rows.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('results.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
  load();
}

function onExamChange() {
  filters.sessionId = '';
  onSearch();
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  const map: Record<string, typeof sort.sortBy> = {
    submissionTime: 'submittedAt',
    totalScore: 'totalScore',
    candidateName: 'candidateName',
    timeSpentMinutes: 'timeSpent',
  };
  const mapped = map[prop];
  if (!mapped || !order) return;
  sort.sortBy = mapped;
  sort.sortOrder = order === 'ascending' ? 'asc' : 'desc';
  load();
}

function onPageChange(page: number) {
  pagination.page = page;
  load();
}

function onSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  load();
}

async function openDetail(row: ResultRow) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  router.replace({ query: { ...route.query, attemptId: row.attemptId } });
  try {
    const { data } = await fetchResultDetail(row.attemptId);
    detail.value = data;
  } catch {
    ElMessage.error(t('results.detailFailed'));
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  detailVisible.value = false;
  const query = { ...route.query };
  delete query.attemptId;
  router.replace({ query });
}

async function doExport(allForExam = false) {
  exporting.value = true;
  try {
    const params =
      allForExam && filters.examId
        ? { examId: filters.examId }
        : buildQuery({
            page: undefined,
            pageSize: undefined,
            attemptIds: selected.value.length ? selected.value.map((r) => r.attemptId) : undefined,
          });
    await exportResults(params);
    ElMessage.success(t('results.exportDownloaded'));
  } catch {
    ElMessage.error(t('results.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

async function promptRegrade(targets: ResultRow[]) {
  if (!targets.length) {
    ElMessage.warning(t('results.selectCandidate'));
    return;
  }
  try {
    const { value: reason } = await ElMessageBox.prompt(
      t('results.regradeConfirm', { count: targets.length }),
      t('results.regrade'),
      {
        confirmButtonText: t('results.regrade'),
        cancelButtonText: t('common.cancel'),
        inputPlaceholder: t('results.regradeReasonPlaceholder'),
        inputValidator: (v) => (v?.trim() ? true : t('results.regradeReasonRequired')),
      },
    );
    for (const row of targets) {
      await regradeAttempt(row.attemptId, reason.trim());
    }
    ElMessage.success(t('results.regraded', { count: targets.length }));
    selected.value = [];
    load();
    if (detail.value && targets.some((t) => t.attemptId === detail.value?.attemptId)) {
      const { data } = await fetchResultDetail(detail.value.attemptId);
      detail.value = data;
    }
  } catch {
    /* cancelled */
  }
}

watch(
  () => route.query.attemptId,
  async (attemptId) => {
    if (typeof attemptId === 'string' && attemptId && !detailVisible.value) {
      const row = rows.value.find((r) => r.attemptId === attemptId);
      if (row) {
        openDetail(row);
      } else {
        detailVisible.value = true;
        detailLoading.value = true;
        try {
          const { data } = await fetchResultDetail(attemptId);
          detail.value = data;
        } catch {
          ElMessage.error(t('results.notFound'));
          closeDetail();
        } finally {
          detailLoading.value = false;
        }
      }
    }
  },
);

onMounted(async () => {
  await loadFilters();
  await load();
  const attemptId = route.query.attemptId;
  if (typeof attemptId === 'string' && attemptId) {
    detailVisible.value = true;
    detailLoading.value = true;
    try {
      const { data } = await fetchResultDetail(attemptId);
      detail.value = data;
    } catch {
      closeDetail();
    } finally {
      detailLoading.value = false;
    }
  }
});
</script>

<template>
  <div class="results-page">
    <div class="page-header">
      <div>
        <h2>{{ pageTitle }}</h2>
        <p class="subtitle">{{ pageSubtitle }}</p>
      </div>
      <div class="header-actions">
        <el-button
          v-if="canExport"
          :loading="exporting"
          :icon="Download"
          @click="doExport(false)"
        >
          {{ t('results.exportFiltered') }}
        </el-button>
        <el-button
          v-if="canExport && filters.examId"
          :loading="exporting"
          :icon="Download"
          @click="doExport(true)"
        >
          {{ t('results.exportAllExam') }}
        </el-button>
        <el-button v-if="canRegrade" type="warning" @click="promptRegrade(selected)">
          {{ t('results.bulkRegrade') }}
        </el-button>
      </div>
    </div>

    <el-card v-if="showResultsSummary && !loading" shadow="never" class="summary-card">
      <div class="summary-row">
        <div class="summary-item">
          <span class="summary-label">{{ t('results.totalAttempts') }}</span>
          <strong class="summary-value">{{ pagination.total }}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('results.passThisPage') }}</span>
          <el-tag type="success" size="large">{{ pageSummary.pass }}</el-tag>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('results.failThisPage') }}</span>
          <el-tag type="danger" size="large">{{ pageSummary.fail }}</el-tag>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('results.pendingThisPage') }}</span>
          <el-tag type="warning" size="large">{{ pageSummary.pending }}</el-tag>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="filters">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('results.colExam')">
          <el-select
            v-model="filters.examId"
            clearable
            filterable
            :placeholder="t('results.allExams')"
            style="width: 200px"
            @change="onExamChange"
          >
            <el-option v-for="e in filterOptions.exams" :key="e.id" :label="e.title" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colSession')">
          <el-select
            v-model="filters.sessionId"
            clearable
            filterable
            :placeholder="t('results.allSessions')"
            style="width: 200px"
            :disabled="!filters.examId && sessionOptions.length > 100"
            @change="onSearch"
          >
            <el-option
              v-for="s in sessionOptions"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colDepartment')">
          <el-select
            v-model="filters.departmentIds"
            multiple
            collapse-tags
            clearable
            filterable
            :placeholder="t('results.allDepartments')"
            style="width: 220px"
            @change="onSearch"
          >
            <el-option
              v-for="d in filterOptions.departments"
              :key="d.id"
              :label="d.name"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colResult')">
          <el-select v-model="filters.result" style="width: 120px" @change="onSearch">
            <el-option v-for="o in resultOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('results.colGrading')">
          <el-select v-model="filters.gradingStatus" style="width: 140px" @change="onSearch">
            <el-option v-for="o in gradingOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.submitted')">
          <el-date-picker
            v-model="filters.submittedRange"
            type="datetimerange"
            :range-separator="t('common.to')"
            :start-placeholder="t('common.from')"
            :end-placeholder="t('common.to')"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            @change="onSearch"
          />
        </el-form-item>
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('results.searchPlaceholder')"
            clearable
            style="width: 200px"
            @clear="onSearch"
            @keyup.enter="onSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">{{ t('results.filter') }}</el-button>
          <el-button :icon="Refresh" @click="load">{{ t('common.refresh') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="rows"
      stripe
      @selection-change="(val: ResultRow[]) => (selected = val)"
      @sort-change="onSortChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column
        prop="candidateName"
        :label="t('results.colCandidateName')"
        min-width="140"
        sortable="custom"
      >
        <template #default="{ row }">
          <el-link type="primary" @click="openDetail(row)">{{ row.candidateName }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="employeeNo" :label="t('results.colEmployeeNo')" width="120" />
      <el-table-column prop="department" :label="t('results.colDepartment')" width="130" />
      <el-table-column prop="examTitle" :label="t('results.colExamTitle')" min-width="160" />
      <el-table-column prop="sessionName" :label="t('results.colSession')" width="140" />
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
        prop="timeSpentMinutes"
        :label="t('results.colTimeSpent')"
        width="110"
        sortable="custom"
      >
        <template #default="{ row }">
          {{ row.timeSpentMinutes != null ? `${row.timeSpentMinutes} ${t('common.minutes')}` : '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="objectiveScore" :label="t('results.colObjective')" width="90" align="right" />
      <el-table-column prop="subjectiveScore" :label="t('results.colSubjective')" width="95" align="right" />
      <el-table-column
        prop="totalScore"
        :label="t('results.colTotalScore')"
        width="110"
        sortable="custom"
        align="right"
      />
      <el-table-column prop="passingScore" :label="t('results.colPassing')" width="90" align="right" />
      <el-table-column :label="t('results.colResult')" width="90">
        <template #default="{ row }">
          <el-tag :type="resultTagType(row.resultCode)" size="small">{{ row.result }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('results.colGradingStatus')" width="120">
        <template #default="{ row }">
          <el-tag :type="gradingTagType(row.gradingStatus)" size="small">
            {{ row.gradingStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('results.colActions')" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">{{ t('results.viewDetails') }}</el-button>
          <el-button
            v-if="canRegrade"
            link
            type="warning"
            @click="promptRegrade([row])"
          >
            {{ t('results.regrade') }}
          </el-button>
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

    <el-drawer
      v-model="detailVisible"
      :title="t('results.resultDetails')"
      size="60%"
      destroy-on-close
      @close="closeDetail"
    >
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="2" border class="detail-summary">
            <el-descriptions-item :label="t('results.colCandidate')">{{ detail.candidateName }}</el-descriptions-item>
            <el-descriptions-item :label="t('results.colEmployeeNo')">{{ detail.employeeNo }}</el-descriptions-item>
            <el-descriptions-item :label="t('results.colDepartment')">{{ detail.department }}</el-descriptions-item>
            <el-descriptions-item :label="t('results.colExam')">{{ detail.examTitle }}</el-descriptions-item>
            <el-descriptions-item :label="t('common.category')">{{ detail.examCategory }}</el-descriptions-item>
            <el-descriptions-item :label="t('results.colSession')">{{ detail.sessionName || '—' }}</el-descriptions-item>
            <el-descriptions-item :label="t('common.submitted')">
              {{ formatDate(detail.submissionTime) }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('results.colTimeSpent')">
              {{ detail.timeSpentMinutes != null ? `${detail.timeSpentMinutes} ${t('common.minutes')}` : '—' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('results.colScores')">
              {{
                t('results.scoresSummary', {
                  objective: detail.objectiveScore,
                  subjective: detail.subjectiveScore,
                  total: detail.totalScore,
                  passing: detail.passingScore,
                })
              }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('results.colResult')">
              <el-tag :type="resultTagType(detail.resultCode)" size="small">{{ detail.result }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('results.colGraders')" :span="2">
              {{ detail.graderNames || '—' }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="canRegrade" class="detail-actions">
            <el-button
              type="warning"
              @click="promptRegrade([{ attemptId: detail.attemptId } as ResultRow])"
            >
              {{ t('results.regradeAttempt') }}
            </el-button>
          </div>

          <h3 class="questions-title">
            {{ t('results.answerBreakdown', { count: detail.questions.length }) }}
          </h3>
          <el-table :data="detail.questions" stripe size="small" class="answer-table">
            <el-table-column prop="questionNumber" label="#" width="48" />
            <el-table-column :label="t('results.colQuestion')" min-width="200">
              <template #default="{ row }">
                <p class="stem-cell">{{ row.stem }}</p>
              </template>
            </el-table-column>
            <el-table-column :label="t('results.colCandidateAnswer')" min-width="160">
              <template #default="{ row }">
                <span :class="{ 'answer-wrong': !row.isSubjective && row.finalScore === 0 }">
                  {{ row.candidateAnswer || '—' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('results.colCorrectAnswer')" min-width="160">
              <template #default="{ row }">
                <template v-if="row.isSubjective">
                  <span class="muted">{{ t('results.seeRubric') }}</span>
                </template>
                <template v-else>{{ row.correctAnswer || '—' }}</template>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.score')" width="90" align="center">
              <template #default="{ row }">
                <el-tag
                  :type="row.finalScore === row.maxScore ? 'success' : row.finalScore ? 'warning' : 'danger'"
                  size="small"
                >
                  {{ row.finalScore ?? '—' }} / {{ row.maxScore }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-collapse class="question-detail-collapse">
            <el-collapse-item
              v-for="q in detail.questions"
              :key="q.answerId"
              :title="t('results.questionDetails', { number: q.questionNumber, type: q.type })"
              :name="q.answerId"
            >
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item :label="t('results.colCandidateAnswer')">
                  {{ q.candidateAnswer || '—' }}
                </el-descriptions-item>
                <el-descriptions-item v-if="!q.isSubjective" :label="t('results.colCorrectAnswer')">
                  {{ q.correctAnswer || '—' }}
                </el-descriptions-item>
                <el-descriptions-item v-if="q.isSubjective" :label="t('results.colRubric')">
                  {{ q.scoringRubric || '—' }}
                </el-descriptions-item>
                <el-descriptions-item :label="t('results.colAutoScore')">{{ q.autoScore ?? '—' }}</el-descriptions-item>
                <el-descriptions-item :label="t('results.colManualScore')">{{ q.manualScore ?? '—' }}</el-descriptions-item>
                <el-descriptions-item v-if="q.reviewComment" :label="t('results.colGraderComment')">
                  {{ q.reviewComment }}
                </el-descriptions-item>
                <el-descriptions-item v-if="q.reviewer" :label="t('results.colReviewer')">
                  {{ q.reviewer.name }}
                </el-descriptions-item>
              </el-descriptions>
            </el-collapse-item>
          </el-collapse>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.results-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header h2 {
  margin: 0 0 4px;
}

.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  max-width: 560px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-card {
  padding: 4px 0;
}

.summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: center;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.summary-value {
  font-size: 1.5rem;
  line-height: 1.2;
}

.filters :deep(.el-form-item) {
  margin-bottom: 12px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
}

.detail-summary {
  margin-bottom: 16px;
}

.detail-actions {
  margin: 16px 0;
}

.questions-title {
  margin: 24px 0 12px;
  font-size: 16px;
}

.q-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-score {
  margin-left: 4px;
}

.stem-cell {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.4;
}

.answer-table {
  margin-bottom: 16px;
}

.answer-wrong {
  color: #dc2626;
}

.muted {
  color: #9ca3af;
  font-size: 13px;
}

.question-detail-collapse {
  margin-top: 8px;
}
</style>
