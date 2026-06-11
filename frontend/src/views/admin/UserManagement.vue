<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import {
  createUser,
  deleteUser,
  fetchUserDepartments,
  fetchUsers,
  resetUserPassword,
  updateUser,
  type DepartmentOption,
  type UserRow,
} from '@/api/users';
import { ROLES, type RoleCode } from '@/constants/roles';
import { useRoleLabels } from '@/composables/useRoleLabel';

const { t } = useI18n();
const roleLabel = useRoleLabels();

const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const users = ref<UserRow[]>([]);
const departments = ref<DepartmentOption[]>([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();

const draftFilters = reactive({
  search: '',
  departmentId: '',
  roleCode: '',
});

const appliedFilters = reactive({
  search: '',
  departmentId: '',
  roleCode: '',
});

const pagination = reactive({ page: 1, pageSize: 20, total: 0 });

const form = reactive({
  name: '',
  employeeNo: '',
  email: '',
  phone: '',
  departmentId: null as string | null,
  roleCode: ROLES.CANDIDATE as RoleCode,
  password: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
});

const roleOptions = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.EXAM_ADMIN,
  ROLES.GRADER,
  ROLES.CANDIDATE,
];

const dialogTitle = computed(() =>
  isEdit.value ? t('userMgmt.editUser') : t('userMgmt.addUser'),
);

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('userMgmt.colName'), trigger: 'blur' }],
  employeeNo: [{ required: true, message: t('userMgmt.colEmployeeNo'), trigger: 'blur' }],
  roleCode: [{ required: true, message: t('userMgmt.colRole'), trigger: 'change' }],
}));

function generateRandomPassword(length = 12) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  form.password = Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

function resetForm() {
  form.name = '';
  form.employeeNo = '';
  form.email = '';
  form.phone = '';
  form.departmentId = null;
  form.roleCode = ROLES.CANDIDATE;
  form.password = '';
  form.status = 'ACTIVE';
}

function openCreate() {
  isEdit.value = false;
  editingId.value = null;
  resetForm();
  generateRandomPassword();
  dialogVisible.value = true;
}

function openEdit(row: UserRow) {
  isEdit.value = true;
  editingId.value = row.id;
  form.name = row.name;
  form.employeeNo = row.employeeNo;
  form.email = row.email ?? '';
  form.phone = row.phone ?? '';
  form.departmentId = row.department?.id ?? null;
  form.roleCode = (row.userRoles[0]?.role.code ?? ROLES.CANDIDATE) as RoleCode;
  form.status = row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  form.password = '';
  dialogVisible.value = true;
}

function statusLabel(status: string) {
  return status === 'ACTIVE' ? t('userMgmt.statusActive') : t('userMgmt.statusDisabled');
}

function buildQuery() {
  return {
    search: appliedFilters.search.trim() || undefined,
    departmentId: appliedFilters.departmentId || undefined,
    role: appliedFilters.roleCode || undefined,
    includeInactive: true,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

async function loadDepartments() {
  const { data } = await fetchUserDepartments();
  departments.value = data;
}

async function loadUsers() {
  loading.value = true;
  try {
    const { data } = await fetchUsers(buildQuery());
    users.value = data.data;
    pagination.total = data.meta.total;
  } catch {
    ElMessage.error(t('userMgmt.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function load() {
  try {
    await Promise.all([loadDepartments(), loadUsers()]);
  } catch {
    ElMessage.error(t('userMgmt.loadFailed'));
  }
}

function applyFilters() {
  Object.assign(appliedFilters, { ...draftFilters });
  pagination.page = 1;
  loadUsers();
}

function resetFilters() {
  draftFilters.search = '';
  draftFilters.departmentId = '';
  draftFilters.roleCode = '';
  Object.assign(appliedFilters, { ...draftFilters });
  pagination.page = 1;
  loadUsers();
}

function onPageChange(page: number) {
  pagination.page = page;
  loadUsers();
}

function onSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadUsers();
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (isEdit.value && editingId.value) {
      await updateUser(editingId.value, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        departmentId: form.departmentId,
        roleCode: form.roleCode,
        status: form.status,
      });
      ElMessage.success(t('userMgmt.updated'));
    } else {
      await createUser({
        name: form.name.trim(),
        employeeNo: form.employeeNo.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        departmentId: form.departmentId ?? undefined,
        roleCode: form.roleCode,
        password: form.password || undefined,
      });
      ElMessage.success(t('userMgmt.created'));
    }
    dialogVisible.value = false;
    await loadUsers();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('userMgmt.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function remove(row: UserRow) {
  try {
    await ElMessageBox.confirm(
      t('userMgmt.deactivateConfirm', { name: row.name }),
      t('common.confirm'),
      { type: 'warning' },
    );
    await deleteUser(row.id);
    ElMessage.success(t('userMgmt.deactivated'));
    await loadUsers();
  } catch {
    /* cancelled */
  }
}

async function handleResetPassword(row: UserRow) {
  try {
    await ElMessageBox.confirm(
      t('userMgmt.resetPassword'),
      t('common.confirm'),
      { type: 'warning' },
    );
  } catch {
    return;
  }

  resetting.value = true;
  try {
    const { data } = await resetUserPassword(row.id);
    await ElMessageBox.alert(
      `${t('userMgmt.resetPasswordMessage', { name: row.name })}\n\n${data.password}\n\n${t('userMgmt.resetPasswordHint')}`,
      t('userMgmt.resetPasswordTitle'),
      { confirmButtonText: t('common.confirm') },
    );
  } catch {
    ElMessage.error(t('userMgmt.saveFailed'));
  } finally {
    resetting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="user-mgmt">
    <div class="page-header">
      <div>
        <h2>{{ t('userMgmt.title') }}</h2>
        <p class="subtitle">{{ t('userMgmt.subtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">
        {{ t('userMgmt.addUser') }}
      </el-button>
    </div>

    <el-card shadow="never">
      <el-form inline class="filters" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model="draftFilters.search"
            :placeholder="t('userMgmt.searchPlaceholder')"
            clearable
            style="width: 220px"
            @keyup.enter="applyFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :label="t('userMgmt.filterDepartment')">
          <el-select
            v-model="draftFilters.departmentId"
            clearable
            :placeholder="t('userMgmt.allDepartments')"
            style="width: 180px"
          >
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('userMgmt.filterRole')">
          <el-select
            v-model="draftFilters.roleCode"
            clearable
            :placeholder="t('userMgmt.allRoles')"
            style="width: 160px"
          >
            <el-option v-for="r in roleOptions" :key="r" :label="roleLabel(r)" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyFilters">{{ t('userMgmt.applyFilters') }}</el-button>
          <el-button :icon="Refresh" @click="resetFilters">{{ t('userMgmt.resetFilters') }}</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="users" stripe>
        <el-table-column prop="name" :label="t('userMgmt.colName')" min-width="130" />
        <el-table-column prop="employeeNo" :label="t('userMgmt.colEmployeeNo')" width="120" />
        <el-table-column :label="t('userMgmt.colDepartment')" min-width="130">
          <template #default="{ row }">{{ row.department?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('userMgmt.colRole')" width="130">
          <template #default="{ row }">
            {{ roleLabel(row.userRoles[0]?.role.code ?? '') }}
          </template>
        </el-table-column>
        <el-table-column prop="email" :label="t('userMgmt.colEmail')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.email ?? '—' }}</template>
        </el-table-column>
        <el-table-column prop="phone" :label="t('userMgmt.colPhone')" width="130">
          <template #default="{ row }">{{ row.phone ?? '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('userMgmt.colStatus')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">{{ t('common.edit') }}</el-button>
            <el-button
              link
              type="warning"
              :disabled="resetting"
              @click="handleResetPassword(row)"
            >
              {{ t('userMgmt.resetPassword') }}
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="row.status !== 'ACTIVE'"
              @click="remove(row)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item :label="t('userMgmt.colName')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('userMgmt.colEmployeeNo')" prop="employeeNo">
          <el-input v-model="form.employeeNo" :disabled="isEdit" />
        </el-form-item>
        <el-form-item :label="t('userMgmt.colDepartment')">
          <el-select
            v-model="form.departmentId"
            clearable
            :placeholder="t('userMgmt.allDepartments')"
            style="width: 100%"
          >
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('userMgmt.colRole')" prop="roleCode">
          <el-select v-model="form.roleCode" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r" :label="roleLabel(r)" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('userMgmt.colEmail')">
          <el-input v-model="form.email" type="email" />
        </el-form-item>
        <el-form-item :label="t('userMgmt.colPhone')">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item v-if="isEdit" :label="t('userMgmt.colStatus')">
          <el-select v-model="form.status" style="width: 100%">
            <el-option :label="t('userMgmt.statusActive')" value="ACTIVE" />
            <el-option :label="t('userMgmt.statusDisabled')" value="INACTIVE" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="t('userMgmt.password')">
          <div class="password-row">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="ChangeMe123!"
              show-password
            />
            <el-button @click="generateRandomPassword">{{ t('userMgmt.generatePassword') }}</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
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
.filters {
  margin-bottom: 16px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.password-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.password-row .el-input {
  flex: 1;
}
</style>
