<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div>
    <h2>{{ t('dashboard.adminTitle') }}</h2>
    <p class="subtitle">{{ t('dashboard.adminSubtitle') }}</p>
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.examCategories') }}</h4>
          <p>{{ t('dashboard.examCategoriesDesc') }}</p>
          <router-link to="/admin/categories" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.questionBank') }}</h4>
          <p>{{ t('dashboard.questionBankDesc') }}</p>
          <router-link to="/questions" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.papers') }}</h4>
          <p>{{ t('dashboard.papersDesc') }}</p>
          <router-link to="/papers" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
          </router-link>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover">
          <h4>{{ t('dashboard.exams') }}</h4>
          <p>{{ t('dashboard.examsDesc') }}</p>
          <router-link to="/exams" custom v-slot="{ navigate }">
            <el-button type="primary" link @click="navigate">{{ t('common.open') }}</el-button>
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
