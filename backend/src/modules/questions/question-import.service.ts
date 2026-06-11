import { BadRequestException, Injectable } from '@nestjs/common';
import { ContentStatus, QuestionType } from '@prisma/client';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../prisma/prisma.module';
import { QuestionsService } from './questions.service';
import {
  detectImportLayouts,
  ExtractedImportRow,
  extractRowFields,
  ImportColumnLayout,
  inferQuestionType,
  layoutFormatLabel,
  mapQuestionType,
  selectLayoutForRow,
} from './question-import-layout';
import { parsePdfExamText } from './question-import-pdf';
import {
  assignOptionKeys,
  buildTrueFalseOptions,
  labelToDifficulty,
  validateQuestionImportData,
} from './question.validator';

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ParsedImportRow {
  row: number;
  valid: boolean;
  errors: string[];
  duplicateWarning?: boolean;
  duplicateId?: string;
  warnings?: string[];
  data?: {
    categoryId: string;
    categoryName: string;
    type: QuestionType;
    stem: string;
    optionsJson?: object;
    standardAnswerJson: object;
    score: number;
    explanation?: string;
    scoringRubric?: string;
    difficulty: number;
    tagsJson: string[];
    status?: ContentStatus;
  };
}

@Injectable()
export class QuestionImportService {
  constructor(
    private prisma: PrismaService,
    private questionsService: QuestionsService,
    private auditService: AuditService,
  ) {}

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');

    sheet.columns = [
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Stem', key: 'stem', width: 50 },
      { header: 'Options', key: 'options', width: 40 },
      { header: 'Correct Answer', key: 'answer', width: 20 },
      { header: 'Points', key: 'points', width: 10 },
      { header: 'Explanation', key: 'explanation', width: 40 },
      { header: 'Difficulty', key: 'difficulty', width: 12 },
      { header: 'Tags', key: 'tags', width: 24 },
    ];

    sheet.addRow({
      type: 'Single Choice',
      category: 'IQC Incoming Inspection',
      stem: 'What is the acceptable tolerance for resistor R1?',
      options: '1%|5%|10%|No tolerance',
      answer: 'B',
      points: 2,
      explanation: 'Standard IPC-A-610 specifies 5% for this component',
      difficulty: 'Medium',
      tags: 'resistors,tolerance,IPC',
    });
    sheet.addRow({
      type: 'Multiple Choice',
      category: 'IQC Incoming Inspection',
      stem: 'Which are valid IQC inspection items?',
      options: 'Appearance|Dimension|Function test|Packaging',
      answer: 'A,B,C',
      points: 3,
      explanation: '',
      difficulty: 'Easy',
      tags: 'IQC',
    });
    sheet.addRow({
      type: 'True/False',
      category: 'Production Safety',
      stem: 'PPE is optional in the production area.',
      options: '',
      answer: 'F',
      points: 1,
      explanation: 'PPE is mandatory',
      difficulty: 'Easy',
      tags: 'safety,PPE',
    });
    sheet.addRow({
      type: 'Fill-in-Blank',
      category: 'Quality System',
      stem: 'ISO 9001 is a standard for ____ management systems.',
      options: '',
      answer: 'quality|Quality',
      points: 2,
      explanation: '',
      difficulty: 'Medium',
      tags: 'ISO',
    });
    sheet.addRow({
      type: 'Short Answer',
      category: 'Job Skills',
      stem: 'Describe the MRB process for non-conforming material.',
      options: '',
      answer: 'Isolate, notify, review, disposition',
      points: 5,
      explanation: '',
      difficulty: 'Hard',
      tags: 'MRB,NC',
    });

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async validateFile(buffer: Buffer, filename?: string) {
    const parsed = await this.parseImportFile(buffer, filename);
    const { rows, layout, defaultCategoryName } = parsed;
    const preview = rows.slice(0, 10);
    const validCount = rows.filter((r) => r.valid).length;
    const invalidCount = rows.filter((r) => !r.valid).length;
    const duplicateWarnings = rows.filter((r) => r.duplicateWarning).length;

    return {
      totalRows: rows.length,
      validCount,
      invalidCount,
      duplicateWarnings,
      detectedFormat:
        parsed.sourceFormat === 'pdf'
          ? 'PDF exam document (sections, Question N, options, Correct Answer)'
          : parsed.sourceFormat === 'word'
            ? 'Word document (.docx) — same layout as PDF (sections, Question N, options, Correct Answer)'
            : [...new Set(layout.map((l) => layoutFormatLabel(l.format)))].join(' · '),
      defaultCategoryName,
      answerKeyDetected: parsed.answerKeyDetected ?? false,
      answerKeyVoided: parsed.answerKeyVoided ?? false,
      importWarnings: parsed.importWarnings ?? [],
      preview,
      errors: rows.filter((r) => !r.valid).flatMap((r) =>
        r.errors.map((message) => ({ row: r.row, message })),
      ),
      allRows: rows,
    };
  }

  async importFromExcel(
    buffer: Buffer,
    createdById: string,
    skipInvalidRows = true,
    filename?: string,
  ) {
    const { rows, sourceFormat } = await this.parseImportFile(buffer, filename);
    const errors: ImportRowError[] = [];
    const imported: string[] = [];
    const skipped: number[] = [];
    const duplicates: number[] = [];

    for (const row of rows) {
      if (!row.valid) {
        if (skipInvalidRows) {
          skipped.push(row.row);
          row.errors.forEach((msg) => errors.push({ row: row.row, message: msg }));
          continue;
        }
        throw new BadRequestException({
          message: 'Import contains invalid rows',
          errors: row.errors,
          row: row.row,
        });
      }

      if (!row.data) continue;

      try {
        if (row.duplicateWarning) {
          duplicates.push(row.row);
        }
        const question = await this.questionsService.create(
          {
            categoryId: row.data.categoryId,
            type: row.data.type,
            stem: row.data.stem,
            optionsJson: row.data.optionsJson,
            standardAnswerJson: row.data.standardAnswerJson,
            score: row.data.score,
            explanation: row.data.explanation,
            scoringRubric: row.data.scoringRubric,
            difficulty: row.data.difficulty,
            tagsJson: row.data.tagsJson,
            status: row.data.status ?? ContentStatus.ACTIVE,
          },
          createdById,
          false,
        );
        imported.push(question.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Import failed';
        errors.push({ row: row.row, message: msg });
        if (!skipInvalidRows) throw e;
      }
    }

    const summary = `Imported ${imported.length} question(s). ${skipped.length} row(s) skipped. ${duplicates.length} duplicate warning(s).`;

    if (imported.length > 0) {
      await this.auditService.log({
        actorId: createdById,
        action: 'IMPORT',
        objectType: 'QuestionImport',
        objectName:
          sourceFormat === 'pdf'
            ? 'Question bank PDF import'
            : sourceFormat === 'word'
              ? 'Question bank Word import'
              : 'Question bank Excel import',
        afterData: {
          importedCount: imported.length,
          skippedCount: skipped.length,
          duplicateWarningCount: duplicates.length,
        },
        reason: summary,
      });
    }

    return {
      importedCount: imported.length,
      skippedCount: skipped.length,
      duplicateWarningCount: duplicates.length,
      importedIds: imported,
      errors,
      summary,
    };
  }

  private isPdfBuffer(buffer: Buffer, filename?: string): boolean {
    if (filename?.toLowerCase().endsWith('.pdf')) return true;
    return buffer.length >= 5 && buffer.subarray(0, 5).toString() === '%PDF-';
  }

  private isDocxBuffer(buffer: Buffer, filename?: string): boolean {
    const lower = filename?.toLowerCase() ?? '';
    if (lower.endsWith('.docx')) return true;
    if (lower.endsWith('.doc') && !lower.endsWith('.docx')) return false;
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return false;
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;
    const head = buffer.toString('binary', 0, Math.min(buffer.length, 4000));
    return head.includes('word/');
  }

  private isExamDocumentBuffer(buffer: Buffer, filename?: string): boolean {
    return this.isPdfBuffer(buffer, filename) || this.isDocxBuffer(buffer, filename);
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
     
    const { PDFParse } = require('pdf-parse') as {
      PDFParse: new (opts: { data: Buffer }) => {
        getText: () => Promise<{ text: string }>;
        destroy: () => Promise<void>;
      };
    };
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  private async parseImportFile(buffer: Buffer, filename?: string) {
    if (this.isExamDocumentBuffer(buffer, filename)) {
      return this.parseExamDocument(buffer, filename);
    }
    const workbook = await this.parseWorkbook(buffer);
    return {
      ...workbook,
      sourceFormat: 'excel' as const,
      answerKeyDetected: false,
      answerKeyVoided: false,
      importWarnings: [] as string[],
    };
  }

  private async parseExamDocument(buffer: Buffer, filename?: string) {
    const isWord = this.isDocxBuffer(buffer, filename);
    const text = isWord
      ? await this.extractDocxText(buffer)
      : await this.extractPdfText(buffer);
    const label = isWord ? 'Word document' : 'PDF';

    if (!text.trim()) {
      throw new BadRequestException(
        isWord
          ? 'Could not extract text from Word file. Ensure it is a valid .docx (not legacy .doc).'
          : 'Could not extract text from PDF. Use a text-based PDF (not a scanned image).',
      );
    }

    const parsed = parsePdfExamText(text);
    if (!parsed.rows.length) {
      throw new BadRequestException(
        `No questions found in ${label}. Supported layouts: English sections like "Section 1: Single Choice Questions" ` +
          'with "Question 1: …", "- A) …", and "Correct Answer: B"; or Chinese papers with sections like ' +
          '"一、选择题", numbered questions, and "A. …" options. Bundled answer-key sections (e.g. "参考答案") ' +
          'are detected automatically and excluded from import.',
      );
    }

    const importWarnings: string[] = [];
    if (parsed.answerKeyVoided) {
      importWarnings.push(
        parsed.answerKeyLayout === 'chinese_reference_section'
          ? 'Detected bundled answer key (参考答案). Questions were imported without correct answers — add answers manually in the question bank.'
          : 'Detected bundled answer key section. Questions were imported without correct answers — add answers manually in the question bank.',
      );
    }

    const built = await this.buildParsedRows(
      parsed.rows.map((f) => ({ row: f.row, fields: f.fields })),
      [],
      undefined,
      undefined,
      { omitAnswers: parsed.answerKeyVoided, importAsDraft: parsed.answerKeyVoided },
    );
    return {
      ...built,
      sourceFormat: isWord ? ('word' as const) : ('pdf' as const),
      answerKeyDetected: parsed.answerKeyDetected,
      answerKeyVoided: parsed.answerKeyVoided,
      importWarnings,
    };
  }

  private async parseWorkbook(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Excel file has no worksheet');

    const layouts = detectImportLayouts(sheet);
    const dataStartRow = Math.min(...layouts.map((l) => l.dataStartRow));

    const categories = await this.prisma.examCategory.findMany({
      where: { status: ContentStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const defaultCategory =
      categoryMap.get('iqc incoming inspection') ??
      categories[0];

    if (!defaultCategory) {
      throw new BadRequestException('No active exam categories exist. Create a category first.');
    }

    const fieldSets: Array<{ row: number; fields: ExtractedImportRow; optionColCount: number }> =
      [];

    for (let rowNum = dataStartRow; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const rowLayout = selectLayoutForRow(row, layouts);
      const fields = extractRowFields(row, rowLayout);

      if (!fields.typeRaw && !fields.stem && !fields.categoryRaw && !fields.optionsRaw && !fields.answerRaw) {
        continue;
      }

      fieldSets.push({ row: rowNum, fields, optionColCount: rowLayout.optionCols.length });
    }

    const built = await this.buildParsedRows(
      fieldSets.map((f) => ({ row: f.row, fields: f.fields, optionColCount: f.optionColCount })),
      layouts,
      categoryMap,
      defaultCategory,
    );

    return {
      rows: built.rows,
      layout: layouts,
      defaultCategoryName: defaultCategory.name,
    };
  }

  private async buildParsedRows(
    fieldSets: Array<{ row: number; fields: ExtractedImportRow; optionColCount?: number }>,
    layouts: ImportColumnLayout[],
    categoryMap?: Map<string, { id: string; name: string }>,
    defaultCategory?: { id: string; name: string },
    importOptions?: { omitAnswers?: boolean; importAsDraft?: boolean },
  ) {
    let categories = categoryMap;
    let fallbackCategory = defaultCategory;

    if (!categories || !fallbackCategory) {
      const categoryRows = await this.prisma.examCategory.findMany({
        where: { status: ContentStatus.ACTIVE },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      categories = new Map(categoryRows.map((c) => [c.name.toLowerCase(), c]));
      fallbackCategory =
        categories.get('iqc incoming inspection') ?? categoryRows[0];

      if (!fallbackCategory) {
        throw new BadRequestException('No active exam categories exist. Create a category first.');
      }
    }

    const results: ParsedImportRow[] = [];

    for (const { row: rowNum, fields, optionColCount = 0 } of fieldSets) {
      const errors: string[] = [];
      const warnings: string[] = [];

      const type =
        mapQuestionType(fields.typeRaw) ??
        inferQuestionType(fields.typeRaw, fields.optionsRaw, optionColCount);
      if (!type) {
        errors.push(
          fields.typeRaw
            ? `Invalid question type: "${fields.typeRaw}"`
            : 'Question type is required (or provide option columns for auto-detection)',
        );
      }

      let category = fields.categoryRaw
        ? categories.get(fields.categoryRaw.toLowerCase())
        : undefined;
      if (fields.categoryRaw && !category) {
        category = fallbackCategory;
        warnings.push(
          `Unknown category "${fields.categoryRaw}" — using "${fallbackCategory.name}"`,
        );
      } else if (!fields.categoryRaw) {
        category = fallbackCategory;
      }

      if (!fields.stem) errors.push('Stem is required');

      const score = Number(fields.pointsRaw);
      if (!score || score <= 0) errors.push('Points must be greater than 0');

      let optionsJson: object | undefined;
      let standardAnswerJson: object = {};
      let scoringRubric = fields.scoringRubric;

      if (type && errors.length === 0) {
        try {
          const omitAnswers = importOptions?.omitAnswers ?? false;
          if (omitAnswers) {
            const built = this.buildQuestionStructureWithoutAnswers(type, fields.optionsRaw);
            optionsJson = built.optionsJson;
            standardAnswerJson = built.standardAnswerJson;
            scoringRubric = undefined;
          } else {
            const built = this.buildAnswerPayload(type, fields.optionsRaw, fields.answerRaw);
            optionsJson = built.optionsJson;
            standardAnswerJson = built.standardAnswerJson;
            scoringRubric = scoringRubric ?? built.scoringRubric;
          }

          validateQuestionImportData(
            {
              type,
              stem: fields.stem,
              optionsJson,
              standardAnswerJson,
              score,
              scoringRubric,
            },
            { omitAnswers },
          );
        } catch (e) {
          errors.push(e instanceof Error ? e.message : 'Validation failed');
        }
      }

      let duplicateWarning = false;
      let duplicateId: string | undefined;
      if (category && type && fields.stem && errors.length === 0) {
        const dup = await this.questionsService.findDuplicate(category.id, type, fields.stem);
        if (dup) {
          duplicateWarning = true;
          duplicateId = dup.id;
        }
      }

      const tagsJson = fields.tagsRaw
        ? fields.tagsRaw.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
        : [];

      results.push({
        row: rowNum,
        valid: errors.length === 0,
        errors,
        warnings: warnings.length ? warnings : undefined,
        duplicateWarning,
        duplicateId,
        data:
          errors.length === 0 && category && type
            ? {
                categoryId: category.id,
                categoryName: category.name,
                type,
                stem: fields.stem,
                optionsJson,
                standardAnswerJson,
                score,
                explanation: fields.explanation,
                scoringRubric,
                difficulty: labelToDifficulty(fields.difficultyRaw),
                tagsJson,
                status: importOptions?.importAsDraft ? ContentStatus.DRAFT : ContentStatus.ACTIVE,
              }
            : undefined,
      });
    }

    return {
      rows: results,
      layout: layouts,
      defaultCategoryName: fallbackCategory.name,
    };
  }

  private buildQuestionStructureWithoutAnswers(type: QuestionType, optionsRaw: string) {
    if (type === QuestionType.TRUE_FALSE) {
      return {
        optionsJson: buildTrueFalseOptions(),
        standardAnswerJson: {},
      };
    }

    if (type === QuestionType.SINGLE_CHOICE || type === QuestionType.MULTIPLE_CHOICE) {
      const labels = this.splitOptions(optionsRaw);
      return {
        optionsJson: assignOptionKeys(labels),
        standardAnswerJson: {},
      };
    }

    return { standardAnswerJson: {} };
  }

  private buildAnswerPayload(type: QuestionType, optionsRaw: string, answerRaw: string) {
    if (type === QuestionType.TRUE_FALSE) {
      const key = answerRaw.toUpperCase();
      const normalized = key === 'TRUE' ? 'T' : key === 'FALSE' ? 'F' : key;
      return {
        optionsJson: buildTrueFalseOptions(),
        standardAnswerJson: { key: normalized },
      };
    }

    if (type === QuestionType.SINGLE_CHOICE || type === QuestionType.MULTIPLE_CHOICE) {
      const labels = this.splitOptions(optionsRaw);
      const options = assignOptionKeys(labels);

      if (type === QuestionType.MULTIPLE_CHOICE) {
        const keys = answerRaw.split(/[,，]/).map((k) => k.trim().toUpperCase());
        return {
          optionsJson: options,
          standardAnswerJson: { keys },
        };
      }

      const answerKey = answerRaw.trim().toUpperCase();
      const byLabel = options.find(
        (o) => o.label.toLowerCase() === answerRaw.trim().toLowerCase(),
      );
      const key = byLabel?.key ?? answerKey;
      return {
        optionsJson: options,
        standardAnswerJson: { key },
      };
    }

    if (type === QuestionType.FILL_BLANK) {
      const answers = answerRaw.split(/[|｜]/).map((a) => a.trim()).filter(Boolean);
      return {
        standardAnswerJson: { answers },
      };
    }

    return {
      standardAnswerJson: { reference: answerRaw },
      scoringRubric: answerRaw,
    };
  }

  private splitOptions(raw: string): string[] {
    if (!raw) return [];
    if (raw.includes('|')) return raw.split('|').map((s) => s.trim()).filter(Boolean);
    if (raw.includes('\t')) return raw.split('\t').map((s) => s.trim()).filter(Boolean);
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

}
