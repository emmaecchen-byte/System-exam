<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { fetchApi } from '@/utils/fetchApi';

interface DeptNode {
  id: string;
  name: string;
  parentId: string | null;
  children?: DeptNode[];
}

const loading = ref(false);
const saving = ref(false);
const tree = ref<DeptNode[]>([]);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();

const form = reactive({
  name: '',
  parentId: null as string | null,
});

const treeProps = { children: 'children', label: 'name' };

function flatten(nodes: DeptNode[], excludeId?: string): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  function walk(list: DeptNode[], prefix = '') {
    for (const n of list) {
      if (n.id !== excludeId) out.push({ id: n.id, name: prefix + n.name });
      if (n.children?.length) walk(n.children, `${prefix}${n.name} / `);
    }
  }
  walk(nodes);
  return out;
}

const parentOptions = ref<Array<{ id: string; name: string }>>([]);

async function load() {
  loading.value = true;
  try {
    tree.value = await fetchApi<DeptNode[]>('/admin/departments');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Failed to load departments');
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId: string | null = null) {
  isEdit.value = false;
  editingId.value = null;
  form.name = '';
  form.parentId = parentId;
  parentOptions.value = flatten(tree.value);
  dialogVisible.value = true;
}

function openEdit(node: DeptNode) {
  isEdit.value = true;
  editingId.value = node.id;
  form.name = node.name;
  form.parentId = node.parentId;
  parentOptions.value = flatten(tree.value, node.id);
  dialogVisible.value = true;
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('Department name is required');
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value && editingId.value) {
      await fetchApi(`/admin/departments/${editingId.value}`, {
        method: 'PUT',
        json: { name: form.name.trim(), parentId: form.parentId },
      });
      ElMessage.success('Department updated');
    } else {
      await fetchApi('/admin/departments', {
        method: 'POST',
        json: { name: form.name.trim(), parentId: form.parentId },
      });
      ElMessage.success('Department created');
    }
    dialogVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Save failed');
  } finally {
    saving.value = false;
  }
}

async function remove(node: DeptNode) {
  try {
    await ElMessageBox.confirm(`Delete department "${node.name}"?`, 'Confirm', { type: 'warning' });
    await fetchApi(`/admin/departments/${node.id}`, { method: 'DELETE' });
    ElMessage.success('Department deleted');
    await load();
  } catch {
    /* cancelled */
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2>Department Management</h2>
        <p class="subtitle">Organize departments in a parent/child tree</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate()">Add Department</el-button>
    </div>

    <el-card shadow="never">
      <el-tree :data="tree" :props="treeProps" node-key="id" default-expand-all>
        <template #default="{ data }">
          <div class="tree-node">
            <span>{{ data.name }}</span>
            <span class="actions">
              <el-button link type="primary" size="small" @click.stop="openCreate(data.id)">
                Add Child
              </el-button>
              <el-button link type="primary" size="small" @click.stop="openEdit(data)">Edit</el-button>
              <el-button link type="danger" size="small" @click.stop="remove(data)">Delete</el-button>
            </span>
          </div>
        </template>
      </el-tree>
      <el-empty v-if="!loading && !tree.length" description="No departments yet" />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? 'Edit Department' : 'Add Department'"
      width="420px"
      destroy-on-close
    >
      <el-form ref="formRef" label-width="100px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="Parent">
          <el-select v-model="form.parentId" clearable placeholder="Top level" style="width: 100%">
            <el-option
              v-for="opt in parentOptions"
              :key="opt.id"
              :label="opt.name"
              :value="opt.id"
            />
          </el-select>
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
.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  padding-right: 8px;
}
.actions {
  display: inline-flex;
  gap: 4px;
}
</style>
