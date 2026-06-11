import * as XLSX from 'xlsx';

/** Columns in the official backend template (GET /admin/questions/import/template). */
export const OFFICIAL_EXCEL_HEADERS = [
  'Type',
  'Category',
  'Stem',
  'Options',
  'Correct Answer',
  'Points',
  'Explanation',
  'Difficulty',
  'Tags',
] as const;

const TYPE_HEADERS = new Set([
  'type',
  'questiontype',
  'question_type',
  '题型',
  '类型',
]);

const STEM_HEADERS = new Set(['stem', 'question', '题干', '题目']);

const CATEGORY_HEADERS = new Set(['category', '分类', '类别']);

const OPTIONS_HEADERS = new Set(['options', 'option', '选项']);

const ANSWER_HEADERS = new Set([
  'correctanswer',
  'answer',
  'standardanswer',
  'standard_answer',
  '正确答案',
  '答案',
]);

const POINTS_HEADERS = new Set(['points', 'point', 'score', '分值', '分数']);

const OPTION_LETTER_RE = /^option\s*[a-z]$/i;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/\s/g, '');
}

function readHeaderRow(sheet: XLSX.WorkSheet): string[] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
    headers.push(cell?.v != null ? String(cell.v).trim() : '');
  }
  return headers.filter(Boolean);
}

export interface ExcelColumnValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  headers: string[];
  usesOfficialFormat: boolean;
  usesLegacyOptionColumns: boolean;
  rowErrors: Array<{ row: number; message: string }>;
}

export function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

/**
 * Validate Excel structure before calling the backend import API.
 * Accepts the official template OR legacy "Question Type" + "Option A…D" layouts.
 */
export function validateExcelQuestionFile(buffer: ArrayBuffer): ExcelColumnValidation {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      valid: false,
      errors: ['Excel file has no worksheets.'],
      warnings: [],
      headers: [],
      usesOfficialFormat: false,
      usesLegacyOptionColumns: false,
      rowErrors: [],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const headers = readHeaderRow(sheet);
  const normalized = headers.map((h) => normalizeHeader(h));

  const errors: string[] = [];
  const warnings: string[] = [];
  const rowErrors: Array<{ row: number; message: string }> = [];

  const hasType = normalized.some((h) => TYPE_HEADERS.has(h));
  const hasStem = normalized.some((h) => STEM_HEADERS.has(h));
  const hasAnswer = normalized.some((h) => ANSWER_HEADERS.has(h));
  const hasPoints = normalized.some((h) => POINTS_HEADERS.has(h));
  const hasOptionsCol = normalized.some((h) => OPTIONS_HEADERS.has(h));
  const optionLetterCols = headers.filter((h) => OPTION_LETTER_RE.test(h.trim()));
  const hasCategory = normalized.some((h) => CATEGORY_HEADERS.has(h));

  const usesOfficialFormat =
    hasType &&
    hasStem &&
    hasAnswer &&
    hasPoints &&
    (hasOptionsCol || optionLetterCols.length >= 2);

  const usesLegacyOptionColumns = optionLetterCols.length >= 2 && !hasOptionsCol;

  if (!hasType) {
    errors.push(
      `Missing question type column. Use "Type" or "Question Type" (official: ${OFFICIAL_EXCEL_HEADERS[0]}).`,
    );
  }
  if (!hasStem) {
    errors.push(`Missing stem column. Use "Stem" (official: ${OFFICIAL_EXCEL_HEADERS[2]}).`);
  }
  if (!hasAnswer) {
    errors.push(
      `Missing answer column. Use "Correct Answer" (official: ${OFFICIAL_EXCEL_HEADERS[4]}).`,
    );
  }
  if (!hasPoints) {
    errors.push(`Missing points column. Use "Points" (official: ${OFFICIAL_EXCEL_HEADERS[5]}).`);
  }
  if (!hasOptionsCol && optionLetterCols.length < 2) {
    warnings.push(
      'No "Options" column or "Option A/B/C/D" columns found — required for choice questions; leave empty for T/F, fill-in-blank, or short answer.',
    );
  }

  if (usesLegacyOptionColumns) {
    warnings.push(
      `Legacy format detected (Option A, B, C, D). The official template uses a single Options column with pipe-separated values, e.g. "A|B|C|D". Download the official template to avoid errors.`,
    );
  }

  if (!hasCategory) {
    warnings.push(
      `No "Category" column — rows will use the default category from the question bank.`,
    );
  }

  const officialHeaderSet = new Set(
    OFFICIAL_EXCEL_HEADERS.map((h) => normalizeHeader(h)),
  );
  const matchedOfficial = normalized.filter((h) => officialHeaderSet.has(h)).length;
  if (matchedOfficial > 0 && matchedOfficial < 5) {
    warnings.push(
      `Only ${matchedOfficial} of ${OFFICIAL_EXCEL_HEADERS.length} official columns found. Recommended headers: ${OFFICIAL_EXCEL_HEADERS.join(', ')}.`,
    );
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const typeKey = Object.keys(row).find((k) => TYPE_HEADERS.has(normalizeHeader(k)));
    const stemKey = Object.keys(row).find((k) => STEM_HEADERS.has(normalizeHeader(k)));
    const typeVal = typeKey ? String(row[typeKey] ?? '').trim() : '';
    const stemVal = stemKey ? String(row[stemKey] ?? '').trim() : '';

    if (!typeVal && !stemVal) return;

    if (!stemVal) {
      rowErrors.push({ row: rowNum, message: 'Stem is required.' });
    }
    if (!typeVal) {
      rowErrors.push({ row: rowNum, message: 'Question type is required.' });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    headers,
    usesOfficialFormat,
    usesLegacyOptionColumns,
    rowErrors,
  };
}
