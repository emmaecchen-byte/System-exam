<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { fetchGradingQueue, fetchGradingStats, GradingQueueItem } from '@/api/grading';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const isAdmin = () =>
  auth.user?.roles.includes(ROLES.SUPER_ADMIN) || auth.user?.roles.includes(ROLES.ADMIN);

const loading = ref(false);
const items = ref<GradingQueueItem[]>([]);
const stats = ref({ pending: 0, inProgress: 0, completed: 0, total: 0 });
const activeTab = ref<'need' | 'finished'>('need');

const filters = ref({
  search: '',
  examId: '',
  sessionId: '',
});

const needToGradeList = computed(() =>
  items.value.filter((row) => row.gradingStatus !== 'completed'),
);

const finishedList = computed(() =>
  [...items.value.filter((row) => row.gradingStatus === 'completed')].sort((a, b) => {
    const aTime = new Date(a.gradedAt ?? a.submittedAt ?? 0).getTime();
    const bTime = new Date(b.gradedAt ?? b.submittedAt ?? 0).getTime();
    return bTime - aTime;
  }),
);

const needToGradeCount = computed(() => needToGradeList.value.length);
const finishedCount = computed(() => finishedList.value.length);

function statusTagType(status: string) {
  if (status === 'pending') return 'info';
  if (status === 'in_progress') return 'warning';
  return 'success';
}

function gradingStatusLabel(status: string) {
  if (status === 'pending') return t('grading.gradingNotStarted');
  if (status === 'in_progress') return t('grading.gradingInProgress');
  return t('grading.gradingGraded');
}

function resultTagType(result?: string | null) {
  if (result === 'PASS') return 'success';
  if (result === 'FAIL') return 'danger';
  return 'info';
}

function resultLabel(row: GradingQueueItem) {
  if (!row.result) return '—';
  return row.result === 'PASS' ? t('common.pass') : t('common.fail');
}

async function load() {
  loading.value = true;
  try {
    const [queueRes, statsRes] = await Promise.all([
      fetchGradingQueue({
        search: filters.value.search || undefined,
        examId: filters.value.examId || undefined,
        sessionId: filters.value.sessionId || undefined,
      }),
      fetchGradingStats(),
    ]);
    items.value = queueRes.data.data;
    stats.value = statsRes.data;

    if (!needToGradeList.value.length && finishedList.value.length) {
      activeTab.value = 'finished';
    }
  } catch {
    ElMessage.error(t('grading.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openAttempt(row: GradingQueueItem) {
  router.push(`/grading/attempts/${row.attemptId}`);
}

function gradeActionLabel(row: GradingQueueItem) {
  if (row.gradingStatus === 'in_progress') return t('grading.continue');
  return t('grading.grade');
}

onMounted(() => {
  if (route.query.tab === 'finished') {
    activeTab.value = 'finished';
  }
  load();
});
</script>

<template>
  <div class="grading-queue">
    <div class="page-header">
      <div>
        <h2>{{ t('grading.queueTitle') }}</h2>
        <p class="subtitle">{{ t('grading.queueSubtitleExtended') }}</p>
      </div>
      <div class="stats">
        <el-tag type="warning">{{ t('grading.needToGradeCount', { count: needToGradeCount }) }}</el-tag>
        <el-tag type="success">{{ t('grading.finishedCount', { count: finishedCount }) }}</el-tag>
      </div>
    </div>

    <el-card shadow="never" class="filters">
      <el-form inline @submit.prevent="load">
        <el-form-item :label="t('common.search')">
          <el-input
            v-model="filters.search"
            :placeholder="t('grading.searchCandidate')"
            clearable
            style="width: 220px"
            @clear="load"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load">{{ t('common.search') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-empty v-if="!loading && !items.length" :description="t('grading.noSubmissions')" />

    <el-tabs v-else v-model="activeTab" v-loading="loading">
      <el-tab-pane :label="`${t('dashboard.needToGrade')} (${needToGradeCount})`" name="need">
        <el-empty v-if="!needToGradeList.length" :description="t('grading.allCaughtUp')" />
        <el-table
          v-else
          :data="needToGradeList"
          stripe
          class="queue-table"
          @row-click="(row: GradingQueueItem) => openAttempt(row)"
        >
          <el-table-column prop="candidateName" :label="t('grading.colCandidate')" min-width="140" />
          <el-table-column prop="candidateEmployeeNo" :label="t('grading.colEmployeeNo')" width="120" />
          <el-table-column prop="examTitle" :label="t('grading.colExam')" min-width="180" />
          <el-table-column prop="sessionName" :label="t('grading.colSession')" width="160">
            <template #default="{ row }">{{ row.sessionName ?? '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('grading.colSubmitted')" width="170">
            <template #default="{ row }">
              {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('grading.colObjective')" width="100">
            <template #default="{ row }">{{ row.objectiveScore }}</template>
          </el-table-column>
          <el-table-column :label="t('grading.colPendingQs')" width="100">
            <template #default="{ row }">
              {{ row.pendingQuestionCount }}/{{ row.totalSubjectiveCount }}
            </template>
          </el-table-column>
          <el-table-column :label="t('grading.colStatus')" width="120">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.gradingStatus)" size="small">
                {{ gradingStatusLabel(row.gradingStatus) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="isAdmin()" :label="t('grading.colGrader')" width="120">
            <template #default="{ row }">{{ row.assignedGrader?.name ?? t('grading.unassigned') }}</template>
          </el-table-column>
          <el-table-column :label="t('grading.colActions')" width="110" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openAttempt(row)">
                {{ gradeActionLabel(row) }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`${t('dashboard.finishedGrading')} (${finishedCount})`" name="finished">
        <el-empty v-if="!finishedList.length" :description="t('grading.noGradedYet')" />
        <el-table
          v-else
          :data="finishedList"
          stripe
          class="queue-table"
          @row-click="openAttempt"
        >
          <el-table-column prop="candidateName" :label="t('grading.colCandidate')" min-width="140" />
          <el-table-column prop="candidateEmployeeNo" :label="t('grading.colEmployeeNo')" width="120" />
          <el-table-column prop="examTitle" :label="t('grading.colExam')" min-width="180" />
          <el-table-column prop="sessionName" :label="t('grading.colSession')" width="160">
            <template #default="{ row }">{{ row.sessionName ?? '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('grading.colSubmitted')" width="170">
            <template #default="{ row }">
              {{ row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('grading.colGraded')" width="170">
            <template #default="{ row }">
              {{ row.gradedAt ? new Date(row.gradedAt).toLocaleString() : '—' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('grading.colTotalScore')" width="120">
            <template #default="{ row }">
              <strong>{{ row.totalScore }}</strong> / {{ row.passScore }}
            </template>
          </el-table-column>
          <el-table-column :label="t('grading.colResult')" width="100">
            <template #default="{ row }">
              <el-tag :type="resultTagType(row.result)" size="small">
                {{ resultLabel(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="isAdmin()" :label="t('grading.colGrader')" width="120">
            <template #default="{ row }">{{ row.assignedGrader?.name ?? '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('grading.colActions')" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openAttempt(row)">{{ t('grading.view') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-card v-if="items.length" class="legend" shadow="never">
      <p class="legend-title">{{ t('grading.statusGuide') }}</p>
      <ul class="legend-list">
        <li>{{ t('grading.statusNeedToGrade') }}</li>
        <li>{{ t('grading.statusNotStarted') }}</li>
        <li>{{ t('grading.statusInProgress') }}</li>
        <li>{{ t('grading.statusFinishedGrading') }}</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.grading-queue {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
}
.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
}
.filters {
  margin-bottom: 0;
}
.queue-table {
  width: 100%;
}
.legend {
  margin-top: 4px;
}
.legend-title {
  margin: 0 0 8px;
  font-weight: 600;
}
.legend-list {
  margin: 0;
  padding-left: 20px;
  color: #6b7280;
  font-size: 14px;
}
.legend-list li + li {
  margin-top: 4px;
}
</style>
