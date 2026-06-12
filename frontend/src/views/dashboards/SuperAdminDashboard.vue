<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div>
    <h2>{{ t('dashboard.superAdminTitle') }}</h2>
    <p class="subtitle">{{ t('dashboard.superAdminSubtitle') }}</p>
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('nav.users') }}</h4>
          <p>{{ t('dashboard.usersDesc') }}</p>
          <router-link to="/admin/users" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('nav.roles') }}</h4>
          <p>{{ t('dashboard.rolesDesc') }}</p>
          <router-link to="/admin/roles" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.auditLogs') }}</h4>
          <p>{{ t('dashboard.auditLogsDesc') }}</p>
          <router-link to="/admin/audit-logs" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('dashboard.viewLogs') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.resultsReports') }}</h4>
          <p>{{ t('dashboard.resultsReportsDesc') }}</p>
          <router-link to="/admin/results" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.subtitle {
  color: #6b7280;
  margin-bottom: 20px;
}
h4 {
  margin: 0 0 8px;
}
</style>
