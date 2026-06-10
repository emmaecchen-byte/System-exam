<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Download, Refresh, Search } from '@element-plus/icons-vue';
import {
  AuditLogRow,
  exportAuditLogs,
  fetchAuditActions,
  fetchAuditActors,
  fetchAuditLogs,
} from '@/api/audit';

const { t } = useI18n();

const loading = ref(false);
const exporting = ref(false);
const logs = ref<AuditLogRow[]>([]);
const expandedId = ref<string | null>(null);

const filterOptions = reactive({
  actions: [] as Array<{ value: string; label: string; category: string }>,
  categories: [] as Array<{ value: string; label: string }>,
  objectTypes: [] as string[],
  actors: [] as Array<{ id: string; name: string; employeeNo: string }>,
});

const filters = reactive({
  actorId: '',
  actions: [] as string[],
  actionCategory: '',
  objectType: '',
  search: '',
  dateRange: [] as string[],
});

const pagination = reactive({ page: 1, pageSize: 50, total: 0 });

const categoryLabel = computed(() => {
  const map = Object.fromEntries(filterOptions.categories.map((c) => [c.value, c.label]));
  return (value: string) => map[value] ?? value;
});

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function buildQuery() {
  return {
    actorId: filters.actorId || undefined,
    actions: filters.actions.length ? filters.actions : undefined,
    actionCategory: filters.actionCategory || undefined,
    objectType: filters.objectType || undefined,
    search: filters.search.trim() || undefined,
    from: filters.dateRange[0] || undefined,
    to: filters.dateRange[1] || undefined,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

async function loadFilters() {
  const [actionsRes, actorsRes] = await Promise.all([fetchAuditActions(), fetchAuditActors()]);
  filterOptions.actions = actionsRes.data.actions;
  filterOptions.categories = actionsRes.data.categories;
  filterOptions.objectTypes = actionsRes.data.objectTypes;
  filterOptions.actors = actorsRes.data;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchAuditLogs(buildQuery());
    logs.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('audit.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
  load();
}

function toggleExpand(row: AuditLogRow) {
  expandedId.value = expandedId.value === row.id ? null : row.id;
}

function diffKeys(before: unknown, after: unknown): string[] {
  const keys = new Set<string>();
  if (before && typeof before === 'object') Object.keys(before as object).forEach((k) => keys.add(k));
  if (after && typeof after === 'object') Object.keys(after as object).forEach((k) => keys.add(k));
  return [...keys];
}

function diffValue(data: unknown, key: string) {
  if (!data || typeof data !== 'object') return '—';
  const value = (data as Record<string, unknown>)[key];
  return value === undefined ? '—' : JSON.stringify(value);
}

async function doExport(format: 'xlsx' | 'json') {
  exporting.value = true;
  try {
    await exportAuditLogs(buildQuery(), format);
    ElMessage.success(t('audit.exportDownloaded'));
  } catch {
    ElMessage.error(t('audit.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await loadFilters();
  await load();
});
</script>

<template>
  <div class="audit-page">
    <div class="page-header">
      <h2>{{ t('audit.title') }}</h2>
      <div class="header-actions">
        <el-button :loading="exporting" :icon="Download" @click="doExport('xlsx')">
          {{ t('audit.exportExcel') }}
        </el-button>
        <el-button :loading="exporting" @click="doExport('json')">{{ t('audit.exportJson') }}</el-button>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('audit.appendOnlyTitle')"
      :description="t('audit.appendOnlyDesc')"
      class="info-banner"
    />

    <el-card shadow="never" class="filters">
      <el-form inline @submit.prevent="onSearch">
        <el-form-item :label="t('audit.filterDate')">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            :range-separator="t('common.to')"
            :start-placeholder="t('common.from')"
            :end-placeholder="t('common.to')"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            @change="onSearch"
          />
        </el-form-item>
        <el-form-item :label="t('audit.filterActor')">
          <el-select
            v-model="filters.actorId"
            clearable
            filterable
            :placeholder="t('audit.allUsers')"
            style="width: 200px"
            @change="onSearch"
          >
            <el-option
              v-for="a in filterOptions.actors"
              :key="a.id"
              :label="`${a.name} (${a.employeeNo})`"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterActions')">
          <el-select
            v-model="filters.actions"
            multiple
            collapse-tags
            clearable
            :placeholder="t('audit.allActions')"
            style="width: 220px"
            @change="onSearch"
          >
            <el-option
              v-for="a in filterOptions.actions"
              :key="a.value"
              :label="a.label"
              :value="a.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterCategory')">
          <el-select
            v-model="filters.actionCategory"
            clearable
            :placeholder="t('common.all')"
            style="width: 160px"
            @change="onSearch"
          >
            <el-option
              v-for="c in filterOptions.categories"
              :key="c.value"
              :label="c.label"
              :value="c.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterObject')">
          <el-select
            v-model="filters.objectType"
            clearable
            :placeholder="t('audit.allTypes')"
            style="width: 150px"
            @change="onSearch"
          >
            <el-option v-for="t in filterOptions.objectTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterSearch')">
          <el-input
            v-model="filters.search"
            :placeholder="t('audit.searchPlaceholder')"
            clearable
            style="width: 220px"
            @clear="onSearch"
            @keyup.enter="onSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="onSearch">{{ t('audit.filter') }}</el-button>
          <el-button :icon="Refresh" @click="load">{{ t('common.refresh') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="logs" stripe row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand-panel">
            <el-descriptions :column="2" border size="small" class="detail-desc">
              <el-descriptions-item :label="t('audit.objectId')">{{ row.objectId ?? '—' }}</el-descriptions-item>
              <el-descriptions-item :label="t('audit.colIp')">{{ row.ipAddress ?? '—' }}</el-descriptions-item>
              <el-descriptions-item :label="t('audit.userAgent')" :span="2">
                {{ row.userAgent ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('audit.device')">
                {{
                  row.deviceInfo
                    ? `${row.deviceInfo.browser ?? '?'} / ${row.deviceInfo.os ?? '?'}`
                    : '—'
                }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('audit.reason')">{{ row.reason ?? '—' }}</el-descriptions-item>
            </el-descriptions>

            <div v-if="row.beforeData || row.afterData" class="diff-section">
              <h4>{{ t('audit.beforeAfter') }}</h4>
              <el-table
                v-if="diffKeys(row.beforeData, row.afterData).length"
                :data="diffKeys(row.beforeData, row.afterData).map((key) => ({ key }))"
                size="small"
                border
              >
                <el-table-column prop="key" :label="t('audit.colField')" width="160" />
                <el-table-column :label="t('audit.colBefore')">
                  <template #default="{ row: diffRow }">
                    <code>{{ diffValue(row.beforeData, diffRow.key) }}</code>
                  </template>
                </el-table-column>
                <el-table-column :label="t('audit.colAfter')">
                  <template #default="{ row: diffRow }">
                    <code>{{ diffValue(row.afterData, diffRow.key) }}</code>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="json-fallback">
                <div v-if="row.beforeData">
                  <strong>{{ t('audit.before') }}</strong>
                  <pre>{{ JSON.stringify(row.beforeData, null, 2) }}</pre>
                </div>
                <div v-if="row.afterData">
                  <strong>{{ t('audit.after') }}</strong>
                  <pre>{{ JSON.stringify(row.afterData, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('audit.colTime')" width="170">
        <template #default="{ row }">{{ formatDate(row.timestamp) }}</template>
      </el-table-column>
      <el-table-column prop="actorName" :label="t('audit.colActor')" min-width="130" />
      <el-table-column :label="t('audit.colRole')" width="120">
        <template #default="{ row }">{{ row.actorRole ?? '—' }}</template>
      </el-table-column>
      <el-table-column prop="actionLabel" :label="t('audit.colAction')" width="130" />
      <el-table-column :label="t('audit.colCategory')" width="150">
        <template #default="{ row }">{{ categoryLabel(row.actionCategory) }}</template>
      </el-table-column>
      <el-table-column prop="objectType" :label="t('audit.colObjectType')" width="120" />
      <el-table-column :label="t('audit.colObject')" min-width="160">
        <template #default="{ row }">{{ row.objectName ?? row.objectId ?? '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('audit.colIp')" width="120">
        <template #default="{ row }">{{ row.ipAddress ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="" width="80">
        <template #default="{ row }">
          <el-button link type="primary" @click="toggleExpand(row)">
            {{ expandedId === row.id ? t('audit.hide') : t('audit.details') }}
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
        @current-change="load"
        @size-change="
          () => {
            pagination.page = 1;
            load();
          }
        "
      />
    </div>
  </div>
</template>

<style scoped>
.audit-page {
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
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.info-banner {
  margin-bottom: 0;
}

.filters :deep(.el-form-item) {
  margin-bottom: 12px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
}

.expand-panel {
  padding: 12px 24px 16px;
}

.detail-desc {
  margin-bottom: 16px;
}

.diff-section h4 {
  margin: 0 0 8px;
  font-size: 14px;
}

.json-fallback pre {
  background: #f3f4f6;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow: auto;
}

code {
  font-size: 12px;
  word-break: break-all;
}
</style>
