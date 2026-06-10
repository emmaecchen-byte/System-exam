<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import api from '@/api/client';

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
  result?: {
    totalScore: number;
    passScore: number;
    result: string;
  } | null;
}

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const activeTab = ref<'upcoming' | 'finished'>('upcoming');
const exams = ref<CandidateExam[]>([]);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get<CandidateExam[]>('/candidate/exams');
    exams.value = data;
  } catch {
    const { data } = await api.get<CandidateExam[]>('/student/exams');
    exams.value = data;
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
    const label = row.result.result === 'PASS'
      ? t('student.pass')
      : row.result.result === 'FAIL'
        ? t('student.fail')
        : row.result.result;
    return `${row.result.totalScore} / ${row.result.passScore} (${label})`;
  }
  if (row.candidateState === 'PENDING_GRADING') return t('student.pending');
  if (row.candidateState === 'NOT_TAKEN') return '—';
  return '—';
}

function canClickAction(row: CandidateExam) {
  return row.canEnter || (row.canViewResult && Boolean(row.attemptId));
}

function onAction(row: CandidateExam) {
  if (!canClickAction(row)) return;

  if (row.canEnter) {
    if (row.candidateState === 'IN_PROGRESS' && row.attemptId) {
      router.push(`/take-exam/attempts/${row.attemptId}/exam`);
      return;
    }
    router.push({
      path: `/take-exam/exams/${row.examId}/instructions`,
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

    <el-empty v-if="!loading && !exams.length" :description="t('student.noExams')">
      <p class="empty-hint">
        {{ t('student.noExamsHint') }}
      </p>
    </el-empty>

    <el-tabs v-else v-model="activeTab" v-loading="loading">
      <el-tab-pane :label="`${t('student.upcoming')} (${upcomingList.length})`" name="upcoming">
        <el-empty v-if="!upcomingList.length" :description="t('student.noUpcoming')" />
        <el-table v-else :data="upcomingList" stripe class="exam-table">
          <el-table-column prop="title" :label="t('student.colExam')" min-width="160" />
          <el-table-column :label="t('student.colCategory')" width="140" prop="category" show-overflow-tooltip />
          <el-table-column :label="t('student.colSchedule')" min-width="200">
            <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colDuration')" width="90">
            <template #default="{ row }">{{ row.durationMinutes }} {{ t('common.minutes') }}</template>
          </el-table-column>
          <el-table-column :label="t('student.colStatus')" width="130">
            <template #default="{ row }">
              <el-tag size="small" :type="statusTagType(row)">{{ row.statusLabel }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('student.colResult')" width="90">
            <template #default>—</template>
          </el-table-column>
          <el-table-column :label="t('student.colAction')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canClickAction(row)"
                type="primary"
                link
                @click="onAction(row)"
              >
                {{ row.actionLabel }}
              </el-button>
              <span v-else class="muted">{{ row.actionLabel }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`${t('student.finished')} (${finishedList.length})`" name="finished">
        <el-empty v-if="!finishedList.length" :description="t('student.noFinished')" />
        <el-table v-else :data="finishedList" stripe class="exam-table">
          <el-table-column prop="title" :label="t('student.colExam')" min-width="160" />
          <el-table-column :label="t('student.colCategory')" width="140" prop="category" show-overflow-tooltip />
          <el-table-column :label="t('student.colSubmitted')" width="170">
            <template #default="{ row }">
              {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('student.colStatus')" width="150">
            <template #default="{ row }">
              <el-tag size="small" :type="statusTagType(row)">{{ row.statusLabel }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('student.colResult')" width="140">
            <template #default="{ row }">
              <strong v-if="row.candidateState === 'GRADED_PUBLISHED'">{{ resultText(row) }}</strong>
              <span v-else class="muted">{{ resultText(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('student.colAction')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canClickAction(row)"
                type="primary"
                link
                @click="onAction(row)"
              >
                {{ row.actionLabel }}
              </el-button>
              <span v-else class="muted">{{ row.actionLabel }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-card v-if="exams.length" class="legend" shadow="never">
      <p class="legend-title">{{ t('student.statusGuide') }}</p>
      <ul class="legend-list">
        <li>{{ t('student.statusUpcoming') }}</li>
        <li>{{ t('student.statusOpen') }}</li>
        <li>{{ t('student.statusPendingGrading') }}</li>
        <li>{{ t('student.statusGraded') }}</li>
      </ul>
    </el-card>
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
.exam-table {
  width: 100%;
}
.muted {
  color: #9ca3af;
  font-size: 0.9rem;
}
.empty-hint {
  max-width: 28rem;
  margin: 0.5rem 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}
.legend {
  margin-top: 1.25rem;
}
.legend-title {
  margin: 0 0 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
}
.legend-list {
  margin: 0;
  padding-left: 1.25rem;
  color: #6b7280;
  font-size: 0.85rem;
}
.legend-list li {
  margin-bottom: 0.25rem;
}
</style>
