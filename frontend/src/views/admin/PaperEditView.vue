<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowUp, Delete, Plus, View } from '@element-plus/icons-vue';
import { fetchCategoryOptions } from '@/api/categories';
import { Question } from '@/api/questions';
import {
  addPaperQuestions,
  createPaperNewVersion,
  fetchPaper,
  fetchPaperPreview,
  fetchPaperVersions,
  PaperDetail,
  PaperListItem,
  publishPaper,
  removePaperQuestion,
  reorderPaperQuestions,
  updatePaper,
  updatePaperQuestionScore,
} from '@/api/papers';
import QuestionPickerDialog from '@/components/QuestionPickerDialog.vue';

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const paperId = route.params.id as string;

const loading = ref(true);
const saving = ref(false);
const paper = ref<PaperDetail | null>(null);
const categories = ref<Array<{ id: string; name: string }>>([]);
const versions = ref<PaperListItem[]>([]);
const pickerVisible = ref(false);
const previewVisible = ref(false);
const previewData = ref<{ questions: Array<{ sortOrder: number; score: number; stem: string; typeLabel: string }> } | null>(null);

const form = ref({ title: '', categoryId: '' });

const excludeQuestionIds = computed(() => paper.value?.questions.map((q) => q.questionId) ?? []);
const sortedQuestions = computed(() =>
  [...(paper.value?.questions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
);

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

async function onQuestionsSelected(questions: Question[]) {
  if (!paper.value?.isEditable) return;
  const scores: Record<string, number> = {};
  questions.forEach((q) => {
    scores[q.id] = q.score;
  });
  const { data } = await addPaperQuestions(
    paperId,
    questions.map((q) => q.id),
    scores,
  );
  paper.value = data;
  ElMessage.success(t('paperEdit.addedQuestions', { count: questions.length }));
}

async function removeQuestion(questionId: string) {
  const { data } = await removePaperQuestion(paperId, questionId);
  paper.value = data;
}

async function updateScore(questionId: string, score: number) {
  const { data } = await updatePaperQuestionScore(paperId, questionId, score);
  paper.value = data;
}

async function moveQuestion(questionId: string, direction: 'up' | 'down') {
  const qs = sortedQuestions.value;
  const idx = qs.findIndex((q) => q.questionId === questionId);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= qs.length) return;

  const orders = qs.map((q, i) => {
    if (i === idx) return { questionId: q.questionId, sortOrder: swapIdx };
    if (i === swapIdx) return { questionId: q.questionId, sortOrder: idx };
    return { questionId: q.questionId, sortOrder: i };
  });

  const { data } = await reorderPaperQuestions(paperId, orders);
  paper.value = data;
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

async function newVersion() {
  const { data } = await createPaperNewVersion(paperId);
  ElMessage.success(t('paperEdit.newVersionCreated'));
  router.push(`/papers/${data.id}/edit`);
}

async function showPreview() {
  const { data } = await fetchPaperPreview(paperId);
  previewData.value = data;
  previewVisible.value = true;
}

function typeLabel(type?: string) {
  if (!type) return type;
  const key = `questions.types.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="paper-edit">
    <div class="page-header">
      <div>
        <el-button link @click="router.push('/papers')">{{ t('paperEdit.backToPapers') }}</el-button>
        <h2>{{ paper?.title ?? t('paperEdit.defaultTitle') }}</h2>
        <div class="meta">
          <el-tag>{{ paper?.statusLabel }}</el-tag>
          <el-tag type="info">{{ paper?.versionLabel }}</el-tag>
          <span>{{ t('paperEdit.totalPts', { score: paper?.totalScore ?? 0 }) }}</span>
          <span>{{ t('paperEdit.questionCount', { count: paper?.questionCount ?? 0 }) }}</span>
        </div>
      </div>
      <div class="actions">
        <el-button :icon="View" @click="showPreview">{{ t('paperEdit.preview') }}</el-button>
        <el-button v-if="paper?.isEditable" type="primary" @click="publish">{{ t('paperEdit.publish') }}</el-button>
        <el-button v-if="paper?.status === 'ACTIVE'" type="warning" @click="newVersion">
          {{ t('paperEdit.createNewVersion') }}
        </el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="16">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t('paperEdit.questionsOnPaper') }}</span>
              <el-button
                v-if="paper?.isEditable"
                type="primary"
                size="small"
                :icon="Plus"
                @click="pickerVisible = true"
              >
                {{ t('paperEdit.addFromBank') }}
              </el-button>
            </div>
          </template>

          <el-empty v-if="!sortedQuestions.length" :description="t('paperEdit.noQuestions')" />
          <div v-else class="question-list">
            <div
              v-for="(q, idx) in sortedQuestions"
              :key="q.questionId"
              class="question-item"
            >
              <div class="q-index">{{ idx + 1 }}</div>
              <div class="q-body">
                <div class="q-type">{{ typeLabel(q.snapshot?.type) }}</div>
                <div class="q-stem">{{ q.snapshot?.stem }}</div>
                <div class="q-score">
                  <span>{{ t('paperEdit.points') }}</span>
                  <el-input-number
                    v-if="paper?.isEditable"
                    :model-value="q.score"
                    :min="0.5"
                    :max="100"
                    :step="0.5"
                    size="small"
                    @change="(v: number) => updateScore(q.questionId, v)"
                  />
                  <strong v-else>{{ q.score }}</strong>
                </div>
              </div>
              <div v-if="paper?.isEditable" class="q-actions">
                <el-button :icon="ArrowUp" circle size="small" @click="moveQuestion(q.questionId, 'up')" />
                <el-button :icon="ArrowDown" circle size="small" @click="moveQuestion(q.questionId, 'down')" />
                <el-button :icon="Delete" circle type="danger" size="small" @click="removeQuestion(q.questionId)" />
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card shadow="never" :header="t('paperEdit.paperDetails')">
          <el-form label-position="top">
            <el-form-item :label="t('common.title')">
              <el-input v-model="form.title" :disabled="!paper?.isEditable" />
            </el-form-item>
            <el-form-item :label="t('common.category')">
              <el-select v-model="form.categoryId" :disabled="!paper?.isEditable" style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
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
                {{ v.versionLabel }} — {{ v.statusLabel }} ({{ v.totalScore }} pts)
              </router-link>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <QuestionPickerDialog
      v-model:visible="pickerVisible"
      :exclude-ids="excludeQuestionIds"
      @select="onQuestionsSelected"
    />

    <el-dialog v-model="previewVisible" :title="t('paperEdit.paperPreview')" width="700px">
      <p class="preview-total">{{ t('paperEdit.previewTotal', { score: paper?.totalScore }) }}</p>
      <div v-for="(q, i) in previewData?.questions ?? []" :key="i" class="preview-q">
        <div class="preview-q-head">
          <span>{{ i + 1 }}. [{{ q.typeLabel }}] ({{ q.score }} pts)</span>
        </div>
        <p>{{ q.stem }}</p>
      </div>
    </el-dialog>
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
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.question-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.question-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
}
.q-index {
  font-weight: 700;
  color: #6b7280;
  min-width: 24px;
}
.q-body {
  flex: 1;
}
.q-type {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.q-stem {
  margin-bottom: 8px;
}
.q-score {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.q-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.versions-card {
  margin-top: 16px;
}
.preview-total {
  font-weight: 600;
  margin-bottom: 12px;
}
.preview-q {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.preview-q-head {
  font-weight: 600;
  margin-bottom: 4px;
}
</style>
