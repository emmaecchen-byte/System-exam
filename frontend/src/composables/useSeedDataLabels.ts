import { useI18n } from 'vue-i18n';

function slug(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Localize known seed / demo database strings for the active UI locale. */
export function useSeedDataLabels() {
  const { t, te, locale } = useI18n();

  function translateByMap(
    section: 'categories' | 'exams' | 'papers' | 'people' | 'departments',
    field: 'name' | 'description' | undefined,
    id: string | null | undefined,
    text: string,
  ): string {
    if (locale.value === 'en' || !text) return text;

    if (id) {
      const idKey = field
        ? `seedData.${section}.byId.${id}.${field}`
        : `seedData.${section}.byId.${id}`;
      if (te(idKey)) return String(t(idKey));
    }

    const textKey = field
      ? `seedData.${section}.byText.${slug(text)}.${field}`
      : `seedData.${section}.byText.${slug(text)}`;
    if (te(textKey)) return String(t(textKey));

    return text;
  }

  function categoryName(id?: string | null, name?: string | null) {
    if (!name) return '—';
    return translateByMap('categories', 'name', id ?? undefined, name);
  }

  function categoryDescription(id?: string | null, desc?: string | null) {
    if (!desc) return '—';
    return translateByMap('categories', 'description', id ?? undefined, desc);
  }

  function examTitle(id?: string | null, title?: string | null) {
    if (!title) return '—';
    return translateByMap('exams', undefined, id ?? undefined, title);
  }

  function paperTitle(id?: string | null, title?: string | null) {
    if (!title) return '—';
    return translateByMap('papers', undefined, id ?? undefined, title);
  }

  function paperLabel(label?: string | null) {
    if (!label) return '—';
    if (locale.value === 'en') return label;

    const fullKey = `seedData.papers.byText.${slug(label)}`;
    if (te(fullKey)) return String(t(fullKey));

    const match = label.match(/^(.+?) \(v(\d+)\) — (.+)$/);
    if (match) {
      return `${paperTitle(undefined, match[1])} (v${match[2]}) — ${categoryName(undefined, match[3])}`;
    }

    return label;
  }

  function personName(opts: { employeeNo?: string | null; name?: string | null }) {
    const { employeeNo, name } = opts;
    if (!name) return '—';
    if (locale.value === 'en') return name;

    if (employeeNo && te(`seedData.people.byEmployeeNo.${employeeNo}`)) {
      return String(t(`seedData.people.byEmployeeNo.${employeeNo}`));
    }

    return translateByMap('people', undefined, undefined, name);
  }

  function departmentName(id?: string | null, name?: string | null) {
    if (!name) return '—';
    return translateByMap('departments', undefined, id ?? undefined, name);
  }

  return {
    categoryName,
    categoryDescription,
    examTitle,
    paperTitle,
    paperLabel,
    personName,
    departmentName,
  };
}
