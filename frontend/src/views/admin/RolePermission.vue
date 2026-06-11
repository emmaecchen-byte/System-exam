<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchApi } from '@/utils/fetchApi';
import { ROLES } from '@/constants/roles';
import { PERMISSION_LABELS, type PermissionCode } from '@/constants/permissions';
import { useRoleLabels } from '@/composables/useRoleLabel';

interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
}

interface RoleRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  rolePermissions: Array<{ permission: Permission }>;
  _count: { userRoles: number };
}

const roleLabel = useRoleLabels();
const loading = ref(false);
const saving = ref(false);
const roles = ref<RoleRow[]>([]);
const permissions = ref<Permission[]>([]);
const selectedRoleId = ref<string | null>(null);
const selectedCodes = ref<string[]>([]);

const displayRoles = computed(() =>
  roles.value.filter((r) =>
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EXAM_ADMIN, ROLES.GRADER, ROLES.CANDIDATE].includes(
      r.code as typeof ROLES.SUPER_ADMIN,
    ),
  ),
);

const groupedPermissions = computed(() => {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions.value) {
    const list = groups.get(p.module) ?? [];
    list.push(p);
    groups.set(p.module, list);
  }
  return [...groups.entries()].map(([module, items]) => ({ module, items }));
});

const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value));

const isReadOnly = computed(() => selectedRole.value?.code === ROLES.SUPER_ADMIN);

function selectRole(role: RoleRow) {
  selectedRoleId.value = role.id;
  selectedCodes.value = role.rolePermissions.map((rp) => rp.permission.code);
}

function onRoleMenuSelect(id: string) {
  const role = roles.value.find((r) => r.id === id);
  if (role) selectRole(role);
}

async function load() {
  loading.value = true;
  try {
    const [roleData, permData] = await Promise.all([
      fetchApi<RoleRow[]>('/admin/roles'),
      fetchApi<Permission[]>('/admin/roles/permissions'),
    ]);
    roles.value = roleData;
    permissions.value = permData;
    if (!selectedRoleId.value && displayRoles.value.length) {
      selectRole(displayRoles.value[0]);
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Failed to load roles');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!selectedRoleId.value || isReadOnly.value) return;
  saving.value = true;
  try {
    await fetchApi(`/admin/roles/${selectedRoleId.value}/permissions`, {
      method: 'PUT',
      json: { permissionCodes: selectedCodes.value },
    });
    ElMessage.success('Permissions updated');
    await load();
    const updated = roles.value.find((r) => r.id === selectedRoleId.value);
    if (updated) selectRole(updated);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Save failed');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2>Roles & Permissions</h2>
        <p class="subtitle">Configure module permissions for each role</p>
      </div>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!selectedRoleId || isReadOnly"
        @click="save"
      >
        Save Permissions
      </el-button>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header>Roles</template>
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
            {{ roleLabel(selectedRole.code) }}
            <el-tag v-if="isReadOnly" size="small" type="warning" style="margin-left: 8px">
              Read-only
            </el-tag>
          </template>
          <p v-if="selectedRole.description" class="desc">{{ selectedRole.description }}</p>
          <div v-for="group in groupedPermissions" :key="group.module" class="perm-group">
            <h4>{{ group.module }}</h4>
            <el-checkbox-group v-model="selectedCodes" :disabled="isReadOnly">
              <el-checkbox
                v-for="perm in group.items"
                :key="perm.id"
                :label="perm.code"
                class="perm-check"
              >
                {{ PERMISSION_LABELS[perm.code as PermissionCode] ?? perm.name }}
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
  text-transform: capitalize;
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
