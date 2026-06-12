<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Paperclip } from '@element-plus/icons-vue';
import { downloadPaperAttachment, type PaperListItem } from '@/api/papers';
import { ElMessage } from 'element-plus';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

defineProps<{
  loading: boolean;
  list: PaperListItem[];
  total: number;
  page: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  edit: [row: PaperListItem];
  delete: [row: PaperListItem];
  archive: [row: PaperListItem];
  unarchive: [row: PaperListItem];
  'page-change': [page: number];
  'size-change': [size: number];
}>();

const { t } = useI18n();
const { contentStatus } = useLocalizedLabels();
const { categoryName, paperTitle } = useSeedDataLabels();

function statusTagType(status: string) {
  if (status === 'DRAFT') return 'info';
  if (status === 'ACTIVE') return 'success';
  return 'warning';
}

function formatDate(v: string) {
  return new Date(v).toLocaleString();
}

function deleteDisabledReason(row: PaperListItem): string | null {
  if (row.status === 'ACTIVE') return t('papers.archiveBeforeDelete');
  if (row.examCount > 0) return t('papers.referencedByExams', { count: row.examCount });
  if (row.status !== 'DRAFT' && row.status !== 'ARCHIVED') return t('papers.cannotDelete');
  return null;
}

async function downloadAttachment(row: PaperListItem, event: Event) {
  event.stopPropagation();
  if (!row.hasAttachment) return;
  try {
    await downloadPaperAttachment(row.id, row.attachment?.fileName ?? undefined);
  } catch {
    ElMessage.error(t('paperForm.downloadFailed'));
  }
}
</script>

<template>
  <el-table v-loading="loading" :data="list" stripe>
    <el-table-column :label="t('papers.colTitle')" min-width="200">
      <template #default="{ row }">{{ paperTitle(row.id, row.title) }}</template>
    </el-table-column>
    <el-table-column :label="t('papers.colCategory')" width="160" show-overflow-tooltip>
      <template #default="{ row }">{{ categoryName(row.category?.id, row.category?.name) }}</template>
    </el-table-column>
    <el-table-column prop="versionLabel" :label="t('papers.colVersion')" width="90" />
    <el-table-column prop="totalScore" :label="t('papers.colTotalScore')" width="110" />
    <el-table-column :label="t('papers.colQuestions')" width="100">
      <template #default="{ row }">{{ row.questionCount }}</template>
    </el-table-column>
    <el-table-column :label="t('papers.colAttachment')" width="90" align="center">
      <template #default="{ row }">
        <el-tooltip
          v-if="row.hasAttachment"
          :content="t('paperForm.downloadAttachmentTooltip')"
          placement="top"
        >
          <el-button
            link
            type="primary"
            :aria-label="t('paperForm.downloadAttachmentTooltip')"
            @click="downloadAttachment(row, $event)"
          >
            <el-icon :size="18"><Paperclip /></el-icon>
          </el-button>
        </el-tooltip>
        <span v-else class="muted">—</span>
      </template>
    </el-table-column>
    <el-table-column :label="t('papers.colStatus')" width="110">
      <template #default="{ row }">
        <el-tag :type="statusTagType(row.status)" size="small">{{ contentStatus(row.status) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column :label="t('papers.colLastModified')" width="170">
      <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
    </el-table-column>
    <el-table-column :label="t('papers.colActions')" width="140" fixed="right">
      <template #default="{ row }">
        <div class="action-buttons">
          <el-button link type="primary" @click="emit('edit', row)">{{ t('common.edit') }}</el-button>
          <el-tooltip
            v-if="deleteDisabledReason(row)"
            :content="deleteDisabledReason(row)!"
            placement="top"
          >
            <span class="action-disabled-wrap">
              <el-button link type="danger" disabled>{{ t('common.delete') }}</el-button>
            </span>
          </el-tooltip>
          <el-button v-else link type="danger" @click="emit('delete', row)">{{ t('common.delete') }}</el-button>
          <el-button
            v-if="row.status === 'ACTIVE'"
            link
            type="warning"
            @click="emit('archive', row)"
          >
            {{ t('common.archive') }}
          </el-button>
          <el-button
            v-if="row.status === 'ARCHIVED'"
            link
            type="success"
            @click="emit('unarchive', row)"
          >
            {{ t('common.unarchive') }}
          </el-button>
        </div>
      </template>
    </el-table-column>
  </el-table>

  <div class="pagination">
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      layout="total, sizes, prev, pager, next"
      @current-change="emit('page-change', $event)"
      @size-change="emit('size-change', $event)"
    />
  </div>
</template>

<style scoped>
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.action-buttons {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.action-disabled-wrap {
  display: inline-block;
}
.muted {
  color: #9ca3af;
}
</style>
