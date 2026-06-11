<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { getLoginErrorMessage } from '@/utils/authErrors';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import api from '@/api/client';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n();
const { personName } = useSeedDataLabels();

const form = ref({
  identifier: '',
  password: '',
  rememberMe: false,
});
const loading = ref(false);
const checkingServer = ref(false);
const serverOnline = ref<boolean | null>(null);
const pageOrigin = typeof window !== 'undefined' ? window.location.origin : '';

async function checkServer(maxAttempts = 8, delayMs = 1500) {
  checkingServer.value = true;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await api.get('/health', { timeout: 5000 });
      serverOnline.value = true;
      checkingServer.value = false;
      return;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  serverOnline.value = false;
  checkingServer.value = false;
}

onMounted(async () => {
  const reason = route.query.reason as string | undefined;
  if (reason === 'idle') {
    ElMessage.warning(t('login.sessionIdle'));
  } else if (reason === 'session_expired') {
    ElMessage.warning(t('login.sessionExpired'));
  }
  await checkServer();
});

async function submit() {
  if (!form.value.identifier.trim() || !form.value.password) {
    ElMessage.error(t('login.enterCredentials'));
    return;
  }

  loading.value = true;
  try {
    if (serverOnline.value === false) {
      await checkServer();
      if (!serverOnline.value) {
        ElMessage.error(getLoginErrorMessage(new Error('offline'), t));
        return;
      }
    }

    const user = await auth.login(
      form.value.identifier.trim(),
      form.value.password,
      form.value.rememberMe,
    );
    ElMessage.success(
      t('login.welcome', {
        name: personName({ employeeNo: user.employeeNo, name: user.name }),
      }),
    );
    const redirect = (route.query.redirect as string) || auth.homeRoute;
    router.push(redirect);
  } catch (error) {
    ElMessage.error(getLoginErrorMessage(error, t));
    if (!serverOnline.value) await checkServer();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="lang-corner">
      <LanguageSwitcher />
    </div>
    <el-card class="card">
      <div class="header">
        <h2>{{ t('login.title') }}</h2>
        <p>{{ t('login.subtitle') }}</p>
      </div>

      <el-alert
        v-if="serverOnline === false"
        :title="t('login.apiOffline')"
        type="error"
        show-icon
        :closable="false"
        class="server-alert"
      >
        <template #default>
          <p v-if="pageOrigin" class="server-alert-text">
            {{ t('login.apiOfflineOn', { url: pageOrigin }) }}
          </p>
          <p class="server-alert-text">{{ t('login.apiOfflineHint') }}</p>
          <el-button size="small" :loading="checkingServer" @click="checkServer()">
            {{ t('login.retryConnection') }}
          </el-button>
        </template>
      </el-alert>

      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('login.identifier')">
          <el-input
            v-model="form.identifier"
            :placeholder="t('login.identifierPlaceholder')"
            autocomplete="username"
            size="large"
          />
        </el-form-item>
        <el-form-item :label="t('login.password')">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            size="large"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.rememberMe">{{ t('login.rememberMe') }}</el-checkbox>
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" size="large" class="submit">
          {{ t('login.signIn') }}
        </el-button>
      </el-form>

      <div class="demo-accounts">
        <p class="demo-title">{{ t('login.demoAccounts') }}</p>
        <ul>
          <li>{{ t('login.demoSuperAdmin') }}</li>
          <li>{{ t('login.demoAdmin') }}</li>
          <li>{{ t('login.demoExamAdmin') }}</li>
          <li>{{ t('login.demoGrader') }}</li>
          <li>{{ t('login.demoCandidate') }}</li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #1e3a8a, #6d28d9);
  position: relative;
}
.lang-corner {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6px;
  padding: 4px 8px;
}
.card {
  width: min(440px, 100%);
}
.header h2 {
  margin: 0 0 4px;
}
.header p {
  margin: 0 0 20px;
  color: #6b7280;
  font-size: 14px;
}
.server-alert {
  margin-bottom: 16px;
}
.server-alert-text {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.5;
}
.submit {
  width: 100%;
}
.demo-accounts {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #6b7280;
}
.demo-title {
  margin: 0 0 8px;
  font-weight: 600;
  color: #374151;
}
.demo-accounts ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.6;
}
</style>
