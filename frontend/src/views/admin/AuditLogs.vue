<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
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
import { useAuditLabels } from '@/composables/useAuditLabels';

const { t } = useI18n();
const {
  auditAction,
  auditObjectType,
  auditActorRole,
  auditActorName,
} = useAuditLabels();

const loading = ref(false);
const exporting = ref(false);
const logs = ref<AuditLogRow[]>([]);
const detailRow = ref<AuditLogRow | null>(null);
const drawerVisible = ref(false);

const filterOptions = reactive({
  actions: [] as Array<{ value: string; label: string; category: string }>,
  objectTypes: [] as string[],
  actors: [] as Array<{ id: string; name: string; employeeNo: string }>,
});

const defaultFilters = () => ({
  actorId: '',
  action: '',
  objectType: '',
  search: '',
  dateRange: [] as string[],
});

const draftFilters = reactive(defaultFilters());
const appliedFilters = reactive(defaultFilters());

const pagination = reactive({ page: 1, pageSize: 50, total: 0 });

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatDeviceInfo(row: AuditLogRow, maxLen = 36) {
  if (!row.deviceInfo) return row.userAgent ? truncate(row.userAgent, maxLen) : '—';
  const text = [row.deviceInfo.browser, row.deviceInfo.os].filter(Boolean).join(' / ');
  return truncate(text || '—', maxLen);
}

function fullDeviceInfo(row: AuditLogRow) {
  const parts: string[] = [];
  if (row.deviceInfo?.browser) parts.push(`Browser: ${row.deviceInfo.browser}`);
  if (row.deviceInfo?.os) parts.push(`OS: ${row.deviceInfo.os}`);
  if (row.userAgent) parts.push(`User Agent: ${row.userAgent}`);
  return parts.length ? parts.join('\n') : '—';
}

function truncate(value: string, maxLen: number) {
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function formatJson(data: unknown) {
  if (data === null || data === undefined) return '—';
  return JSON.stringify(data, null, 2);
}

function buildQuery() {
  return {
    actorId: appliedFilters.actorId || undefined,
    actions: appliedFilters.action ? [appliedFilters.action] : undefined,
    objectType: appliedFilters.objectType || undefined,
    search: appliedFilters.search.trim() || undefined,
    from: appliedFilters.dateRange[0] || undefined,
    to: appliedFilters.dateRange[1] || undefined,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

async function loadFilters() {
  const [actionsRes, actorsRes] = await Promise.all([fetchAuditActions(), fetchAuditActors()]);
  filterOptions.actions = actionsRes.data.actions;
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

function applyFilters() {
  Object.assign(appliedFilters, {
    actorId: draftFilters.actorId,
    action: draftFilters.action,
    objectType: draftFilters.objectType,
    search: draftFilters.search,
    dateRange: [...draftFilters.dateRange],
  });
  pagination.page = 1;
  load();
}

function resetFilters() {
  Object.assign(draftFilters, defaultFilters());
  Object.assign(appliedFilters, defaultFilters());
  pagination.page = 1;
  load();
}

function openDetail(row: AuditLogRow) {
  detailRow.value = row;
  drawerVisible.value = true;
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

async function handleExport() {
  exporting.value = true;
  try {
    await exportAuditLogs(buildQuery(), 'csv');
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
      <div>
        <h2>{{ t('audit.title') }}</h2>
        <p class="subtitle">{{ t('audit.subtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Download" :loading="exporting" @click="handleExport">
        {{ t('audit.exportCsv') }}
      </el-button>
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
      <el-form inline @submit.prevent="applyFilters">
        <el-form-item :label="t('audit.filterDate')">
          <el-date-picker
            v-model="draftFilters.dateRange"
            type="datetimerange"
            :range-separator="t('common.to')"
            :start-placeholder="t('common.from')"
            :end-placeholder="t('common.to')"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
          />
        </el-form-item>
        <el-form-item :label="t('audit.filterActor')">
          <el-select
            v-model="draftFilters.actorId"
            clearable
            filterable
            :placeholder="t('audit.allUsers')"
            style="width: 200px"
          >
            <el-option
              v-for="a in filterOptions.actors"
              :key="a.id"
              :label="`${auditActorName(a.name, a.employeeNo)} (${a.employeeNo})`"
              :value="a.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterAction')">
          <el-select
            v-model="draftFilters.action"
            clearable
            filterable
            :placeholder="t('audit.allActions')"
            style="width: 200px"
          >
            <el-option
              v-for="a in filterOptions.actions"
              :key="a.value"
              :label="auditAction(a.value, a.label)"
              :value="a.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterObject')">
          <el-select
            v-model="draftFilters.objectType"
            clearable
            :placeholder="t('audit.allTypes')"
            style="width: 160px"
          >
            <el-option
              v-for="ot in filterOptions.objectTypes"
              :key="ot"
              :label="auditObjectType(ot)"
              :value="ot"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('audit.filterSearch')">
          <el-input
            v-model="draftFilters.search"
            :placeholder="t('audit.searchActorObjectId')"
            clearable
            style="width: 240px"
            @keyup.enter="applyFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyFilters">{{ t('audit.applyFilters') }}</el-button>
          <el-button :icon="Refresh" @click="resetFilters">{{ t('audit.resetFilters') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table
        v-loading="loading"
        :data="logs"
        stripe
        row-key="id"
        highlight-current-row
        class="audit-table"
        @row-click="openDetail"
      >
        <el-table-column :label="t('audit.colTime')" width="170">
          <template #default="{ row }">{{ formatDate(row.timestamp) }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.colActor')" min-width="130">
          <template #default="{ row }">
            {{ auditActorName(row.actorName, row.actorEmployeeNo) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('audit.colRole')" width="130">
          <template #default="{ row }">{{ auditActorRole(row.actorRole) }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.colAction')" width="140">
          <template #default="{ row }">{{ auditAction(row.action, row.actionLabel) }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.colObjectType')" width="130">
          <template #default="{ row }">{{ auditObjectType(row.objectType) }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.objectId')" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.objectId ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.colIp')" width="120">
          <template #default="{ row }">{{ row.ipAddress ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('audit.colDeviceInfo')" min-width="150">
          <template #default="{ row }">
            <el-tooltip :content="fullDeviceInfo(row)" placement="top" :show-after="400">
              <span class="device-cell">{{ formatDeviceInfo(row) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column :label="t('audit.reason')" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason ?? '—' }}</template>
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

    <el-drawer
      v-model="drawerVisible"
      :title="t('audit.detailTitle')"
      size="520px"
      destroy-on-close
    >
      <template v-if="detailRow">
        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item :label="t('audit.colTime')">
            {{ formatDate(detailRow.timestamp) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.colActor')">
            {{ auditActorName(detailRow.actorName, detailRow.actorEmployeeNo) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.colRole')">
            {{ auditActorRole(detailRow.actorRole) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.colAction')">
            {{ auditAction(detailRow.action, detailRow.actionLabel) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.colObjectType')">
            {{ auditObjectType(detailRow.objectType) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.objectId')">
            {{ detailRow.objectId ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.colIp')">
            {{ detailRow.ipAddress ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.fullDeviceInfo')">
            <pre class="detail-pre">{{ fullDeviceInfo(detailRow) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item :label="t('audit.reason')">
            {{ detailRow.reason ?? '—' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="detailRow.beforeData" class="json-block">
          <h4>{{ t('audit.before') }}</h4>
          <pre class="detail-pre">{{ formatJson(detailRow.beforeData) }}</pre>
        </div>
        <div v-if="detailRow.afterData" class="json-block">
          <h4>{{ t('audit.after') }}</h4>
          <pre class="detail-pre">{{ formatJson(detailRow.afterData) }}</pre>
        </div>
      </template>
    </el-drawer>
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
  align-items: flex-start;
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
}

.info-banner {
  margin-bottom: 0;
}

.filters :deep(.el-form-item) {
  margin-bottom: 12px;
}

.table-card {
  border-radius: 12px;
}

.audit-table :deep(.el-table__row) {
  cursor: pointer;
}

.device-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-desc {
  margin-bottom: 16px;
}

.json-block {
  margin-top: 16px;
}

.json-block h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.detail-pre {
  margin: 0;
  padding: 12px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  max-height: 280px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
