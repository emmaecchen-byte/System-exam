<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { fetchApi } from '@/utils/fetchApi';
import { ROLES, type RoleCode } from '@/constants/roles';
import { useRoleLabels } from '@/composables/useRoleLabel';

interface Department {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  name: string;
  employeeNo: string;
  email: string | null;
  status: string;
  department: Department | null;
  userRoles: Array<{ role: { code: string; name: string } }>;
}

const roleLabel = useRoleLabels();
const loading = ref(false);
const saving = ref(false);
const users = ref<UserRow[]>([]);
const departments = ref<Department[]>([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const search = ref('');

const form = reactive({
  name: '',
  employeeNo: '',
  email: '',
  departmentId: '' as string | null,
  roleCode: ROLES.CANDIDATE as RoleCode,
  password: '',
});

const roleOptions = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.EXAM_ADMIN,
  ROLES.GRADER,
  ROLES.CANDIDATE,
];

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: 'Name is required', trigger: 'blur' }],
  employeeNo: [{ required: true, message: 'Employee number is required', trigger: 'blur' }],
  roleCode: [{ required: true, message: 'Role is required', trigger: 'change' }],
}));

const dialogTitle = computed(() => (isEdit.value ? 'Edit User' : 'Create User'));

function resetForm() {
  form.name = '';
  form.employeeNo = '';
  form.email = '';
  form.departmentId = null;
  form.roleCode = ROLES.CANDIDATE;
  form.password = '';
}

function openCreate() {
  isEdit.value = false;
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: UserRow) {
  isEdit.value = true;
  editingId.value = row.id;
  form.name = row.name;
  form.employeeNo = row.employeeNo;
  form.email = row.email ?? '';
  form.departmentId = row.department?.id ?? null;
  form.roleCode = (row.userRoles[0]?.role.code ?? ROLES.CANDIDATE) as RoleCode;
  form.password = '';
  dialogVisible.value = true;
}

async function load() {
  loading.value = true;
  try {
    const [userData, deptData] = await Promise.all([
      fetchApi<UserRow[]>(`/admin/users?search=${encodeURIComponent(search.value)}&includeInactive=true`),
      fetchApi<Department[]>('/admin/users/departments'),
    ]);
    users.value = userData;
    departments.value = deptData;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Failed to load users');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (isEdit.value && editingId.value) {
      await fetchApi(`/admin/users/${editingId.value}`, {
        method: 'PUT',
        json: {
          name: form.name,
          email: form.email || null,
          departmentId: form.departmentId || null,
          roleCode: form.roleCode,
        },
      });
      ElMessage.success('User updated');
    } else {
      await fetchApi('/admin/users', {
        method: 'POST',
        json: {
          name: form.name,
          employeeNo: form.employeeNo,
          email: form.email || undefined,
          departmentId: form.departmentId || undefined,
          roleCode: form.roleCode,
          password: form.password || undefined,
        },
      });
      ElMessage.success('User created');
    }
    dialogVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Save failed');
  } finally {
    saving.value = false;
  }
}

async function remove(row: UserRow) {
  try {
    await ElMessageBox.confirm(`Deactivate user "${row.name}"?`, 'Confirm', { type: 'warning' });
    await fetchApi(`/admin/users/${row.id}`, { method: 'DELETE' });
    ElMessage.success('User deactivated');
    await load();
  } catch {
    /* cancelled or failed */
  }
}

onMounted(load);
</script>

<template>
  <div class="user-mgmt">
    <div class="page-header">
      <div>
        <h2>User Management</h2>
        <p class="subtitle">Create, edit, and assign roles to users</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">Create User</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="search"
          placeholder="Search name or employee no."
          clearable
          style="max-width: 280px"
          @keyup.enter="load"
        >
          <template #append>
            <el-button :icon="Search" @click="load" />
          </template>
        </el-input>
      </div>

      <el-table v-loading="loading" :data="users" stripe>
        <el-table-column prop="name" label="Name" min-width="140" />
        <el-table-column prop="employeeNo" label="Employee No." width="130" />
        <el-table-column label="Department" min-width="140">
          <template #default="{ row }">{{ row.department?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="Role" width="140">
          <template #default="{ row }">
            {{ roleLabel(row.userRoles[0]?.role.code ?? '') }}
          </template>
        </el-table-column>
        <el-table-column label="Status" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
            <el-button link type="danger" :disabled="row.status !== 'ACTIVE'" @click="remove(row)">
              Delete
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="Name" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="Employee No." prop="employeeNo">
          <el-input v-model="form.employeeNo" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="Email">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="Department">
          <el-select v-model="form.departmentId" clearable placeholder="Select department" style="width: 100%">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Role" prop="roleCode">
          <el-select v-model="form.roleCode" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r" :label="roleLabel(r)" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isEdit" label="Password">
          <el-input v-model="form.password" type="password" placeholder="Default: ChangeMe123!" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="save">Save</el-button>
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
.toolbar {
  margin-bottom: 16px;
}
</style>
