<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import * as XLSX from 'xlsx';
import type { EChartsOption } from 'echarts';
import { fetchExams } from '@/api/exams';
import { fetchCategoryOptions } from '@/api/categories';
import {
  fetchCategoryTrend,
  fetchDepartmentStats,
  fetchQuestionAnalysis,
  type DepartmentStatsResponse,
  type QuestionAnalysisItem,
  type QuestionAnalysisResponse,
} from '@/api/reports';
import EChart from '@/components/charts/EChart.vue';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { examTitle, categoryName } = useSeedDataLabels();

const activeTab = ref('department');
const exams = ref<Array<{ id: string; title: string }>>([]);
const categories = ref<Array<{ id: string; name: string; parentId: string | null }>>([]);

const deptLoading = ref(false);
const questionLoading = ref(false);
const trendLoading = ref(false);

const deptExamId = ref('');
const deptDateRange = ref<[Date, Date] | null>(null);
const deptStats = ref<DepartmentStatsResponse | null>(null);

const questionExamId = ref('');
const questionData = ref<QuestionAnalysisResponse | null>(null);
const questionDetail = ref<QuestionAnalysisItem | null>(null);
const detailVisible = ref(false);

const trendCategoryId = ref<string[]>([]);
const trendDateRange = ref<[Date, Date] | null>(null);
const trendInterval = ref<'day' | 'week' | 'month'>('week');
const trendPoints = ref<Array<{ period: string; passRate: number; avgScore: number; total: number }>>([]);

const categoryTree = computed(() => buildCategoryTree(categories.value));

const deptChartOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 48, right: 24, bottom: 64, top: 24 },
  xAxis: {
    type: 'category',
    data: deptStats.value?.departments.map((d) => d.name) ?? [],
    axisLabel: { rotate: 30, interval: 0 },
  },
  yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
  series: [
    {
      type: 'bar',
      data: deptStats.value?.departments.map((d) => d.passRate) ?? [],
      itemStyle: { color: '#7c3aed' },
      barMaxWidth: 48,
    },
  ],
}));

const passTrendChartOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 48, right: 24, bottom: 32, top: 24 },
  xAxis: { type: 'category', data: trendPoints.value.map((p) => p.period) },
  yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
  series: [
    {
      name: t('reports.passRate'),
      type: 'line',
      smooth: true,
      data: trendPoints.value.map((p) => p.passRate),
      itemStyle: { color: '#16a34a' },
    },
  ],
}));

const scoreTrendChartOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 48, right: 24, bottom: 32, top: 24 },
  xAxis: { type: 'category', data: trendPoints.value.map((p) => p.period) },
  yAxis: { type: 'value' },
  series: [
    {
      name: t('reports.avgScore'),
      type: 'line',
      smooth: true,
      data: trendPoints.value.map((p) => p.avgScore),
      itemStyle: { color: '#2563eb' },
    },
  ],
}));

function buildCategoryTree(
  items: Array<{ id: string; name: string; parentId: string | null }>,
) {
  type Node = { value: string; label: string; children?: Node[] };
  const map = new Map<string, Node>();
  for (const item of items) {
    map.set(item.id, { value: item.id, label: categoryName(item.id, item.name) });
  }
  const roots: Node[] = [];
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      const parent = map.get(item.parentId)!;
      parent.children ??= [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function defaultDateRange(): [Date, Date] {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return [start, end];
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function difficultyTagType(difficulty: string) {
  if (difficulty === 'easy') return 'success';
  if (difficulty === 'hard') return 'danger';
  return 'warning';
}

function rowClassName({ row }: { row: QuestionAnalysisItem }) {
  return row.correctRate < 60 ? 'needs-review' : '';
}

function openQuestionDetail(row: QuestionAnalysisItem) {
  questionDetail.value = row;
  detailVisible.value = true;
}

async function loadExams() {
  const { data } = await fetchExams({ page: 1, pageSize: 200 });
  exams.value = data.data.map((e) => ({ id: e.id, title: e.title }));
  if (!deptExamId.value && exams.value.length) deptExamId.value = exams.value[0].id;
  if (!questionExamId.value && exams.value.length) questionExamId.value = exams.value[0].id;
}

async function loadCategories() {
  const { data } = await fetchCategoryOptions();
  categories.value = data;
  if (!trendCategoryId.value.length && data.length) {
    trendCategoryId.value = [data[0].id];
  }
}

async function loadDepartmentStats() {
  if (!deptExamId.value) return;
  deptLoading.value = true;
  try {
    const { data } = await fetchDepartmentStats(
      deptExamId.value,
      deptDateRange.value?.[0] ? formatDateParam(deptDateRange.value[0]) : undefined,
      deptDateRange.value?.[1] ? formatDateParam(deptDateRange.value[1]) : undefined,
    );
    deptStats.value = data;
  } catch {
    ElMessage.error(t('reports.loadFailed'));
  } finally {
    deptLoading.value = false;
  }
}

async function loadQuestionAnalysis() {
  if (!questionExamId.value) return;
  questionLoading.value = true;
  try {
    const { data } = await fetchQuestionAnalysis(questionExamId.value);
    questionData.value = data;
  } catch {
    ElMessage.error(t('reports.loadFailed'));
  } finally {
    questionLoading.value = false;
  }
}

async function loadCategoryTrend() {
  const categoryId = trendCategoryId.value.at(-1);
  if (!categoryId) return;
  trendLoading.value = true;
  try {
    const { data } = await fetchCategoryTrend(categoryId, {
      startDate: trendDateRange.value?.[0] ? formatDateParam(trendDateRange.value[0]) : undefined,
      endDate: trendDateRange.value?.[1] ? formatDateParam(trendDateRange.value[1]) : undefined,
      interval: trendInterval.value,
    });
    trendPoints.value = data.points;
  } catch {
    ElMessage.error(t('reports.loadFailed'));
  } finally {
    trendLoading.value = false;
  }
}

function exportDepartmentExcel() {
  if (!deptStats.value?.departments.length) {
    ElMessage.warning(t('reports.noData'));
    return;
  }
  const rows = deptStats.value.departments.map((d) => ({
    Department: d.name,
    Participants: d.participantCount,
    'Pass Rate (%)': d.passRate,
    'Avg Score': d.avgScore,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Departments');
  XLSX.writeFile(wb, `department-stats-${deptExamId.value}.xlsx`);
}

function onTabChange(name: string | number) {
  if (name === 'department' && !deptStats.value) loadDepartmentStats();
  if (name === 'questions' && !questionData.value) loadQuestionAnalysis();
  if (name === 'trend' && !trendPoints.value.length) loadCategoryTrend();
}

onMounted(async () => {
  deptDateRange.value = defaultDateRange();
  trendDateRange.value = defaultDateRange();
  await Promise.all([loadExams(), loadCategories()]);
  await loadDepartmentStats();
});
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <div>
        <h2>{{ t('reports.title') }}</h2>
        <p class="subtitle">{{ t('reports.subtitle') }}</p>
      </div>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="t('reports.tabDepartment')" name="department">
        <el-card v-loading="deptLoading" shadow="never">
          <div class="filters">
            <el-form inline>
              <el-form-item :label="t('reports.exam')">
                <el-select v-model="deptExamId" filterable style="width: 280px">
                  <el-option
                    v-for="e in exams"
                    :key="e.id"
                    :label="examTitle(e.id, e.title)"
                    :value="e.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('reports.dateRange')">
                <el-date-picker
                  v-model="deptDateRange"
                  type="daterange"
                  :range-separator="t('common.to')"
                  :start-placeholder="t('common.from')"
                  :end-placeholder="t('common.to')"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="loadDepartmentStats">{{ t('reports.apply') }}</el-button>
                <el-button :icon="Download" @click="exportDepartmentExcel">{{ t('reports.exportExcel') }}</el-button>
              </el-form-item>
            </el-form>
          </div>

          <el-row v-if="deptStats" :gutter="16" class="summary-row">
            <el-col :span="12">
              <el-statistic :title="t('reports.overallPassRate')" :value="deptStats.overall.passRate" suffix="%" />
            </el-col>
            <el-col :span="12">
              <el-statistic :title="t('reports.overallAvgScore')" :value="deptStats.overall.avgScore" />
            </el-col>
          </el-row>

          <EChart v-if="deptStats?.departments.length" :option="deptChartOption" />

          <el-table :data="deptStats?.departments ?? []" stripe class="data-table">
            <el-table-column prop="name" :label="t('reports.colDepartment')" min-width="160" />
            <el-table-column prop="participantCount" :label="t('reports.colParticipants')" width="130" />
            <el-table-column :label="t('reports.colPassRate')" width="120">
              <template #default="{ row }">{{ row.passRate }}%</template>
            </el-table-column>
            <el-table-column prop="avgScore" :label="t('reports.colAvgScore')" width="120" />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('reports.tabQuestions')" name="questions">
        <el-card v-loading="questionLoading" shadow="never">
          <div class="filters">
            <el-form inline>
              <el-form-item :label="t('reports.exam')">
                <el-select v-model="questionExamId" filterable style="width: 280px">
                  <el-option
                    v-for="e in exams"
                    :key="e.id"
                    :label="examTitle(e.id, e.title)"
                    :value="e.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="loadQuestionAnalysis">{{ t('reports.apply') }}</el-button>
              </el-form-item>
            </el-form>
          </div>

          <el-row v-if="questionData?.summary" :gutter="16" class="summary-row">
            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="mini-stat">
                <p class="mini-label">{{ t('reports.easiestQuestion') }}</p>
                <p class="mini-value">
                  {{ questionData.summary.easiestQuestion?.stem ?? '—' }}
                  <el-tag v-if="questionData.summary.easiestQuestion" size="small" type="success">
                    {{ questionData.summary.easiestQuestion.correctRate }}%
                  </el-tag>
                </p>
              </el-card>
            </el-col>
            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="mini-stat">
                <p class="mini-label">{{ t('reports.hardestQuestion') }}</p>
                <p class="mini-value">
                  {{ questionData.summary.hardestQuestion?.stem ?? '—' }}
                  <el-tag v-if="questionData.summary.hardestQuestion" size="small" type="danger">
                    {{ questionData.summary.hardestQuestion.correctRate }}%
                  </el-tag>
                </p>
              </el-card>
            </el-col>
            <el-col :xs="24" :md="8">
              <el-card shadow="never" class="mini-stat">
                <p class="mini-label">{{ t('reports.avgDifficulty') }}</p>
                <el-tag :type="difficultyTagType(questionData.summary.averageDifficulty)" size="large">
                  {{ t(`reports.difficulty.${questionData.summary.averageDifficulty}`) }}
                </el-tag>
              </el-card>
            </el-col>
          </el-row>

          <el-table
            :data="questionData?.questions ?? []"
            stripe
            class="data-table question-table"
            :row-class-name="rowClassName"
            @row-click="openQuestionDetail"
          >
            <el-table-column prop="id" label="#" width="50" />
            <el-table-column prop="stem" :label="t('reports.colQuestion')" min-width="240" show-overflow-tooltip />
            <el-table-column prop="type" :label="t('reports.colType')" width="130" />
            <el-table-column :label="t('reports.colCorrectRate')" width="130" sortable prop="correctRate">
              <template #default="{ row }">
                <el-tag :type="row.correctRate < 60 ? 'danger' : row.correctRate >= 80 ? 'success' : 'warning'">
                  {{ row.correctRate }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="averageScore" :label="t('reports.colAvgScore')" width="110" />
            <el-table-column :label="t('reports.colDifficulty')" width="110">
              <template #default="{ row }">
                <el-tag :type="difficultyTagType(row.difficulty)" size="small">
                  {{ t(`reports.difficulty.${row.difficulty}`) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('reports.tabTrend')" name="trend">
        <el-card v-loading="trendLoading" shadow="never">
          <div class="filters">
            <el-form inline>
              <el-form-item :label="t('reports.category')">
                <el-cascader
                  v-model="trendCategoryId"
                  :options="categoryTree"
                  :props="{ checkStrictly: true, emitPath: true }"
                  filterable
                  style="width: 280px"
                />
              </el-form-item>
              <el-form-item :label="t('reports.dateRange')">
                <el-date-picker
                  v-model="trendDateRange"
                  type="daterange"
                  :range-separator="t('common.to')"
                  :start-placeholder="t('common.from')"
                  :end-placeholder="t('common.to')"
                />
              </el-form-item>
              <el-form-item :label="t('reports.interval')">
                <el-select v-model="trendInterval" style="width: 120px">
                  <el-option :label="t('reports.intervalDay')" value="day" />
                  <el-option :label="t('reports.intervalWeek')" value="week" />
                  <el-option :label="t('reports.intervalMonth')" value="month" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="loadCategoryTrend">{{ t('reports.apply') }}</el-button>
              </el-form-item>
            </el-form>
          </div>

          <el-row :gutter="16">
            <el-col :span="24">
              <h4 class="chart-title">{{ t('reports.passRateOverTime') }}</h4>
              <EChart :option="passTrendChartOption" />
            </el-col>
            <el-col :span="24">
              <h4 class="chart-title">{{ t('reports.avgScoreOverTime') }}</h4>
              <EChart :option="scoreTrendChartOption" />
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="detailVisible" :title="t('reports.questionDetail')" width="520px">
      <template v-if="questionDetail">
        <p><strong>{{ t('reports.colQuestion') }}:</strong> {{ questionDetail.stem }}</p>
        <el-descriptions :column="2" border size="small" class="detail-desc">
          <el-descriptions-item :label="t('reports.colType')">{{ questionDetail.type }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.colDifficulty')">
            {{ t(`reports.difficulty.${questionDetail.difficulty}`) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('reports.colCorrectRate')">
            {{ questionDetail.correctRate }}%
          </el-descriptions-item>
          <el-descriptions-item :label="t('reports.colAvgScore')">
            {{ questionDetail.averageScore }} / {{ questionDetail.maxScore }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('reports.correctCount')">
            {{ questionDetail.correctCount }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('reports.totalAttempts')">
            {{ questionDetail.totalAttempts }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
}
.filters {
  margin-bottom: 16px;
}
.summary-row {
  margin-bottom: 16px;
}
.data-table {
  margin-top: 16px;
}
.mini-stat {
  margin-bottom: 12px;
}
.mini-label {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b7280;
}
.mini-value {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.chart-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.detail-desc {
  margin-top: 16px;
}
:deep(.question-table .needs-review) {
  background-color: #fef2f2 !important;
}
:deep(.question-table .el-table__row) {
  cursor: pointer;
}
</style>
