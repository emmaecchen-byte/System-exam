<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Menu } from '@element-plus/icons-vue';
import LayoutHeaderActions from '@/components/LayoutHeaderActions.vue';

defineProps<{
  brand: string;
  roleBadge?: string;
  theme?: 'admin' | 'exam-admin' | 'grader';
  userName?: string | null;
  employeeNo?: string | null;
  routerViewKey?: string;
}>();

const emit = defineEmits<{ logout: [] }>();

const route = useRoute();
const { t } = useI18n();
const sidebarOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);

function openSidebar() {
  sidebarOpen.value = true;
}

function closeSidebar() {
  sidebarOpen.value = false;
}
</script>

<template>
  <el-container class="app-shell">
    <Transition name="backdrop-fade">
      <div
        v-if="sidebarOpen"
        class="sidebar-backdrop"
        aria-hidden="true"
        @click="closeSidebar"
      />
    </Transition>

    <aside
      class="sidebar"
      :class="[`theme-${theme ?? 'admin'}`, { 'sidebar-open': sidebarOpen }]"
    >
      <div class="sidebar-inner">
        <div class="brand">{{ brand }}</div>
        <div v-if="roleBadge" class="role-badge">{{ roleBadge }}</div>
        <nav class="sidebar-nav" @click="closeSidebar">
          <slot name="menu" />
        </nav>
      </div>
    </aside>

    <el-container class="main-column">
      <el-header class="top-header">
        <el-button
          class="menu-toggle"
          :icon="Menu"
          text
          :aria-label="t('nav.openMenu')"
          @click="openSidebar"
        />
        <LayoutHeaderActions
          :user-name="userName"
          :employee-no="employeeNo"
          @logout="emit('logout')"
        />
      </el-header>
      <el-main class="main-content">
        <router-view :key="routerViewKey ?? route.fullPath" />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  position: relative;
}

.sidebar-backdrop {
  display: none;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #111827;
  color: #fff;
}

.sidebar-inner {
  height: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.theme-exam-admin.sidebar {
  background: #0f766e;
}

.theme-grader.sidebar {
  background: #7c2d12;
}

.brand {
  padding: 20px 20px 8px;
  font-weight: 700;
  font-size: 18px;
  line-height: 1.3;
}

.role-badge {
  padding: 0 20px 16px;
  font-size: 12px;
  color: #9ca3af;
}

.theme-exam-admin .role-badge {
  color: #99f6e4;
}

.theme-grader .role-badge {
  color: #fed7aa;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.sidebar-nav :deep(.el-menu) {
  border-right: none;
  background: transparent;
}

.sidebar-nav :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.88);
}

.sidebar-nav :deep(.el-menu-item:hover),
.sidebar-nav :deep(.el-menu-item.is-active) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.main-column {
  flex: 1;
  min-width: 0;
}

.top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 12px 0 4px;
  height: 56px;
}

.menu-toggle {
  display: none;
  font-size: 22px;
  padding: 8px;
  margin-right: auto;
}

.main-content {
  padding: 16px;
  min-height: calc(100vh - 56px);
}

@media (max-width: 768px) {
  .app-shell {
    width: 100%;
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1999;
    background: rgba(15, 23, 42, 0.45);
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 2000;
    width: min(280px, 85vw);
    transform: translateX(-105%);
    transition: transform 0.25s ease;
    box-shadow: none;
  }

  .sidebar.sidebar-open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.25);
  }

  .sidebar-inner {
    min-height: 100%;
  }

  .menu-toggle {
    display: inline-flex;
  }

  .main-column {
    width: 100%;
    flex: 1 1 auto;
  }

  .main-content {
    padding: 12px;
  }

  .top-header :deep(.header-actions) {
    gap: 8px;
  }

  .top-header :deep(.user-name) {
    display: none;
  }
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 0.2s ease;
}

.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}
</style>
