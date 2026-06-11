<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { CopyDocument, Plus } from '@element-plus/icons-vue';
import {
  addSessionParticipants,
  createSession,
  ExamSession,
  QrCodeStatus,
  fetchExam,
  fetchExamSessions,
  fetchSessionParticipants,
  fetchSessionQr,
  generateSessionQr,
  QrCodeResponse,
  searchCandidates,
} from '@/api/exams';
import { useExamListBasePath } from '@/composables/useExamListBasePath';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

interface CandidateOption {
  id: string;
  name: string;
  employeeNo: string;
  department?: { name: string } | null;
}

interface SessionParticipant {
  id: string;
  userId: string;
  user: { name: string; employeeNo: string };
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { examTitle } = useSeedDataLabels();
const examBasePath = useExamListBasePath();

const examId = computed(() => route.params.examId as string);
const loading = ref(false);
const sessions = ref<ExamSession[]>([]);
const examName = ref('');

const createDialogVisible = ref(false);
const createForm = reactive({
  name: '',
  startTime: null as Date | null,
  endTime: null as Date | null,
  location: '',
});
const createSaving = ref(false);

const participantsDialogVisible = ref(false);
const activeSessionId = ref('');
const activeSessionName = ref('');
const participantSearch = ref('');
const searchLoading = ref(false);
const searchResults = ref<CandidateOption[]>([]);
const selectedCandidates = ref<CandidateOption[]>([]);
const existingParticipants = ref<SessionParticipant[]>([]);
const assignSaving = ref(false);

const qrViewVisible = ref(false);
const qrLoading = ref(false);
const qrGeneratingId = ref<string | null>(null);
const qrData = ref<QrCodeResponse | null>(null);
const qrSessionLabel = ref('');

function qrStatusTagType(status?: QrCodeStatus) {
  if (status === 'active') return 'success';
  if (status === 'expired') return 'warning';
  if (status === 'invalidated') return 'danger';
  return 'info';
}

function qrStatusLabel(status?: QrCodeStatus) {
  if (!status || status === 'none') return t('sessionMgmt.qrStatusNone');
  return t(`qr.status.${status}`);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  return msg ?? fallback;
}

async function loadSessions() {
  loading.value = true;
  try {
    const [examRes, sessionsRes] = await Promise.all([
      fetchExam(examId.value),
      fetchExamSessions(examId.value),
    ]);
    examName.value = examRes.data.title;
    sessions.value = Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.loadFailed')));
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  createForm.name = '';
  createForm.startTime = start;
  createForm.endTime = end;
  createForm.location = '';
  createDialogVisible.value = true;
}

async function submitCreateSession() {
  if (!createForm.name.trim() || !createForm.startTime || !createForm.endTime) {
    ElMessage.warning(t('sessionMgmt.createRequired'));
    return;
  }
  if (createForm.endTime <= createForm.startTime) {
    ElMessage.warning(t('sessionMgmt.endAfterStart'));
    return;
  }

  createSaving.value = true;
  try {
    await createSession(examId.value, {
      name: createForm.name.trim(),
      startTime: createForm.startTime.toISOString(),
      endTime: createForm.endTime.toISOString(),
      location: createForm.location.trim() || undefined,
    });
    ElMessage.success(t('sessionMgmt.created'));
    createDialogVisible.value = false;
    await loadSessions();
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.createFailed')));
  } finally {
    createSaving.value = false;
  }
}

function isSelected(id: string) {
  return selectedCandidates.value.some((c) => c.id === id);
}

function toggleCandidate(candidate: CandidateOption, checked: boolean) {
  if (checked) {
    if (!isSelected(candidate.id)) {
      selectedCandidates.value = [...selectedCandidates.value, candidate];
    }
  } else {
    selectedCandidates.value = selectedCandidates.value.filter((c) => c.id !== candidate.id);
  }
}

function removeSelected(id: string) {
  selectedCandidates.value = selectedCandidates.value.filter((c) => c.id !== id);
}

async function searchCandidateUsers() {
  const q = participantSearch.value.trim();
  if (!q) return;
  searchLoading.value = true;
  try {
    const { data } = await searchCandidates(q);
    searchResults.value = data;
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.searchFailed')));
  } finally {
    searchLoading.value = false;
  }
}

async function openParticipants(row: ExamSession) {
  activeSessionId.value = row.id;
  activeSessionName.value = row.name;
  participantSearch.value = '';
  searchResults.value = [];
  selectedCandidates.value = [];
  existingParticipants.value = [];

  try {
    const { data } = await fetchSessionParticipants(row.id);
    existingParticipants.value = data.participants ?? [];
    participantsDialogVisible.value = true;
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.loadParticipantsFailed')));
  }
}

async function submitParticipants() {
  if (selectedCandidates.value.length === 0) {
    ElMessage.warning(t('sessionMgmt.selectAtLeastOne'));
    return;
  }

  assignSaving.value = true;
  try {
    const { data } = await addSessionParticipants(activeSessionId.value, {
      targetType: 'USERS',
      userIds: selectedCandidates.value.map((c) => c.id),
    });
    ElMessage.success(t('sessionMgmt.participantsAdded', { count: data.added }));
    participantsDialogVisible.value = false;
    await loadSessions();
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.assignFailed')));
  } finally {
    assignSaving.value = false;
  }
}

async function generateQr(row: ExamSession) {
  qrGeneratingId.value = row.id;
  try {
    await generateSessionQr(row.id, { expiresAt: row.endTime });
    ElMessage.success(t('sessionMgmt.qrGenerated'));
    await loadSessions();
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.qrGenerateFailed')));
  } finally {
    qrGeneratingId.value = null;
  }
}

async function viewQr(row: ExamSession) {
  qrSessionLabel.value = row.name;
  qrData.value = null;
  qrViewVisible.value = true;
  qrLoading.value = true;
  try {
    const { data } = await fetchSessionQr(row.id);
    qrData.value = data;
  } catch (err: unknown) {
    ElMessage.error(apiError(err, t('sessionMgmt.qrViewFailed')));
    qrViewVisible.value = false;
  } finally {
    qrLoading.value = false;
  }
}

async function copyQrUrl() {
  if (!qrData.value?.entryUrl) return;
  await navigator.clipboard.writeText(qrData.value.entryUrl);
  ElMessage.success(t('qr.linkCopied'));
}

const editPath = computed(() => {
  if (route.path.startsWith('/admin/exams')) {
    return `/exams/${examId.value}/edit`;
  }
  if (route.path.startsWith('/exam-sessions')) {
    return `/exam-sessions/${examId.value}/edit`;
  }
  return `${examBasePath.value}/${examId.value}/edit`;
});

function goBack() {
  router.push(editPath.value);
}

onMounted(loadSessions);
</script>

<template>
  <div class="session-mgmt">
    <div class="page-header">
      <div>
        <el-button link @click="goBack">{{ t('sessionMgmt.backToExam') }}</el-button>
        <h2>{{ t('sessionMgmt.title') }}</h2>
        <p v-if="examName" class="subtitle">{{ examTitle(examId, examName) }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">
        {{ t('sessionMgmt.createSession') }}
      </el-button>
    </div>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="sessions" stripe>
        <el-table-column prop="name" :label="t('sessionMgmt.colName')" min-width="140" />
        <el-table-column :label="t('sessionMgmt.colStart')" width="180">
          <template #default="{ row }">{{ formatDateTime(row.startTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('sessionMgmt.colEnd')" width="180">
          <template #default="{ row }">{{ formatDateTime(row.endTime) }}</template>
        </el-table-column>
        <el-table-column prop="location" :label="t('sessionMgmt.colLocation')" min-width="120">
          <template #default="{ row }">{{ row.location || '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('sessionMgmt.colParticipants')" width="120" align="center">
          <template #default="{ row }">{{ row.participantCount }}</template>
        </el-table-column>
        <el-table-column :label="t('sessionMgmt.colQrStatus')" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qrStatusTagType(row.qrStatus)">
              {{ qrStatusLabel(row.qrStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" min-width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openParticipants(row)">
              {{ t('sessionMgmt.manageParticipants') }}
            </el-button>
            <el-button
              link
              type="primary"
              :loading="qrGeneratingId === row.id"
              @click="generateQr(row)"
            >
              {{ t('sessionMgmt.generateQr') }}
            </el-button>
            <el-button
              v-if="row.qrStatus === 'active'"
              link
              @click="viewQr(row)"
            >
              {{ t('sessionMgmt.viewQr') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create Session -->
    <el-dialog
      v-model="createDialogVisible"
      :title="t('sessionMgmt.createSession')"
      width="520px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('sessionMgmt.sessionName')" required>
          <el-input v-model="createForm.name" :placeholder="t('sessionMgmt.sessionNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('sessionMgmt.startDateTime')" required>
          <el-date-picker
            v-model="createForm.startTime"
            type="datetime"
            style="width: 100%"
            :placeholder="t('sessionMgmt.pickStart')"
          />
        </el-form-item>
        <el-form-item :label="t('sessionMgmt.endDateTime')" required>
          <el-date-picker
            v-model="createForm.endTime"
            type="datetime"
            style="width: 100%"
            :placeholder="t('sessionMgmt.pickEnd')"
          />
        </el-form-item>
        <el-form-item :label="t('sessionMgmt.location')">
          <el-input v-model="createForm.location" :placeholder="t('sessionMgmt.locationPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="createSaving" @click="submitCreateSession">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Assign Participants -->
    <el-dialog
      v-model="participantsDialogVisible"
      :title="t('sessionMgmt.manageParticipantsTitle', { name: activeSessionName })"
      width="640px"
      destroy-on-close
    >
      <div v-if="existingParticipants.length" class="existing-block">
        <h4>{{ t('sessionMgmt.currentParticipants', { count: existingParticipants.length }) }}</h4>
        <el-tag
          v-for="p in existingParticipants"
          :key="p.id"
          size="small"
          class="participant-tag"
        >
          {{ p.user.name }} ({{ p.user.employeeNo }})
        </el-tag>
      </div>

      <el-form label-position="top" class="search-form">
        <el-form-item :label="t('sessionMgmt.searchCandidates')">
          <div class="search-row">
            <el-input
              v-model="participantSearch"
              :placeholder="t('examEdit.candidateSearch')"
              clearable
              @keyup.enter="searchCandidateUsers"
            />
            <el-button type="primary" :loading="searchLoading" @click="searchCandidateUsers">
              {{ t('common.search') }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <div v-if="searchResults.length" class="search-results">
        <p class="section-label">{{ t('sessionMgmt.searchResults') }}</p>
        <el-checkbox
          v-for="c in searchResults"
          :key="c.id"
          :model-value="isSelected(c.id)"
          class="candidate-check"
          @change="(val: boolean) => toggleCandidate(c, val)"
        >
          {{ c.name }} ({{ c.employeeNo }})
          <span v-if="c.department" class="dept"> — {{ c.department.name }}</span>
        </el-checkbox>
      </div>

      <div v-if="selectedCandidates.length" class="selected-block">
        <p class="section-label">{{ t('sessionMgmt.selectedCandidates', { count: selectedCandidates.length }) }}</p>
        <div class="selected-list">
          <el-tag
            v-for="c in selectedCandidates"
            :key="c.id"
            closable
            class="participant-tag"
            @close="removeSelected(c.id)"
          >
            {{ c.name }} ({{ c.employeeNo }})
          </el-tag>
        </div>
      </div>

      <template #footer>
        <el-button @click="participantsDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="assignSaving" @click="submitParticipants">
          {{ t('sessionMgmt.assignSelected') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- View QR -->
    <el-dialog
      v-model="qrViewVisible"
      :title="t('sessionMgmt.viewQrTitle', { name: qrSessionLabel })"
      width="420px"
      destroy-on-close
    >
      <div v-loading="qrLoading" class="qr-view">
        <template v-if="qrData">
          <div class="qr-image-wrap">
            <img :src="qrData.qrPngDataUrl" :alt="t('qr.qrAlt')" class="qr-image" />
          </div>
          <p class="qr-expires">
            {{ t('qr.expires', { date: formatDateTime(qrData.expiresAt) }) }}
          </p>
          <el-input :model-value="qrData.entryUrl" readonly>
            <template #append>
              <el-button :icon="CopyDocument" @click="copyQrUrl" />
            </template>
          </el-input>
          <el-button class="copy-btn" :icon="CopyDocument" @click="copyQrUrl">
            {{ t('qr.copyLink') }}
          </el-button>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.session-mgmt {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-header h2 {
  margin: 4px 0;
}

.subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.table-card {
  border-radius: 12px;
}

.search-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.search-row .el-input {
  flex: 1;
}

.existing-block,
.selected-block,
.search-results {
  margin-bottom: 16px;
}

.existing-block h4,
.section-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.participant-tag {
  margin: 0 6px 6px 0;
}

.candidate-check {
  display: flex;
  margin-bottom: 8px;
  width: 100%;
}

.dept {
  color: #9ca3af;
  font-size: 12px;
}

.qr-view {
  min-height: 120px;
}

.qr-image-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.qr-image {
  width: 240px;
  max-width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.qr-expires {
  text-align: center;
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 12px;
}

.copy-btn {
  width: 100%;
  margin-top: 10px;
}
</style>
