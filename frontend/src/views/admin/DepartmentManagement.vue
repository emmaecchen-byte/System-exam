<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { ElTree } from 'element-plus';
import type Node from 'element-plus/es/components/tree/src/model/node';
import type { NodeDropType } from 'element-plus/es/components/tree/src/tree.type';
import {
  createDepartment,
  deleteDepartment,
  fetchDepartmentTree,
  updateDepartment,
  type DeptTreeNode,
} from '@/api/users';

const { t } = useI18n();

const loading = ref(false);
const saving = ref(false);
const tree = ref<DeptTreeNode[]>([]);
const treeRef = ref<InstanceType<typeof ElTree>>();
const selectedNode = ref<DeptTreeNode | null>(null);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const expandAllNodes = ref(true);

const form = reactive({
  name: '',
  parentId: null as string | null,
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
});

const treeProps = { children: 'children', label: 'name' };

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('deptMgmt.nameRequired'), trigger: 'blur' }],
}));

function flatten(nodes: DeptTreeNode[], excludeId?: string): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  function walk(list: DeptTreeNode[], prefix = '') {
    for (const n of list) {
      if (n.id !== excludeId) out.push({ id: n.id, name: prefix + n.name });
      if (n.children?.length) walk(n.children, `${prefix}${n.name} / `);
    }
  }
  walk(nodes);
  return out;
}

function toCascaderOptions(
  nodes: DeptTreeNode[],
  excludeId?: string,
): Array<{ value: string; label: string; children?: ReturnType<typeof toCascaderOptions> }> {
  return nodes
    .filter((n) => n.id !== excludeId)
    .map((n) => ({
      value: n.id,
      label: n.name,
      children: n.children?.length ? toCascaderOptions(n.children, excludeId) : undefined,
    }));
}

function collectDescendantIds(node: DeptTreeNode, out = new Set<string>()) {
  for (const child of node.children ?? []) {
    out.add(child.id);
    collectDescendantIds(child, out);
  }
  return out;
}

const parentCascaderOptions = computed(() => toCascaderOptions(tree.value, editingId.value ?? undefined));

function findDeptPath(nodes: DeptTreeNode[], targetId: string, path: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...path, n.id];
    if (n.id === targetId) return next;
    if (n.children?.length) {
      const found = findDeptPath(n.children, targetId, next);
      if (found) return found;
    }
  }
  return null;
}

const parentCascaderValue = computed({
  get: () => {
    if (!form.parentId) return [] as string[];
    return findDeptPath(tree.value, form.parentId) ?? [form.parentId];
  },
  set: (path: string[]) => {
    form.parentId = path.length ? path[path.length - 1] : null;
  },
});

const parentOptions = ref<Array<{ id: string; name: string }>>([]);

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchDepartmentTree(true);
    tree.value = data;
    if (selectedNode.value) {
      selectedNode.value = findNode(data, selectedNode.value.id) ?? null;
    }
  } catch {
    ElMessage.error(t('deptMgmt.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function findNode(nodes: DeptTreeNode[], id: string): DeptTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function onNodeClick(data: DeptTreeNode) {
  selectedNode.value = data;
}

function expandAll() {
  expandAllNodes.value = true;
  const nodes = treeRef.value?.store.nodesMap;
  if (nodes) {
    for (const key of Object.keys(nodes)) {
      nodes[key].expanded = true;
    }
  }
}

function collapseAll() {
  expandAllNodes.value = false;
  const nodes = treeRef.value?.store.nodesMap;
  if (nodes) {
    for (const key of Object.keys(nodes)) {
      nodes[key].expanded = false;
    }
  }
}

function openCreate(parentId: string | null = null) {
  isEdit.value = false;
  editingId.value = null;
  form.name = '';
  form.parentId = parentId;
  form.status = 'ACTIVE';
  parentOptions.value = flatten(tree.value);
  dialogVisible.value = true;
}

function openEdit(node?: DeptTreeNode) {
  const target = node ?? selectedNode.value;
  if (!target) {
    ElMessage.warning(t('deptMgmt.selectNode'));
    return;
  }
  isEdit.value = true;
  editingId.value = target.id;
  form.name = target.name;
  form.parentId = target.parentId;
  form.status = target.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  parentOptions.value = flatten(tree.value, target.id);
  dialogVisible.value = true;
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    if (isEdit.value && editingId.value) {
      await updateDepartment(editingId.value, {
        name: form.name.trim(),
        parentId: form.parentId,
        status: form.status,
      });
      ElMessage.success(t('deptMgmt.updated'));
    } else {
      await createDepartment({
        name: form.name.trim(),
        parentId: form.parentId,
      });
      ElMessage.success(t('deptMgmt.created'));
    }
    dialogVisible.value = false;
    await load();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('deptMgmt.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function remove(node?: DeptTreeNode) {
  const target = node ?? selectedNode.value;
  if (!target) {
    ElMessage.warning(t('deptMgmt.selectNode'));
    return;
  }
  try {
    await ElMessageBox.confirm(
      t('deptMgmt.deleteConfirm', { name: target.name }),
      t('common.confirm'),
      { type: 'warning' },
    );
    await deleteDepartment(target.id);
    ElMessage.success(t('deptMgmt.deleted'));
    if (selectedNode.value?.id === target.id) selectedNode.value = null;
    await load();
  } catch {
    /* cancelled */
  }
}

function allowDrop(draggingNode: Node, dropNode: Node, type: NodeDropType) {
  if (type !== 'inner') return true;
  const dragged = draggingNode.data as DeptTreeNode;
  const target = dropNode.data as DeptTreeNode;
  if (dragged.id === target.id) return false;
  const descendants = collectDescendantIds(dragged);
  return !descendants.has(target.id);
}

async function handleNodeDrop(draggingNode: Node, dropNode: Node, dropType: NodeDropType) {
  const draggedId = (draggingNode.data as DeptTreeNode).id;
  let newParentId: string | null = null;
  if (dropType === 'inner') {
    newParentId = (dropNode.data as DeptTreeNode).id;
  } else {
    newParentId = (dropNode.data as DeptTreeNode).parentId ?? null;
  }
  if (newParentId === draggedId) return;

  try {
    await updateDepartment(draggedId, { parentId: newParentId });
    ElMessage.success(t('deptMgmt.moved'));
    await load();
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
    ElMessage.error(msg ?? t('deptMgmt.saveFailed'));
    await load();
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="dept-mgmt">
    <div class="page-header">
      <div>
        <h2>{{ t('deptMgmt.title') }}</h2>
        <p class="subtitle">{{ t('deptMgmt.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-button @click="expandAll">{{ t('deptMgmt.expandAll') }}</el-button>
        <el-button @click="collapseAll">{{ t('deptMgmt.collapseAll') }}</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate()">
          {{ t('deptMgmt.addRoot') }}
        </el-button>
      </div>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-button
          type="primary"
          plain
          :disabled="!selectedNode"
          @click="openCreate(selectedNode?.id ?? null)"
        >
          {{ t('deptMgmt.addChild') }}
        </el-button>
        <el-button plain :disabled="!selectedNode" @click="openEdit()">
          {{ t('deptMgmt.edit') }}
        </el-button>
        <el-button type="danger" plain :disabled="!selectedNode" @click="remove()">
          {{ t('deptMgmt.delete') }}
        </el-button>
        <span v-if="selectedNode" class="selected-label">{{ selectedNode.name }}</span>
      </div>

      <p class="drag-hint">{{ t('deptMgmt.dragHint') }}</p>

      <el-tree
        ref="treeRef"
        :data="tree"
        :props="treeProps"
        node-key="id"
        highlight-current
        draggable
        :default-expand-all="expandAllNodes"
        :allow-drop="allowDrop"
        @node-click="onNodeClick"
        @node-drop="handleNodeDrop"
      >
        <template #default="{ data }">
          <div class="tree-node">
            <span :class="{ 'is-inactive': data.status === 'INACTIVE' }">{{ data.name }}</span>
            <span class="node-actions">
              <el-tag v-if="data.status === 'INACTIVE'" size="small" type="info">
                {{ t('userMgmt.statusDisabled') }}
              </el-tag>
              <el-button link type="primary" size="small" @click.stop="openCreate(data.id)">
                {{ t('deptMgmt.addChild') }}
              </el-button>
              <el-button link type="primary" size="small" @click.stop="openEdit(data)">
                {{ t('deptMgmt.edit') }}
              </el-button>
              <el-button link type="danger" size="small" @click.stop="remove(data)">
                {{ t('deptMgmt.delete') }}
              </el-button>
            </span>
          </div>
        </template>
      </el-tree>
      <el-empty v-if="!loading && !tree.length" :description="t('deptMgmt.empty')" />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('deptMgmt.editDepartment') : t('deptMgmt.addDepartment')"
      width="440px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('deptMgmt.name')" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('deptMgmt.parent')">
          <el-cascader
            v-model="parentCascaderValue"
            :options="parentCascaderOptions"
            :props="{ checkStrictly: true, emitPath: true, value: 'value', label: 'label' }"
            clearable
            :placeholder="t('deptMgmt.topLevel')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="isEdit" :label="t('deptMgmt.status')">
          <el-select v-model="form.status" style="width: 100%">
            <el-option :label="t('userMgmt.statusActive')" value="ACTIVE" />
            <el-option :label="t('userMgmt.statusDisabled')" value="INACTIVE" />
          </el-select>
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
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.drag-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #9ca3af;
}
.selected-label {
  margin-left: auto;
  color: #6b7280;
  font-size: 13px;
}
.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  padding-right: 8px;
  gap: 8px;
}
.is-inactive {
  color: #9ca3af;
}
.node-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
