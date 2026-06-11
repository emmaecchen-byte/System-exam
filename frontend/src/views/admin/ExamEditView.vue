<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { fetchCategoryOptions } from '@/api/categories';
import {
  addSessionParticipants,
  closeExam,
  createExam,
  createSession,
  deleteExam,
  deleteSession,
  ExamDetail,
  ExamSession,
  fetchDepartments,
  fetchExam,
  fetchExamSessions,
  fetchSessionParticipants,
  publishExam,
  publishExamResults,
  unpublishExamResults,
  searchCandidates,
  updateExam,
  updateSession,
} from '@/api/exams';
import { fetchPublishedPapers } from '@/api/papers';
import { useExamListBasePath } from '@/composables/useExamListBasePath';
import { useLocalizedLabels } from '@/composables/useLocalizedLabels';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';
import QrCodeDialog from '@/components/QrCodeDialog.vue';
import type { QrCodeStatus } from '@/api/exams';

const { t } = useI18n();
const { examStatus, sessionStatus } = useLocalizedLabels();
const { categoryName, departmentName, examTitle, paperLabel, personName } = useSeedDataLabels();

const route = useRoute();
const router = useRouter();
const examBasePath = useExamListBasePath();
// Static route is `new/edit` (no :id param), so params.id is undefined — not the string "new".
const isNew = computed(() => route.path.endsWith('/new/edit'));
const examId = computed(() => (isNew.value ? null : (route.params.id as string)));

const loading = ref(true);
const saving = ref(false);
const exam = ref<ExamDetail | null>(null);
const sessions = ref<ExamSession[]>([]);
const categories = ref<Array<{ id: string; name: string }>>([]);
const papers = ref<Array<{ id: string; label: string; totalScore: number }>>([]);
const departments = ref<Array<{ id: string; name: string }>>([]);

const form = ref({
  title: '',
  description: '',
  categoryId: '',
  paperId: '',
  passScore: 60,
  durationMinutes: 60,
  allowRetake: false,
  maxAttempts: 3,
  randomQuestionOrder: false,
  randomOptionOrder: false,
  showResultToCandidate: false,
  showAnswersToCandidate: false,
});

const selectedPaper = computed(() => papers.value.find((p) => p.id === form.value.paperId));

const sessionDialog = ref(false);
const sessionForm = ref({
  id: '' as string | null,
  name: '',
  startTime: '',
  endTime: '',
  location: '',
  notes: '',
});

const participantDialog = ref(false);
const activeSessionId = ref('');
const qrDialogVisible = ref(false);
const qrSession = ref<{ id: string; name: string; endTime: string } | null>(null);

function qrStatusTag(status?: QrCodeStatus) {
  if (status === 'active') return 'success';
  if (status === 'expired') return 'warning';
  if (status === 'invalidated') return 'danger';
  return 'info';
}

function openQrDialog(row: ExamSession) {
  qrSession.value = { id: row.id, name: row.name, endTime: row.endTime };
  qrDialogVisible.value = true;
}
const targetType = ref<'ALL' | 'DEPARTMENTS' | 'USERS'>('ALL');
const selectedDepartments = ref<string[]>([]);
const candidateSearch = ref('');
const candidateResults = ref<Array<{ id: string; name: string; employeeNo: string }>>([]);
const selectedUsers = ref<string[]>([]);
const participants = ref<Array<{ user: { name: string; employeeNo: string } }>>([]);

async function loadMeta() {
  const [catRes, paperRes, deptRes] = await Promise.all([
    fetchCategoryOptions(),
    fetchPublishedPapers(),
    fetchDepartments(),
  ]);
  categories.value = catRes.data;
  papers.value = paperRes.data;
  departments.value = deptRes.data;
}

async function loadExam() {
  if (!examId.value) {
    exam.value = null;
    sessions.value = [];
    if (isNew.value) {
      form.value = {
        title: '',
        description: '',
        categoryId: '',
        paperId: '',
        passScore: 60,
        durationMinutes: 60,
        allowRetake: false,
        maxAttempts: 3,
        randomQuestionOrder: false,
        randomOptionOrder: false,
        showResultToCandidate: false,
        showAnswersToCandidate: false,
      };
    }
    loading.value = false;
    return;
  }
  try {
    const { data } = await fetchExam(examId.value);
    exam.value = data;
    sessions.value = data.sessions ?? [];
    form.value = {
      title: data.title,
      description: data.description ?? '',
      categoryId: data.categoryId,
      paperId: data.paperId,
      passScore: data.passScore,
      durationMinutes: data.durationMinutes,
      allowRetake: data.allowRetake,
      maxAttempts: data.maxAttempts,
      randomQuestionOrder: data.randomQuestionOrder,
      randomOptionOrder: data.randomOptionOrder,
      showResultToCandidate: data.showResultToCandidate ?? false,
      showAnswersToCandidate: data.showAnswersToCandidate ?? false,
    };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.loadFailed'));
    router.push(examBasePath.value);
  }
}

async function saveExam() {
  if (!form.value.title.trim() || !form.value.categoryId || !form.value.paperId) {
    ElMessage.warning(t('examEdit.requiredFields'));
    return;
  }
  if (selectedPaper.value && form.value.passScore > selectedPaper.value.totalScore) {
    ElMessage.error(t('examEdit.passScoreExceeds'));
    return;
  }

  saving.value = true;
  try {
    const payload = { ...form.value };
    if (isNew.value) {
      const { data } = await createExam(payload);
      ElMessage.success(t('examEdit.created'));
      await router.replace(`${examBasePath.value}/${data.id}/edit`);
      activeTab.value = 'sessions';
      await loadExam();
      await reloadSessions();
    } else {
      const { data } = await updateExam(examId.value!, payload);
      exam.value = { ...exam.value!, ...data };
      ElMessage.success(t('examEdit.saved'));
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function openSessionDialog(session?: ExamSession) {
  if (session) {
    sessionForm.value = {
      id: session.id,
      name: session.name,
      startTime: new Date(session.startTime) as unknown as string,
      endTime: new Date(session.endTime) as unknown as string,
      location: session.location ?? '',
      notes: session.notes ?? '',
    };
  } else {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    sessionForm.value = {
      id: null,
      name: '',
      startTime: start as unknown as string,
      endTime: end as unknown as string,
      location: '',
      notes: '',
    };
  }
  sessionDialog.value = true;
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function saveSession() {
  if (!examId.value || !sessionForm.value.name || !sessionForm.value.startTime || !sessionForm.value.endTime) {
    ElMessage.warning(t('examEdit.sessionRequired'));
    return;
  }
  const payload = {
    name: sessionForm.value.name,
    startTime: toIso(sessionForm.value.startTime),
    endTime: toIso(sessionForm.value.endTime),
    location: sessionForm.value.location || undefined,
    notes: sessionForm.value.notes || undefined,
  };
  if (sessionForm.value.id) {
    await updateSession(sessionForm.value.id, payload);
  } else {
    await createSession(examId.value, payload);
  }
  sessionDialog.value = false;
  await reloadSessions();
  ElMessage.success(t('examEdit.sessionSaved'));
}

async function removeSession(id: string) {
  await ElMessageBox.confirm(t('examEdit.deleteSessionConfirm'), t('common.delete'), { type: 'warning' });
  await deleteSession(id);
  if (examId.value) {
    await reloadSessions();
  }
}

async function reloadSessions() {
  if (!examId.value) return;
  const { data } = await fetchExamSessions(examId.value);
  sessions.value = Array.isArray(data) ? data : [];
}

async function openParticipants(sessionId: string) {
  activeSessionId.value = sessionId;
  targetType.value = 'ALL';
  selectedDepartments.value = [];
  selectedUsers.value = [];
  candidateSearch.value = '';
  candidateResults.value = [];
  try {
    const { data } = await fetchSessionParticipants(sessionId);
    participants.value = data.participants ?? [];
    participantDialog.value = true;
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.loadParticipantsFailed'));
  }
}

async function onTabChange(tabName: string | number) {
  if (tabName === 'sessions') {
    await reloadSessions();
  }
}

async function searchCandidateUsers() {
  if (!candidateSearch.value.trim()) return;
  const { data } = await searchCandidates(candidateSearch.value);
  candidateResults.value = data;
}

async function assignParticipants() {
  if (targetType.value === 'DEPARTMENTS' && selectedDepartments.value.length === 0) {
    ElMessage.warning(t('examEdit.selectDepartment'));
    return;
  }
  if (targetType.value === 'USERS' && selectedUsers.value.length === 0) {
    ElMessage.warning(t('examEdit.selectCandidate'));
    return;
  }
  try {
    const { data } = await addSessionParticipants(activeSessionId.value, {
      targetType: targetType.value,
      departmentIds: targetType.value === 'DEPARTMENTS' ? selectedDepartments.value : undefined,
      userIds: targetType.value === 'USERS' ? selectedUsers.value : undefined,
    });
    ElMessage.success(t('examEdit.participantsAdded', { count: data.added }));
    const pRes = await fetchSessionParticipants(activeSessionId.value);
    participants.value = pRes.data.participants ?? [];
    if (examId.value) {
      await reloadSessions();
      await loadExam();
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.assignFailed'));
  }
}

async function publish() {
  if (!examId.value) return;
  try {
    await publishExam(examId.value);
    ElMessage.success(t('examEdit.publishedMsg'));
    await loadExam();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.publishFailed'));
  }
}

async function closeExamEarly() {
  if (!examId.value) return;
  await closeExam(examId.value);
  ElMessage.success(t('examEdit.closedMsg'));
  await loadExam();
}

const canManageResults = computed(
  () =>
    exam.value &&
    ['PENDING_GRADING', 'COMPLETED', 'IN_PROGRESS', 'PUBLISHED'].includes(exam.value.status),
);

async function publishResults() {
  if (!examId.value) return;
  try {
    await ElMessageBox.confirm(t('examEdit.publishResultsConfirm'), t('examEdit.publishResultsTitle'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await publishExamResults(examId.value);
    ElMessage.success(t('examEdit.publishResultsSuccess'));
    await loadExam();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.publishResultsFailed'));
  }
}

async function unpublishResults() {
  if (!examId.value) return;
  try {
    await ElMessageBox.confirm(t('examEdit.unpublishResultsConfirm'), t('examEdit.unpublishResultsTitle'), {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await unpublishExamResults(examId.value);
    ElMessage.success(t('examEdit.unpublishResultsSuccess'));
    await loadExam();
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.unpublishResultsFailed'));
  }
}

async function deleteExamDraft() {
  if (!examId.value || exam.value?.status !== 'DRAFT') return;
  try {
    await ElMessageBox.confirm(
      t('examEdit.deleteExamConfirm', { title: exam.value.title }),
      t('examEdit.deleteExamTitle'),
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteExam(examId.value);
    ElMessage.success(t('examEdit.deleted'));
    router.push(examBasePath.value);
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('examEdit.deleteFailed'));
  }
}

const activeTab = ref('config');

onMounted(async () => {
  await loadMeta();
  await loadExam();
  loading.value = false;
});

watch(
  () => route.fullPath,
  async (path, prevPath) => {
    if (path === prevPath) return;
    loading.value = true;
    try {
      await loadExam();
    } finally {
      loading.value = false;
    }
  },
);
</script>

<template>
  <div v-loading="loading" class="exam-edit">
    <div class="page-header">
      <div>
        <el-button link @click="router.push(examBasePath)">{{ t('examEdit.backToExams') }}</el-button>
        <h2>{{ isNew ? t('examEdit.newExam') : examTitle(exam?.id, exam?.title) }}</h2>
        <div v-if="exam" class="meta">
          <el-tag>{{ examStatus(exam.status) }}</el-tag>
          <el-tag v-if="exam.resultsPublished" type="success">{{ t('examEdit.resultsPublishedBadge') }}</el-tag>
          <el-tag v-else-if="canManageResults" type="warning">{{ t('examEdit.resultsUnpublishedBadge') }}</el-tag>
          <span>{{ t('examEdit.sessionCount', { count: exam.sessionCount }) }}</span>
          <span v-if="exam.publishedAt" class="lifecycle-ts">
            {{ t('examEdit.publishedAt', { date: new Date(exam.publishedAt).toLocaleString() }) }}
          </span>
          <span v-if="exam.closedAt" class="lifecycle-ts">
            {{ t('examEdit.closedAt', { date: new Date(exam.closedAt).toLocaleString() }) }}
          </span>
          <span v-if="exam.archivedAt" class="lifecycle-ts">
            {{ t('examEdit.archivedAt', { date: new Date(exam.archivedAt).toLocaleString() }) }}
          </span>
        </div>
      </div>
      <el-button
        v-if="exam?.status === 'DRAFT'"
        type="danger"
        plain
        @click="deleteExamDraft"
      >
        {{ t('examEdit.deleteDraft') }}
      </el-button>
    </div>

    <el-alert
      v-if="exam?.status === 'PUBLISHED' || exam?.status === 'IN_PROGRESS'"
      type="success"
      show-icon
      :closable="false"
      class="published-banner"
      :title="t('examEdit.liveTitle')"
      :description="t('examEdit.liveDesc')"
    />

    <el-card
      v-if="examId && canManageResults"
      shadow="never"
      class="results-publish-card"
    >
      <div class="results-publish-row">
        <div>
          <h3>{{ t('examEdit.resultsPublishingTitle') }}</h3>
          <p class="hint">{{ t('examEdit.resultsPublishingDesc') }}</p>
          <p v-if="exam?.resultsPublishedAt" class="hint">
            {{
              t('examEdit.resultsPublishedAt', {
                date: new Date(exam.resultsPublishedAt).toLocaleString(),
                name: exam.resultsPublishedBy?.name ?? '—',
              })
            }}
          </p>
        </div>
        <div class="results-publish-actions">
          <el-button
            v-if="!exam?.resultsPublished"
            type="success"
            @click="publishResults"
          >
            {{ t('examEdit.publishResults') }}
          </el-button>
          <el-button
            v-else
            type="warning"
            plain
            @click="unpublishResults"
          >
            {{ t('examEdit.unpublishResults') }}
          </el-button>
        </div>
      </div>
    </el-card>

    <el-tabs v-if="examId || isNew" :key="examId ?? 'new'" v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="t('examEdit.tabConfig')" name="config">
        <el-card shadow="never">
          <el-form label-width="180px" :disabled="exam && !exam.isEditable">
            <el-form-item :label="t('examEdit.title')" required>
              <el-input v-model="form.title" />
            </el-form-item>
            <el-form-item :label="t('common.description')">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item :label="t('examEdit.category')" required>
              <el-select v-model="form.categoryId" filterable style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="categoryName(c.id, c.name)" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('examEdit.paperPublished')" required>
              <el-select v-model="form.paperId" filterable style="width: 100%">
                <el-option v-for="p in papers" :key="p.id" :label="paperLabel(p.label)" :value="p.id" />
              </el-select>
              <p v-if="selectedPaper" class="hint">
                {{ t('examEdit.paperTotal', { score: selectedPaper.totalScore }) }}
              </p>
            </el-form-item>
            <el-form-item :label="t('examEdit.passScore')" required>
              <el-input-number v-model="form.passScore" :min="1" :max="selectedPaper?.totalScore ?? 999" />
            </el-form-item>
            <el-form-item :label="t('examEdit.duration')" required>
              <el-input-number v-model="form.durationMinutes" :min="1" :max="480" />
            </el-form-item>
            <el-form-item :label="t('examEdit.allowRetake')">
              <el-switch v-model="form.allowRetake" />
            </el-form-item>
            <el-form-item v-if="form.allowRetake" :label="t('examEdit.maxAttempts')">
              <el-input-number v-model="form.maxAttempts" :min="2" :max="10" />
            </el-form-item>
            <el-form-item :label="t('examEdit.randomQuestionOrder')">
              <el-switch v-model="form.randomQuestionOrder" />
            </el-form-item>
            <el-form-item :label="t('examEdit.randomOptionOrder')">
              <el-switch v-model="form.randomOptionOrder" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveExam">{{ t('examEdit.saveExam') }}</el-button>
              <el-button v-if="exam?.status === 'DRAFT'" type="success" @click="publish">{{ t('examEdit.publish') }}</el-button>
              <el-button
                v-if="exam?.status === 'PUBLISHED' || exam?.status === 'IN_PROGRESS'"
                type="warning"
                @click="closeExamEarly"
              >
                {{ t('examEdit.closeEarly') }}
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane v-if="examId" :label="t('examEdit.tabSessions')" name="sessions">
        <el-card shadow="never">
          <div class="session-header">
            <span>{{ t('examEdit.sessionCount', { count: sessions.length }) }}</span>
            <el-button
              v-if="exam?.isEditable"
              type="primary"
              size="small"
              :icon="Plus"
              @click="openSessionDialog()"
            >
              {{ t('examEdit.addSession') }}
            </el-button>
          </div>
          <el-table :data="sessions" stripe>
            <el-table-column prop="name" :label="t('examEdit.colSessionName')" />
            <el-table-column :label="t('examEdit.colStart')" width="170">
              <template #default="{ row }">{{ new Date(row.startTime).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column :label="t('examEdit.colEnd')" width="170">
              <template #default="{ row }">{{ new Date(row.endTime).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="110">
              <template #default="{ row }">{{ sessionStatus(row.status) }}</template>
            </el-table-column>
            <el-table-column :label="t('qr.statusLabel')" width="120">
              <template #default="{ row }">
                <el-tag
                  v-if="row.qrStatus && row.qrStatus !== 'none'"
                  size="small"
                  :type="qrStatusTag(row.qrStatus)"
                >
                  {{ t(`qr.status.${row.qrStatus}`) }}
                </el-tag>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('examEdit.colParticipants')" min-width="160">
              <template #default="{ row }">
                <el-button link type="primary" @click="openParticipants(row.id)">
                  {{ t('examEdit.assigned', { count: row.participantCount }) }}
                </el-button>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="200">
              <template #default="{ row }">
                <el-button
                  v-if="exam && exam.status !== 'DRAFT' && exam.status !== 'ARCHIVED'"
                  link
                  type="primary"
                  @click="openQrDialog(row)"
                >
                  {{ t('qr.openQr') }}
                </el-button>
                <el-button v-if="exam?.isEditable" link @click="openSessionDialog(row)">{{ t('common.edit') }}</el-button>
                <el-button v-if="exam?.isEditable" link type="danger" @click="removeSession(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="sessionDialog"
      :title="sessionForm.id ? t('examEdit.editSession') : t('examEdit.newSession')"
      width="520px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('examEdit.sessionName')" required>
          <el-input v-model="sessionForm.name" :placeholder="t('examEdit.sessionNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('examEdit.startTime')" required>
          <el-date-picker v-model="sessionForm.startTime" type="datetime" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('examEdit.endTime')" required>
          <el-date-picker v-model="sessionForm.endTime" type="datetime" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('examEdit.location')">
          <el-input v-model="sessionForm.location" />
        </el-form-item>
        <el-form-item :label="t('examEdit.notes')">
          <el-input v-model="sessionForm.notes" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sessionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveSession">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="participantDialog" :title="t('examEdit.sessionParticipants')" width="640px" destroy-on-close>
      <el-alert
        v-if="exam && !exam.isEditable"
        type="info"
        :closable="false"
        show-icon
        class="participant-hint"
        :title="t('examEdit.publishedInfoTitle')"
        :description="t('examEdit.publishedInfoDesc')"
      />
      <el-form label-position="top">
        <el-form-item :label="t('examEdit.target')">
          <el-radio-group v-model="targetType">
            <el-radio value="ALL">{{ t('examEdit.allEmployees') }}</el-radio>
            <el-radio value="DEPARTMENTS">{{ t('examEdit.departments') }}</el-radio>
            <el-radio value="USERS">{{ t('examEdit.specificUsers') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="targetType === 'DEPARTMENTS'" :label="t('examEdit.departments')">
          <el-select v-model="selectedDepartments" multiple filterable style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="departmentName(d.id, d.name)" :value="d.id" />
          </el-select>
        </el-form-item>
        <template v-if="targetType === 'USERS'">
          <el-form-item :label="t('common.search')">
            <el-input
              v-model="candidateSearch"
              :placeholder="t('examEdit.candidateSearch')"
              @keyup.enter="searchCandidateUsers"
            >
              <template #append>
                <el-button @click="searchCandidateUsers">{{ t('common.search') }}</el-button>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item :label="t('examEdit.selectUsers')">
            <el-select v-model="selectedUsers" multiple filterable style="width: 100%">
              <el-option
                v-for="u in candidateResults"
                :key="u.id"
                :label="`${personName({ employeeNo: u.employeeNo, name: u.name })} (${u.employeeNo})`"
                :value="u.id"
              />
            </el-select>
          </el-form-item>
        </template>
        <el-button type="primary" @click="assignParticipants">{{ t('examEdit.assignParticipants') }}</el-button>
      </el-form>
      <h4>{{ t('examEdit.currentParticipants', { count: participants.length }) }}</h4>
      <el-table :data="participants" size="small" max-height="200">
        <el-table-column :label="t('common.name')">
          <template #default="{ row }">
            {{ personName({ employeeNo: row.user.employeeNo, name: row.user.name }) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('examEdit.employeeNo')">
          <template #default="{ row }">{{ row.user.employeeNo }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <QrCodeDialog
      v-if="qrSession"
      v-model:visible="qrDialogVisible"
      :session-id="qrSession.id"
      :session-name="qrSession.name"
      :session-end-time="qrSession.endTime"
    />
  </div>
</template>

<style scoped>
.exam-edit { display: flex; flex-direction: column; gap: 16px; }
.muted { color: #9ca3af; font-size: 13px; }
.published-banner { margin-bottom: 4px; }
.participant-hint { margin-bottom: 16px; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.page-header h2 { margin: 8px 0 4px; }
.meta { display: flex; gap: 12px; align-items: center; color: #6b7280; font-size: 14px; }
.hint { margin: 4px 0 0; font-size: 12px; color: #6b7280; }
.session-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
.results-publish-card { border-radius: 12px; }
.results-publish-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.results-publish-row h3 { margin: 0 0 8px; font-size: 1rem; }
.results-publish-actions { display: flex; gap: 8px; flex-shrink: 0; }
</style>
