<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import { useIsMobile } from '@/composables/useIsMobile';
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
const { isMobile } = useIsMobile();
const { candidateStatusLabel, candidateActionLabel, passResult } = useLocalizedLabels();
const { categoryName, examTitle } = useSeedDataLabels();

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
const currentList = computed(() =>
  activeTab.value === 'upcoming' ? upcomingList.value : finishedList.value,
);
const emptyDescription = computed(() =>
  activeTab.value === 'upcoming' ? t('student.noUpcoming') : t('student.noFinished'),
);

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
      <div class="page-header-text">
        <h2>{{ t('student.myExamsTitle') }}</h2>
        <p class="subtitle">{{ t('student.myExamsSubtitle') }}</p>
      </div>
      <el-button link type="primary" class="refresh-btn" @click="load">
        {{ t('common.refresh') }}
      </el-button>
    </div>

    <div v-loading="loading" class="content-wrap">
      <el-empty v-if="!loading && !exams.length" :description="t('student.noExams')">
        <p class="empty-hint">{{ t('student.noExamsHint') }}</p>
      </el-empty>

      <template v-else-if="exams.length">
        <!-- Mobile: always-visible tab switcher (el-tabs nav can clip on small screens) -->
        <div v-if="isMobile" class="mobile-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            class="mobile-tab"
            :class="{ active: activeTab === 'upcoming' }"
            :aria-selected="activeTab === 'upcoming'"
            @click="activeTab = 'upcoming'"
          >
            {{ t('student.upcoming') }}
            <span class="tab-count">{{ upcomingList.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="mobile-tab"
            :class="{ active: activeTab === 'finished' }"
            :aria-selected="activeTab === 'finished'"
            @click="activeTab = 'finished'"
          >
            {{ t('student.finished') }}
            <span class="tab-count">{{ finishedList.length }}</span>
          </button>
        </div>

        <el-tabs v-else v-model="activeTab" class="desktop-tabs">
          <el-tab-pane
            :label="`${t('student.upcoming')} (${upcomingList.length})`"
            name="upcoming"
          />
          <el-tab-pane
            :label="`${t('student.finished')} (${finishedList.length})`"
            name="finished"
          />
        </el-tabs>

        <el-empty v-if="!currentList.length" :description="emptyDescription" class="tab-empty" />

        <!-- Mobile card list -->
        <div v-else-if="isMobile" class="exam-cards">
          <article v-for="row in currentList" :key="`${row.examId}-${row.attemptId ?? 'new'}`" class="exam-card">
            <div class="exam-card-head">
              <h3 class="exam-card-title">{{ examTitle(row.examId, row.title) }}</h3>
              <el-tag size="small" :type="statusTagType(row)">
                {{ candidateStatusLabel(row.candidateState, row.statusLabel) }}
              </el-tag>
            </div>

            <dl class="exam-card-meta">
              <div v-if="row.category" class="meta-row">
                <dt>{{ t('student.colCategory') }}</dt>
                <dd>{{ categoryName(undefined, row.category) }}</dd>
              </div>
              <div v-if="activeTab === 'upcoming'" class="meta-row">
                <dt>{{ t('student.colSchedule') }}</dt>
                <dd>{{ formatRange(row.startTime, row.endTime) }}</dd>
              </div>
              <div v-if="activeTab === 'upcoming'" class="meta-row">
                <dt>{{ t('student.colDuration') }}</dt>
                <dd>{{ row.durationMinutes }} {{ t('common.minutes') }}</dd>
              </div>
              <div v-if="activeTab === 'finished'" class="meta-row">
                <dt>{{ t('student.colSubmitted') }}</dt>
                <dd>
                  {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
                </dd>
              </div>
              <div v-if="activeTab === 'finished'" class="meta-row">
                <dt>{{ t('student.colResult') }}</dt>
                <dd>{{ resultText(row) }}</dd>
              </div>
            </dl>

            <div class="exam-card-actions">
              <el-button
                v-if="canClickAction(row)"
                type="primary"
                class="action-btn"
                @click="onAction(row)"
              >
                {{ candidateActionLabel(row.actionLabel) }}
              </el-button>
              <span v-else class="muted">{{ candidateActionLabel(row.actionLabel) }}</span>
            </div>
          </article>
        </div>

        <!-- Desktop tables -->
        <template v-else>
          <el-table v-if="activeTab === 'upcoming'" :data="upcomingList" stripe class="exam-table">
            <el-table-column :label="t('student.colExam')" min-width="160">
              <template #default="{ row }">{{ examTitle(row.examId, row.title) }}</template>
            </el-table-column>
            <el-table-column :label="t('student.colCategory')" width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ categoryName(undefined, row.category) }}</template>
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
            <el-table-column :label="t('student.colAction')" width="150">
              <template #default="{ row }">
                <el-button
                  v-if="canClickAction(row)"
                  type="primary"
                  size="small"
                  @click="onAction(row)"
                >
                  {{ candidateActionLabel(row.actionLabel) }}
                </el-button>
                <span v-else class="muted">{{ candidateActionLabel(row.actionLabel) }}</span>
              </template>
            </el-table-column>
          </el-table>

          <el-table v-else :data="finishedList" stripe class="exam-table">
            <el-table-column :label="t('student.colExam')" min-width="160">
              <template #default="{ row }">{{ examTitle(row.examId, row.title) }}</template>
            </el-table-column>
            <el-table-column :label="t('student.colSubmitted')" width="170">
              <template #default="{ row }">
                {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
              </template>
            </el-table-column>
            <el-table-column :label="t('student.colResult')" width="160">
              <template #default="{ row }">{{ resultText(row) }}</template>
            </el-table-column>
            <el-table-column :label="t('student.colAction')" width="150">
              <template #default="{ row }">
                <el-button
                  v-if="canClickAction(row)"
                  type="primary"
                  link
                  @click="onAction(row)"
                >
                  {{ candidateActionLabel(row.actionLabel) }}
                </el-button>
                <span v-else class="muted">{{ t('student.pending') }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.my-exams {
  width: 100%;
  max-width: 960px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 1rem;
}
.page-header-text {
  min-width: 0;
  flex: 1;
}
.page-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1.35rem;
}
.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.4;
}
.refresh-btn {
  flex-shrink: 0;
}
.content-wrap {
  min-height: 120px;
}
.desktop-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.exam-table {
  width: 100%;
}
.mobile-tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}
.mobile-tab {
  appearance: none;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #fff;
  color: #374151;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 12px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 56px;
  -webkit-tap-highlight-color: transparent;
}
.mobile-tab.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}
.tab-count {
  font-size: 0.8rem;
  font-weight: 500;
  color: #6b7280;
}
.mobile-tab.active .tab-count {
  color: #2563eb;
}
.exam-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.exam-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}
.exam-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.exam-card-title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.35;
  color: #111827;
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.exam-card-meta {
  margin: 0 0 14px;
}
.meta-row {
  display: grid;
  grid-template-columns: minmax(72px, 34%) 1fr;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid #f3f4f6;
}
.meta-row:first-child {
  border-top: none;
  padding-top: 0;
}
.meta-row dt {
  margin: 0;
  color: #6b7280;
  font-size: 0.82rem;
  font-weight: 500;
}
.meta-row dd {
  margin: 0;
  color: #111827;
  font-size: 0.88rem;
  line-height: 1.4;
  word-break: break-word;
}
.exam-card-actions {
  display: flex;
  justify-content: stretch;
}
.action-btn {
  width: 100%;
  min-height: 44px;
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
.tab-empty {
  padding: 24px 0;
}

@media (max-width: 768px) {
  .page-header h2 {
    font-size: 1.2rem;
  }
  .subtitle {
    font-size: 0.85rem;
  }
}
</style>
