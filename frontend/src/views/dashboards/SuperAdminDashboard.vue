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
          <h4>{{ t('dashboard.auditLogs') }}</h4>
          <p>{{ t('dashboard.auditLogsDesc') }}</p>
          <router-link to="/admin/audit-logs" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('dashboard.viewLogs') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.examCategories') }}</h4>
          <p>{{ t('dashboard.examCategoriesDescShort') }}</p>
          <router-link to="/admin/categories" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('dashboard.manageCategories') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.questionBank') }}</h4>
          <p>{{ t('dashboard.questionBankDescShort') }}</p>
          <router-link to="/admin/questions" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('dashboard.manageQuestions') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.exams') }}</h4>
          <p>{{ t('dashboard.examsDescShort') }}</p>
          <router-link to="/admin/exams" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('dashboard.manageExams') }}</el-button>
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
