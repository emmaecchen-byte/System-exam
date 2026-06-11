import { useI18n } from 'vue-i18n';
import { useRoleLabels } from '@/composables/useRoleLabel';
import { useSeedDataLabels } from '@/composables/useSeedDataLabels';

/** Localize audit log codes and English API labels for the active UI locale. */
export function useAuditLabels() {
  const { t, te } = useI18n();
  const roleLabel = useRoleLabels();
  const { categoryName, examTitle, paperTitle, personName } = useSeedDataLabels();

  function auditAction(action: string, fallback?: string) {
    const key = `audit.actions.${action}`;
    return te(key) ? t(key) : (fallback ?? action);
  }

  function auditCategory(category: string) {
    const key = `audit.categories.${category}`;
    return te(key) ? t(key) : category;
  }

  function auditObjectType(objectType: string) {
    const key = `audit.objectTypes.${objectType}`;
    return te(key) ? t(key) : objectType;
  }

  function auditActorRole(roleStr: string | null | undefined) {
    if (!roleStr) return '—';
    return roleStr
      .split(',')
      .map((role) => roleLabel(role.trim()))
      .join(', ');
  }

  function auditActorName(
    name: string | null | undefined,
    employeeNo?: string | null,
  ) {
    if (!name || name === 'System') {
      return te('audit.systemActor') ? t('audit.systemActor') : name ?? '—';
    }
    return personName({ employeeNo, name });
  }

  function auditObjectName(objectType: string, name: string | null | undefined) {
    if (!name) return '—';
    switch (objectType) {
      case 'Exam':
        return examTitle(undefined, name);
      case 'ExamCategory':
        return categoryName(undefined, name);
      case 'Paper':
        return paperTitle(undefined, name);
      case 'User':
        return personName({ name });
      default:
        return name;
    }
  }

  return {
    auditAction,
    auditCategory,
    auditObjectType,
    auditActorRole,
    auditActorName,
    auditObjectName,
  };
}
