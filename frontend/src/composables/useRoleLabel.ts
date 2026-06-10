import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RoleCode } from '@/constants/roles';

export function useRoleLabel(role: RoleCode | string | undefined) {
  const { t } = useI18n();
  return computed(() => {
    if (!role) return '';
    const key = `roles.${role}`;
    const translated = t(key);
    return translated === key ? role : translated;
  });
}

export function useRoleLabels() {
  const { t } = useI18n();
  return (role: RoleCode | string | undefined) => {
    if (!role) return '';
    const key = `roles.${role}`;
    const translated = t(key);
    return translated === key ? role : translated;
  };
}
