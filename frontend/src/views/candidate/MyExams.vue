<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

type CandidateState =
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'PENDING_GRADING'
  | 'GRADED_PUBLISHED'
  | 'NOT_TAKEN';

interface CandidateExam {
  examId: string;
  sessionId?: string | null;
  attemptId?: string | null;
  title: string;
  category: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  passScore: number;
  candidateState: CandidateState;
  tab: 'upcoming' | 'finished';
  statusLabel: string;
  actionLabel: string;
  canEnter: boolean;
  canViewResult: boolean;
  submittedAt?: string | null;
  result?: { totalScore: number; passScore: number; result: string } | null;
}

const router = useRouter();
const { t } = useI18n();
const { candidateStatusLabel, passResult } = useLocalizedLabels();
const { examTitle } = useSeedDataLabels();

const loading = ref(false);
const activeTab = ref<'upcoming' | 'finished'>('upcoming');
const exams = ref<CandidateExam[]>([]);

async function load() {
  loading.value = true;
  try {
    try {
      exams.value = await fetchApi<CandidateExam[]>('/student/exams');
    } catch {
      exams.value = await fetchApi<CandidateExam[]>('/candidate/exams');
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('student.loadAttemptFailed'));
  } finally {
    loading.value = false;
    if (!upcomingList.value.length && finishedList.value.length) {
      activeTab.value = 'finished';
    }
  }
}

onMounted(load);

const upcomingList = computed(() => exams.value.filter((e) => e.tab === 'upcoming'));
const finishedList = computed(() => exams.value.filter((e) => e.tab === 'finished'));

function formatRange(start: string | null, end: string | null) {
  if (!start || !end) return '—';
  return `${new Date(start).toLocaleString()} – ${new Date(end).toLocaleString()}`;
}

function statusTagType(row: CandidateExam): 'success' | 'warning' | 'info' | 'danger' {
  switch (row.candidateState) {
    case 'UPCOMING':
      return 'warning';
    case 'IN_PROGRESS':
      return 'success';
    case 'PENDING_GRADING':
      return 'info';
    case 'GRADED_PUBLISHED':
      return row.result?.result === 'PASS' ? 'success' : 'danger';
    default:
      return 'info';
  }
}

function resultText(row: CandidateExam) {
  if (row.candidateState === 'GRADED_PUBLISHED' && row.result) {
    const label = passResult(row.result.result);
    return `${row.result.totalScore} / ${row.result.passScore} (${label})`;
  }
  if (row.candidateState === 'PENDING_GRADING') return t('student.pending');
  return t('common.noDataDash');
}

function canTakeExam(row: CandidateExam) {
  return row.canEnter;
}

function onAction(row: CandidateExam) {
  if (row.canEnter) {
    if (row.candidateState === 'IN_PROGRESS' && row.attemptId) {
      router.push(`/take-exam/attempts/${row.attemptId}/exam`);
      return;
    }
    router.push({
      path: `/student/exams/${row.examId}/instructions`,
      query: row.sessionId ? { sessionId: row.sessionId } : undefined,
    });
    return;
  }
  if (row.canViewResult && row.attemptId) {
    router.push(`/take-exam/attempts/${row.attemptId}/result`);
  }
}
</script>

<template>
  <div class="my-exams">
    <div class="page-header">
      <div>
        <h2>{{ t('student.myExamsTitle') }}</h2>
        <p class="subtitle">{{ t('student.myExamsSubtitle') }}</p>
      </div>
      <el-button link type="primary" @click="load">{{ t('common.refresh') }}</el-button>
    </div>

    <el-empty v-if="!loading && !exams.length" :description="t('student.noExams')" />

    <el-tabs v-else v-model="activeTab" v-loading="loading">
      <el-tab-pane :label="`Upcoming Exams (${upcomingList.length})`" name="upcoming">
        <el-empty v-if="!upcomingList.length" :description="t('student.noUpcoming')" />
        <el-table v-else :data="upcomingList" stripe>
          <el-table-column :label="t('student.colExam')" min-width="160">
            <template #default="{ row }">{{ examTitle(row.examId, row.title) }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colSchedule')" min-width="200">
            <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colDuration')" width="100">
            <template #default="{ row }">{{ row.durationMinutes }} {{ t('common.minutes') }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colStatus')" width="130">
            <template #default="{ row }">
              <el-tag size="small" :type="statusTagType(row)">
                {{ candidateStatusLabel(row.candidateState, row.statusLabel) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Action" width="150" fixed="right">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                :disabled="!canTakeExam(row)"
                @click="onAction(row)"
              >
                Take Exam
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`Completed Exams (${finishedList.length})`" name="finished">
        <el-empty v-if="!finishedList.length" :description="t('student.noFinished')" />
        <el-table v-else :data="finishedList" stripe>
          <el-table-column :label="t('student.colExam')" min-width="160">
            <template #default="{ row }">{{ examTitle(row.examId, row.title) }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colSubmitted')" width="170">
            <template #default="{ row }">
              {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="Score" width="160">
            <template #default="{ row }">{{ resultText(row) }}</template>
          </el-table-column>
          <el-table-column label="Action" width="150" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.canViewResult && row.attemptId"
                type="primary"
                link
                @click="onAction(row)"
              >
                View Results
              </el-button>
              <span v-else class="muted">{{ t('student.pending') }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.my-exams {
  max-width: 960px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.page-header h2 {
  margin: 0 0 0.25rem;
}
.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
}
.muted {
  color: #9ca3af;
  font-size: 0.9rem;
}
</style>
