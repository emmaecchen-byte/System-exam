<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  fetchAllPermissions,
  fetchRolePermissions,
  fetchRoles,
  updateRolePermissions,
  type PermissionRow,
  type RoleRow,
} from '@/api/users';
import { ROLES } from '@/constants/roles';
import { PERMISSION_LABELS, type PermissionCode } from '@/constants/permissions';
import { useRoleLabels } from '@/composables/useRoleLabel';

const MODULE_ORDER = [
  'category',
  'question',
  'paper',
  'exam',
  'session',
  'grading',
  'result',
  'user',
  'role',
  'audit',
  'system',
] as const;

const { t, te } = useI18n();
const roleLabel = useRoleLabels();

const loading = ref(false);
const saving = ref(false);
const roles = ref<RoleRow[]>([]);
const permissions = ref<PermissionRow[]>([]);
const selectedRoleId = ref<string | null>(null);
const selectedCodes = ref<string[]>([]);
const roleUserCount = ref(0);

const displayRoles = computed(() =>
  roles.value.filter((r) =>
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EXAM_ADMIN, ROLES.GRADER, ROLES.CANDIDATE].includes(
      r.code as typeof ROLES.SUPER_ADMIN,
    ),
  ),
);

const groupedPermissions = computed(() => {
  const groups = new Map<string, PermissionRow[]>();
  for (const p of permissions.value) {
    const list = groups.get(p.module) ?? [];
    list.push(p);
    groups.set(p.module, list);
  }
  return MODULE_ORDER.filter((m) => groups.has(m)).map((module) => ({
    module,
    label: moduleLabel(module),
    items: groups.get(module) ?? [],
  }));
});

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value));

const isReadOnly = computed(() => selectedRole.value?.code === ROLES.SUPER_ADMIN);

function moduleLabel(module: string) {
  const key = `roleMgmt.groups.${module}`;
  return te(key) ? t(key) : module;
}

function permissionLabel(code: string) {
  return PERMISSION_LABELS[code as PermissionCode] ?? code;
}

async function selectRole(role: RoleRow) {
  selectedRoleId.value = role.id;
  loading.value = true;
  try {
    const { data } = await fetchRolePermissions(role.id);
    selectedCodes.value = [...data.permissionCodes];
    roleUserCount.value = data.role.userCount;
  } catch {
    selectedCodes.value = role.rolePermissions.map((rp) => rp.permission.code);
    roleUserCount.value = role._count.userRoles;
    ElMessage.error(t('roleMgmt.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onRoleMenuSelect(id: string) {
  const role = roles.value.find((r) => r.id === id);
  if (role) void selectRole(role);
}

async function load() {
  loading.value = true;
  try {
    const [roleRes, permRes] = await Promise.all([fetchRoles(), fetchAllPermissions()]);
    roles.value = roleRes.data;
    permissions.value = permRes.data;
    if (!selectedRoleId.value && displayRoles.value.length) {
      await selectRole(displayRoles.value[0]);
    }
  } catch {
    ElMessage.error(t('roleMgmt.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!selectedRoleId.value || isReadOnly.value) return;
  saving.value = true;
  try {
    await updateRolePermissions(selectedRoleId.value, selectedCodes.value);
    ElMessage.success(t('roleMgmt.saved'));
    const roleRes = await fetchRoles();
    roles.value = roleRes.data;
    const role = roles.value.find((r) => r.id === selectedRoleId.value);
    if (role) await selectRole(role);
  } catch {
    ElMessage.error(t('roleMgmt.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="role-mgmt">
    <div class="page-header">
      <div>
        <h2>{{ t('roleMgmt.title') }}</h2>
        <p class="subtitle">{{ t('roleMgmt.subtitle') }}</p>
      </div>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!selectedRoleId || isReadOnly"
        @click="save"
      >
        {{ t('roleMgmt.savePermissions') }}
      </el-button>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>{{ t('roleMgmt.roles') }}</template>
          <el-menu :default-active="selectedRoleId ?? ''" @select="onRoleMenuSelect">
            <el-menu-item v-for="role in displayRoles" :key="role.id" :index="role.id">
              <div class="role-item">
                <span>{{ roleLabel(role.code) }}</span>
                <el-tag size="small" type="info">{{ role._count.userRoles }}</el-tag>
              </div>
            </el-menu-item>
          </el-menu>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="16">
        <el-card v-if="selectedRole" shadow="never">
          <template #header>
            <span>{{ roleLabel(selectedRole.code) }}</span>
            <el-tag v-if="isReadOnly" size="small" type="warning" style="margin-left: 8px">
              {{ t('roleMgmt.readOnly') }}
            </el-tag>
            <el-tag size="small" type="info" style="margin-left: 8px">
              {{ roleUserCount }} users
            </el-tag>
          </template>
          <p v-if="selectedRole.description" class="desc">{{ selectedRole.description }}</p>
          <div v-for="group in groupedPermissions" :key="group.module" class="perm-group">
            <h4>{{ group.label }}</h4>
            <el-checkbox-group v-model="selectedCodes" :disabled="isReadOnly">
              <el-checkbox
                v-for="perm in group.items"
                :key="perm.id"
                :label="perm.code"
                class="perm-check"
              >
                {{ permissionLabel(perm.code) }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h2 {
  margin: 0 0 4px;
}
.subtitle {
  margin: 0;
  color: #6b7280;
}
.role-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.perm-group {
  margin-bottom: 20px;
}
.perm-group h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #374151;
  font-weight: 600;
}
.perm-check {
  display: block;
  margin: 6px 0;
}
.desc {
  margin: 0 0 16px;
  color: #6b7280;
  font-size: 14px;
}
</style>
