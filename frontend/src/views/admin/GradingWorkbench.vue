<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Search } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import {
  assignGrader,
  fetchGradingAttempt,
  fetchGradingQueue,
  fetchGradingStats,
  gradeAnswer,
  GradingAttemptDetail,
  GradingQuestion,
  GradingQueueItem,
  saveGradingDraft,
  submitGrading,
} from '@/api/grading';
import { fetchApi } from '@/utils/fetchApi';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const auth = useAuthStore();
const { examTitle, personName } = useSeedDataLabels();

const isAdmin = computed(
  () =>
    auth.hasRole(ROLES.SUPER_ADMIN, ROLES.ADMIN),
);

const loading = ref(false);
const items = ref<GradingQueueItem[]>([]);
const stats = ref({
  pending: 0,
  inProgress: 0,
  completed: 0,
  total: 0,
  gradedToday: 0,
  averageGradingTimeMinutes: 0,
});

const filters = reactive({
  search: '',
  examId: '',
  questionType: '',
  status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'all',
});

const modalOpen = ref(false);
const modalLoading = ref(false);
const saving = ref(false);
const submitting = ref(false);
const activeAttemptId = ref<string | null>(null);
const activeAnswerId = ref<string | null>(null);
const detail = ref<GradingAttemptDetail | null>(null);
const needsQualityReview = ref(false);

const scores = reactive<Record<string, number>>({});
const comments = reactive<Record<string, string>>({});
const marked = reactive<Record<string, boolean>>({});

const selectedRows = ref<GradingQueueItem[]>([]);
const assignDialogOpen = ref(false);
const assignGraderId = ref('');
const graders = ref<Array<{ id: string; name: string }>>([]);
const assigning = ref(false);

const examOptions = computed(() => {
  const map = new Map<string, string>();
  for (const row of items.value) {
    map.set(row.examId, row.examTitle);
  }
  return [...map.entries()].map(([id, title]) => ({ id, title }));
});

const pendingList = computed(() =>
  items.value.filter((r) => r.gradingStatus !== 'completed'),
);

const currentQuestion = computed(() => {
  if (!detail.value) return null;
  if (activeAnswerId.value) {
    return detail.value.questions.find((q) => q.answerId === activeAnswerId.value) ?? null;
  }
  return detail.value.questions[0] ?? null;
});

const currentQuestionIndex = computed(() => {
  if (!detail.value || !currentQuestion.value) return 0;
  return detail.value.questions.findIndex((q) => q.answerId === currentQuestion.value!.answerId);
});

const subjectiveScore = computed(() =>
  (detail.value?.questions ?? []).reduce((sum, q) => sum + (scores[q.answerId] ?? 0), 0),
);

const totalScore = computed(() => (detail.value?.objectiveScore ?? 0) + subjectiveScore.value);

function questionTypeLabel(type?: string | null) {
  if (type === 'FILL_BLANK') return t('grading.fillBlank');
  if (type === 'SHORT_ANSWER') return t('grading.shortAnswer');
  return type ?? '—';
}

function initForm(questions: GradingQuestion[]) {
  for (const q of questions) {
    scores[q.answerId] = q.manualScore ?? q.displayScore ?? q.autoScore ?? 0;
    comments[q.answerId] = q.reviewComment ?? '';
    marked[q.answerId] = q.markedForReview;
  }
}

async function load() {
  loading.value = true;
  try {
    const [queueRes, statsRes] = await Promise.all([
      fetchGradingQueue({
        search: filters.search || undefined,
        examId: filters.examId || undefined,
        questionType: filters.questionType || undefined,
        status: filters.status === 'all' ? undefined : filters.status,
      }),
      fetchGradingStats(),
    ]);
    items.value = queueRes.data.data;
    stats.value = statsRes.data;
  } catch {
    ElMessage.error(t('grading.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function openGradingModal(row: GradingQueueItem) {
  activeAttemptId.value = row.attemptId;
  activeAnswerId.value = row.answerId ?? null;
  modalOpen.value = true;
  modalLoading.value = true;
  try {
    const { data } = await fetchGradingAttempt(row.attemptId);
    detail.value = data;
    needsQualityReview.value = data.needsQualityReview;
    initForm(data.questions);
    if (!activeAnswerId.value && data.questions.length) {
      activeAnswerId.value = data.questions[0].answerId;
    }
  } catch {
    ElMessage.error(t('grading.loadWorkbenchFailed'));
    modalOpen.value = false;
  } finally {
    modalLoading.value = false;
  }
}

function closeModal() {
  modalOpen.value = false;
  detail.value = null;
  activeAttemptId.value = null;
  activeAnswerId.value = null;
}

function goQuestion(delta: number) {
  if (!detail.value) return;
  const next = currentQuestionIndex.value + delta;
  if (next < 0 || next >= detail.value.questions.length) return;
  activeAnswerId.value = detail.value.questions[next].answerId;
}

function requiresComment(q: GradingQuestion): boolean {
  const score = scores[q.answerId] ?? 0;
  return score > 0 && score < q.maxScore;
}

async function persistAnswer(q: GradingQuestion): Promise<boolean> {
  const score = scores[q.answerId];
  if (score < 0 || score > q.maxScore) {
    ElMessage.warning(t('grading.scoreRangeWarning', { max: q.maxScore }));
    return false;
  }
  if (requiresComment(q) && !comments[q.answerId]?.trim()) {
    ElMessage.warning('Comment is required for partial credit');
    return false;
  }
  await gradeAnswer(activeAttemptId.value!, q.answerId, {
    manualScore: score,
    reviewComment: comments[q.answerId] || undefined,
    markedForReview: marked[q.answerId],
  });
  return true;
}

async function saveDraft() {
  if (!detail.value || !activeAttemptId.value) return;
  saving.value = true;
  try {
    for (const q of detail.value.questions) {
      const ok = await persistAnswer(q);
      if (!ok) return;
    }
    const { data } = await saveGradingDraft(activeAttemptId.value);
    detail.value = data;
    initForm(data.questions);
    ElMessage.success(t('grading.draftSaved'));
    await load();
  } catch {
    ElMessage.error(t('grading.draftSaveFailed'));
  } finally {
    saving.value = false;
  }
}

async function handleSubmit() {
  if (!detail.value || !activeAttemptId.value) return;

  for (const q of detail.value.questions) {
    if (requiresComment(q) && !comments[q.answerId]?.trim()) {
      ElMessage.warning(`Comment required for question ${q.questionNumber} (partial credit)`);
      activeAnswerId.value = q.answerId;
      return;
    }
    if (scores[q.answerId] > q.maxScore) {
      ElMessage.error(t('grading.scoreExceedsMax', { number: q.questionNumber, max: q.maxScore }));
      return;
    }
  }

  const pass = totalScore.value >= detail.value.passScore;
  try {
    await ElMessageBox.confirm(
      t('grading.finalizeGradingBody', {
        total: totalScore.value,
        passScore: detail.value.passScore,
        result: pass ? t('common.pass') : t('common.fail'),
      }),
      t('grading.finalizeGrading'),
      { type: 'warning' },
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    for (const q of detail.value.questions) {
      await persistAnswer(q);
    }
    await submitGrading(activeAttemptId.value, { needsQualityReview: needsQualityReview.value });
    ElMessage.success(t('grading.gradingSubmitted'));
    closeModal();
    await load();
  } catch {
    ElMessage.error(t('grading.gradingSubmitFailed'));
  } finally {
    submitting.value = false;
  }
}

function exportCsv() {
  const header = ['Candidate', 'Employee No', 'Exam', 'Submitted', 'Question Type', 'Preview'];
  const rows = pendingList.value.map((r) => [
    r.candidateName,
    r.candidateEmployeeNo,
    r.examTitle,
    r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
    r.questionType ?? '',
    (r.questionPreview ?? '').replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'grading-queue.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function openAssignDialog() {
  if (!selectedRows.value.length) {
    ElMessage.warning('Select at least one row');
    return;
  }
  try {
    const data = await fetchApi<Array<{ id: string; name: string; userRoles: Array<{ role: { code: string } }> }>>(
      '/admin/users?role=GRADER',
    );
    graders.value = data.map((u) => ({ id: u.id, name: u.name }));
    assignGraderId.value = graders.value[0]?.id ?? '';
    assignDialogOpen.value = true;
  } catch {
    ElMessage.error('Failed to load graders');
  }
}

async function confirmAssign() {
  if (!assignGraderId.value) return;
  assigning.value = true;
  try {
    const attemptIds = [...new Set(selectedRows.value.map((r) => r.attemptId))];
    await Promise.all(attemptIds.map((id) => assignGrader(id, assignGraderId.value)));
    ElMessage.success('Grader assigned');
    assignDialogOpen.value = false;
    selectedRows.value = [];
    await load();
  } catch {
    ElMessage.error('Assign failed');
  } finally {
    assigning.value = false;
  }
}

watch(modalOpen, (open) => {
  if (!open) detail.value = null;
});

onMounted(load);
</script>

<template>
  <div class="grading-workbench">
    <div class="page-header">
      <div>
        <h2>{{ t('grading.queueTitle') }}</h2>
        <p class="subtitle">{{ t('grading.queueSubtitleExtended') }}</p>
      </div>
      <el-button @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <el-row :gutter="16" class="stat-row">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover">
          <p class="stat-label">Pending Count</p>
          <p class="stat-value warn">{{ stats.pending + stats.inProgress }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover">
          <p class="stat-label">Graded Today</p>
          <p class="stat-value success">{{ stats.gradedToday }}</p>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover">
          <p class="stat-label">Avg. Grading Time</p>
          <p class="stat-value">{{ stats.averageGradingTimeMinutes }} min</p>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="filters">
      <el-form inline @submit.prevent="load">
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('grading.searchCandidate')"
            clearable
            style="width: 200px"
            @clear="load"
          />
        </el-form-item>
        <el-form-item label="Exam">
          <el-select v-model="filters.examId" clearable placeholder="All exams" style="width: 200px" @change="load">
            <el-option v-for="e in examOptions" :key="e.id" :label="examTitle(e.id, e.title)" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Question Type">
          <el-select
            v-model="filters.questionType"
            clearable
            placeholder="All types"
            style="width: 160px"
            @change="load"
          >
            <el-option :label="t('grading.fillBlank')" value="FILL_BLANK" />
            <el-option :label="t('grading.shortAnswer')" value="SHORT_ANSWER" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="load">{{ t('common.search') }}</el-button>
        </el-form-item>
        <el-form-item v-if="isAdmin">
          <el-button :disabled="!selectedRows.length" @click="openAssignDialog">Assign Grader</el-button>
          <el-button :icon="Download" @click="exportCsv">Export CSV</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="pendingList"
      stripe
      class="queue-table"
      @row-click="openGradingModal"
      @selection-change="(rows: GradingQueueItem[]) => (selectedRows = rows)"
    >
      <el-table-column v-if="isAdmin" type="selection" width="48" @click.stop />
      <el-table-column :label="t('grading.colCandidate')" min-width="140">
        <template #default="{ row }">
          {{ personName({ employeeNo: row.candidateEmployeeNo, name: row.candidateName }) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('grading.colExam')" min-width="160">
        <template #default="{ row }">{{ examTitle(row.examId, row.examTitle) }}</template>
      </el-table-column>
      <el-table-column :label="t('grading.colSubmitted')" width="170">
        <template #default="{ row }">
          {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="Question Type" width="130">
        <template #default="{ row }">{{ questionTypeLabel(row.questionType) }}</template>
      </el-table-column>
      <el-table-column label="Question Preview" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.questionPreview ?? '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('grading.colActions')" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="openGradingModal(row)">
            {{ t('grading.grade') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !pendingList.length" :description="t('grading.allCaughtUp')" />

    <el-dialog
      v-model="modalOpen"
      :title="detail ? detail.examTitle : t('grading.grade')"
      width="92%"
      top="4vh"
      class="grading-dialog"
      destroy-on-close
      @close="closeModal"
    >
      <div v-loading="modalLoading">
        <template v-if="detail && currentQuestion">
          <div class="modal-meta">
            <span>{{ detail.candidate.name }} ({{ detail.candidate.employeeNo }})</span>
            <span v-if="detail.submittedAt">
              {{ new Date(detail.submittedAt).toLocaleString() }}
            </span>
            <span>
              Question {{ currentQuestionIndex + 1 }} / {{ detail.questions.length }}
            </span>
          </div>

          <el-row :gutter="20" class="split-view">
            <el-col :xs="24" :md="12" class="panel left">
              <h4>{{ t('grading.questionTitle', { number: currentQuestion.questionNumber, type: questionTypeLabel(currentQuestion.type) }) }}</h4>
              <p class="stem">{{ currentQuestion.stem }}</p>
              <div class="answer-block candidate">
                <span class="block-label">{{ t('grading.candidateAnswer') }}</span>
                <p>{{ currentQuestion.candidateAnswer || t('grading.noAnswer') }}</p>
              </div>
              <div v-if="currentQuestion.referenceAnswer" class="answer-block reference">
                <span class="block-label">{{ t('grading.referenceAnswer') }}</span>
                <p>{{ currentQuestion.referenceAnswer }}</p>
              </div>
              <div v-if="currentQuestion.scoringRubric" class="answer-block rubric">
                <span class="block-label">{{ t('grading.scoringRubric') }}</span>
                <p>{{ currentQuestion.scoringRubric }}</p>
              </div>
            </el-col>

            <el-col :xs="24" :md="12" class="panel right">
              <el-form label-position="top">
                <el-form-item :label="t('grading.scoreLabel')">
                  <div class="score-row">
                    <el-input-number
                      v-model="scores[currentQuestion.answerId]"
                      :min="0"
                      :max="currentQuestion.maxScore"
                      :step="0.5"
                      :precision="1"
                    />
                    <span class="max-hint">/ {{ currentQuestion.maxScore }}</span>
                  </div>
                </el-form-item>
                <el-form-item label="Comment">
                  <el-input
                    v-model="comments[currentQuestion.answerId]"
                    type="textarea"
                    :rows="4"
                    :placeholder="t('grading.commentPlaceholder')"
                  />
                  <p v-if="requiresComment(currentQuestion)" class="hint">Required for partial credit</p>
                </el-form-item>
                <el-checkbox v-model="marked[currentQuestion.answerId]">
                  {{ t('grading.markForReview') }}
                </el-checkbox>
              </el-form>

              <div class="q-nav">
                <el-button :disabled="currentQuestionIndex <= 0" @click="goQuestion(-1)">Previous Q</el-button>
                <el-button
                  :disabled="currentQuestionIndex >= detail.questions.length - 1"
                  @click="goQuestion(1)"
                >
                  Next Q
                </el-button>
              </div>

              <div class="totals">
                <span>
                  {{ t('grading.totalBreakdown', {
                    objective: detail.objectiveScore,
                    subjective: subjectiveScore,
                    total: totalScore,
                  }) }}
                </span>
              </div>
              <el-checkbox v-model="needsQualityReview">{{ t('grading.markForQaReview') }}</el-checkbox>
            </el-col>
          </el-row>
        </template>
      </div>

      <template #footer>
        <el-button @click="closeModal">{{ t('common.cancel') }}</el-button>
        <el-button :loading="saving" @click="saveDraft">{{ t('grading.saveDraft') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ t('grading.submitGrading') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assignDialogOpen" title="Assign Grader" width="400px">
      <el-select v-model="assignGraderId" placeholder="Select grader" style="width: 100%">
        <el-option v-for="g in graders" :key="g.id" :label="g.name" :value="g.id" />
      </el-select>
      <template #footer>
        <el-button @click="assignDialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="assigning" @click="confirmAssign">Assign</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.grading-workbench {
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
.stat-row {
  margin-bottom: 0;
}
.stat-label {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}
.stat-value {
  margin: 8px 0 0;
  font-size: 1.75rem;
  font-weight: 700;
}
.stat-value.warn {
  color: #d97706;
}
.stat-value.success {
  color: #16a34a;
}
.filters {
  margin-bottom: 0;
}
.queue-table {
  width: 100%;
  cursor: pointer;
}
.modal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #6b7280;
}
.split-view {
  min-height: 360px;
}
.panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  min-height: 320px;
}
.panel h4 {
  margin: 0 0 12px;
}
.stem {
  white-space: pre-wrap;
  line-height: 1.5;
  margin: 0 0 16px;
}
.answer-block {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.answer-block.candidate {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}
.answer-block.reference {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}
.answer-block.rubric {
  background: #fffbeb;
  border: 1px solid #fde68a;
}
.block-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 6px;
}
.answer-block p {
  margin: 0;
  white-space: pre-wrap;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.max-hint {
  color: #6b7280;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #d97706;
}
.q-nav {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}
.totals {
  margin: 12px 0;
  font-size: 14px;
}
</style>
