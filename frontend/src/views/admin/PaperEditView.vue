<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchCategoryOptions } from '@/api/categories';
import {
  fetchPaper,
  fetchPaperVersions,
  PaperDetail,
  PaperListItem,
  publishPaper,
  updatePaper,
} from '@/api/papers';
import PaperForm from '@/views/admin/PaperForm.vue';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const { t } = useI18n();
const { contentStatus } = useLocalizedLabels();
const { categoryName, paperTitle } = useSeedDataLabels();

const route = useRoute();
const router = useRouter();
const paperId = route.params.id as string;

const loading = ref(true);
const saving = ref(false);
const paper = ref<PaperDetail | null>(null);
const categories = ref<Array<{ id: string; name: string }>>([]);
const versions = ref<PaperListItem[]>([]);

const form = ref({ title: '', categoryId: '' });

async function load() {
  loading.value = true;
  try {
    const [paperRes, catRes, verRes] = await Promise.all([
      fetchPaper(paperId),
      fetchCategoryOptions(),
      fetchPaperVersions(paperId).catch(() => ({ data: [] })),
    ]);
    paper.value = paperRes.data;
    form.value.title = paperRes.data.title;
    form.value.categoryId = paperRes.data.categoryId;
    categories.value = catRes.data;
    versions.value = verRes.data;
  } catch {
    ElMessage.error(t('paperEdit.loadFailed'));
    router.push('/papers');
  } finally {
    loading.value = false;
  }
}

async function saveMeta() {
  if (!paper.value?.isEditable) return;
  saving.value = true;
  try {
    const { data } = await updatePaper(paperId, {
      title: form.value.title.trim(),
      categoryId: form.value.categoryId,
    });
    paper.value = data;
    ElMessage.success(t('paperEdit.saved'));
  } catch {
    ElMessage.error(t('paperEdit.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function publish() {
  await ElMessageBox.confirm(
    t('paperEdit.publishConfirm'),
    t('paperEdit.publishTitle'),
    { type: 'warning' },
  );
  const { data } = await publishPaper(paperId);
  paper.value = data;
  ElMessage.success(t('paperEdit.publishedVersion', { version: data.version }));
  await load();
}

function onPaperUpdated(data: PaperDetail) {
  paper.value = data;
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="paper-edit">
    <div class="page-header">
      <div>
        <el-button link @click="router.push('/papers')">{{ t('paperEdit.backToPapers') }}</el-button>
        <h2>{{ paper ? paperTitle(paper.id, paper.title) : t('paperEdit.defaultTitle') }}</h2>
        <div class="meta">
          <el-tag>{{ paper ? contentStatus(paper.status) : '' }}</el-tag>
          <el-tag type="info">{{ paper?.versionLabel }}</el-tag>
        </div>
      </div>
      <div class="actions">
        <el-button v-if="paper?.isEditable" type="primary" @click="publish">{{ t('paperEdit.publish') }}</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="16">
        <PaperForm
          v-if="paper"
          :paper-id="paperId"
          :paper="paper"
          :is-editable="paper.isEditable"
          :attachment="paper.attachment"
          @updated="onPaperUpdated"
        />
      </el-col>

      <el-col :span="8">
        <el-card shadow="never" :header="t('paperEdit.paperDetails')">
          <el-form label-position="top">
            <el-form-item :label="t('common.title')">
              <el-input v-model="form.title" :disabled="!paper?.isEditable" />
            </el-form-item>
            <el-form-item :label="t('common.category')">
              <el-select v-model="form.categoryId" :disabled="!paper?.isEditable" style="width: 100%">
                <el-option
                  v-for="c in categories"
                  :key="c.id"
                  :label="categoryName(c.id, c.name)"
                  :value="c.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="paper?.isEditable">
              <el-button type="primary" :loading="saving" @click="saveMeta">{{ t('paperEdit.saveDetails') }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card v-if="versions.length" shadow="never" :header="t('paperEdit.versionHistory')" class="versions-card">
          <el-timeline>
            <el-timeline-item
              v-for="v in versions"
              :key="v.id"
              :type="v.id === paperId ? 'primary' : 'info'"
            >
              <router-link :to="`/papers/${v.id}/edit`">
                {{ v.versionLabel }} — {{ contentStatus(v.status) }} ({{ v.totalScore }}
                {{ t('common.pointsAbbr') }})
              </router-link>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.paper-edit {
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
  margin: 8px 0 4px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #6b7280;
}
.actions {
  display: flex;
  gap: 8px;
}
.versions-card {
  margin-top: 16px;
}
</style>
