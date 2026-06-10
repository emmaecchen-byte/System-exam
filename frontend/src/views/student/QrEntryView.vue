<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { ExamEntryInfo, previewExamEntry, verifyExamEntry } from '@/api/examEntry';
import api from '@/api/client';
import { ROLES } from '@/constants/roles';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const token = computed(() => route.query.token as string | undefined);
const loading = ref(true);
const starting = ref(false);
const info = ref<ExamEntryInfo | null>(null);

const statusType = computed(() => {
  const s = info.value?.status;
  if (
    s === 'expired'
    || s === 'invalid'
    || s === 'unauthorized'
    || s === 'completed'
    || s === 'scan_limit_reached'
  ) {
    return 'error';
  }
  if (s === 'login_required') return 'warning';
  if (s === 'exam_unavailable') return 'info';
  return 'success';
});

function redirectAfterVerify(data: ExamEntryInfo) {
  if (data.status !== 'ok' || !data.examId) return false;

  if (data.inProgressAttemptId) {
    router.replace(`/take-exam/attempts/${data.inProgressAttemptId}/exam`);
    return true;
  }

  router.replace({
    path: `/take-exam/exams/${data.examId}/instructions`,
    query: { sessionId: data.sessionId },
  });
  return true;
}

async function loadEntry() {
  if (!token.value) {
    info.value = { status: 'invalid', message: t('student.missingToken') };
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    if (!auth.initialized) await auth.fetchMe();

    if (auth.isAuthenticated && auth.user?.roles.includes(ROLES.CANDIDATE)) {
      const { data } = await verifyExamEntry(token.value);
      if (!redirectAfterVerify(data)) {
        info.value = data;
      }
    } else {
      const { data } = await previewExamEntry(token.value);
      if (data.status === 'ok' && !auth.isAuthenticated) {
        info.value = { ...data, status: 'login_required', requiresLogin: true };
      } else if (data.status === 'ok' && auth.isAuthenticated) {
        const { data: verified } = await verifyExamEntry(token.value);
        if (!redirectAfterVerify(verified)) {
          info.value = verified;
        }
      } else {
        info.value = data;
      }
    }
  } catch {
    info.value = { status: 'invalid', message: t('student.loadEntryFailed') };
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  router.push({
    path: '/login',
    query: { redirect: route.fullPath },
  });
}

async function startExam() {
  if (!info.value?.examId || !info.value.sessionId) return;

  if (info.value.inProgressAttemptId) {
    router.push(`/take-exam/attempts/${info.value.inProgressAttemptId}/exam`);
    return;
  }

  starting.value = true;
  try {
    const { data } = await api.post(`/candidate/exams/${info.value.examId}/start`, {
      sessionId: info.value.sessionId,
    });
    router.push(`/take-exam/attempts/${data.id}/exam`);
  } catch {
    ElMessage.error(t('student.unableToStartExamRetry'));
  } finally {
    starting.value = false;
  }
}

onMounted(loadEntry);
</script>

<template>
  <div class="qr-page">
    <el-card v-loading="loading" class="card">
      <template v-if="info">
        <div class="header">
          <p class="eyebrow">{{ t('student.qrEntryTitle') }}</p>
          <h1>{{ info.examTitle ?? t('student.examFallback') }}</h1>
          <p v-if="info.sessionName" class="session">{{ info.sessionName }}</p>
        </div>

        <el-alert
          v-if="info.message"
          :title="info.message"
          :type="statusType"
          show-icon
          :closable="false"
          class="alert"
        />

        <template v-if="info.status === 'ok' || info.status === 'login_required'">
          <p v-if="info.examDescription" class="description">{{ info.examDescription }}</p>

          <ul v-if="info.instructions?.length" class="instructions">
            <li v-for="(line, i) in info.instructions" :key="i">{{ line }}</li>
          </ul>

          <div v-if="info.durationMinutes != null" class="meta">
            <span>{{ t('student.durationMeta', { minutes: info.durationMinutes }) }}</span>
            <span v-if="info.passScore != null">{{ t('student.passMeta', { score: info.passScore }) }}</span>
          </div>

          <div v-if="info.sessionStartTime" class="window">
            <span>{{ t('student.sessionWindow') }}</span>
            <strong>
              {{ new Date(info.sessionStartTime).toLocaleString() }}
              –
              {{ new Date(info.sessionEndTime!).toLocaleString() }}
            </strong>
          </div>

          <div class="actions">
            <el-button
              v-if="info.status === 'login_required' || info.requiresLogin"
              type="primary"
              size="large"
              class="full"
              @click="goLogin"
            >
              {{ t('student.logInToContinue') }}
            </el-button>

            <el-button
              v-else-if="info.canStart"
              type="primary"
              size="large"
              class="full"
              :loading="starting"
              @click="startExam"
            >
              {{ info.inProgressAttemptId ? t('student.continueExam') : t('student.startExam') }}
            </el-button>

            <el-button
              v-else-if="info.status === 'ok' && !info.withinTimeWindow"
              disabled
              size="large"
              class="full"
            >
              {{ t('student.notWithinSessionTime') }}
            </el-button>
          </div>
        </template>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.qr-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px 16px;
  background: linear-gradient(160deg, #eef2ff, #f8fafc);
}
.card {
  width: min(520px, 100%);
  border-radius: 16px;
}
.header {
  margin-bottom: 16px;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6366f1;
  font-weight: 600;
}
h1 {
  margin: 4px 0 8px;
  font-size: 1.5rem;
  line-height: 1.3;
}
.session {
  margin: 0;
  color: #6b7280;
}
.description {
  color: #374151;
  line-height: 1.5;
}
.instructions {
  margin: 16px 0;
  padding-left: 20px;
  color: #4b5563;
  line-height: 1.6;
}
.meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 14px;
  color: #374151;
  margin-bottom: 12px;
}
.window {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 20px;
}
.window strong {
  color: #111827;
  font-size: 14px;
}
.alert {
  margin-bottom: 16px;
}
.actions {
  margin-top: 8px;
}
.full {
  width: 100%;
}
</style>
