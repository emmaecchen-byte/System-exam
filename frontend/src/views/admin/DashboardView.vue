<template>
  <div>
    <h2>Dashboard</h2>
    <el-row :gutter="16">
      <el-col :span="6"><el-card shadow="hover">Categories</el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">Question Bank</el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">Active Exams</el-card></el-col>
      <el-col :span="6"><el-card shadow="hover">Pending Grading</el-card></el-col>
    </el-row>
    <el-alert
      title="Foundation ready"
      description="Connect modules to API endpoints as you implement business flows."
      type="info"
      show-icon
      style="margin-top: 20px"
    />
  </div>
</template>
