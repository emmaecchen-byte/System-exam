import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';

export interface QuestionOption {
  key: string;
  label: string;
}

export function difficultyToLabel(level: number): string {
  if (level <= 1) return 'Easy';
  if (level >= 3) return 'Hard';
  return 'Medium';
}

export function labelToDifficulty(label: string): number {
  const v = label.trim().toLowerCase();
  if (['easy', 'e', '1', '简单'].includes(v)) return 1;
  if (['hard', 'h', '3', '困难'].includes(v)) return 3;
  return 2;
}

export function validateQuestionImportData(
  input: {
    type: QuestionType;
    stem: string;
    optionsJson?: unknown;
    standardAnswerJson?: unknown;
    score: number;
    scoringRubric?: string;
  },
  options?: { omitAnswers?: boolean },
) {
  if (options?.omitAnswers) {
    validateQuestionData({ ...input, standardAnswerJson: {}, scoringRubric: undefined }, {
      skipAnswerChecks: true,
    });
    return;
  }
  validateQuestionData(input);
}

export function validateQuestionData(
  input: {
    type: QuestionType;
    stem: string;
    optionsJson?: unknown;
    standardAnswerJson?: unknown;
    score: number;
    scoringRubric?: string;
  },
  validationOptions?: { skipAnswerChecks?: boolean },
) {
  const stem = input.stem?.trim();
  if (!stem) throw new BadRequestException('Question stem is required');
  if (!input.score || input.score <= 0) {
    throw new BadRequestException('Point value must be greater than 0');
  }

  const options = (input.optionsJson as QuestionOption[] | undefined) ?? [];
  const answer = input.standardAnswerJson as Record<string, unknown>;
  const skipAnswerChecks = validationOptions?.skipAnswerChecks ?? false;

  switch (input.type) {
    case QuestionType.SINGLE_CHOICE:
      validateChoiceOptions(options, 2);
      if (skipAnswerChecks) break;
      if (!answer?.key || typeof answer.key !== 'string') {
        throw new BadRequestException('Single choice requires exactly one correct answer');
      }
      if (!options.some((o) => o.key === answer.key)) {
        throw new BadRequestException('Correct answer must match an option key');
      }
      break;

    case QuestionType.MULTIPLE_CHOICE:
      validateChoiceOptions(options, 2);
      if (skipAnswerChecks) break;
      if (!Array.isArray(answer?.keys) || answer.keys.length < 1) {
        throw new BadRequestException('Multiple choice requires at least one correct answer');
      }
      for (const key of answer.keys as string[]) {
        if (!options.some((o) => o.key === key)) {
          throw new BadRequestException(`Correct answer key "${key}" not found in options`);
        }
      }
      break;

    case QuestionType.TRUE_FALSE: {
      if (skipAnswerChecks) break;
      const key = answer?.key;
      if (key !== 'T' && key !== 'F') {
        throw new BadRequestException('True/False correct answer must be T or F');
      }
      break;
    }

    case QuestionType.FILL_BLANK: {
      if (skipAnswerChecks) break;
      const answers = normalizeFillAnswers(answer);
      if (answers.length === 0) {
        throw new BadRequestException('Fill-in-blank requires at least one acceptable answer');
      }
      break;
    }

    case QuestionType.SHORT_ANSWER:
      if (skipAnswerChecks) break;
      if (!input.scoringRubric?.trim() && !answer?.reference && !answer?.text) {
        throw new BadRequestException(
          'Short answer requires a scoring rubric or reference answer for grading',
        );
      }
      break;
  }
}

function validateChoiceOptions(options: QuestionOption[], min: number) {
  if (!options || options.length < min) {
    throw new BadRequestException(`At least ${min} options are required`);
  }
  const keys = new Set<string>();
  for (const opt of options) {
    if (!opt.label?.trim()) throw new BadRequestException('Option label cannot be empty');
    if (!opt.key?.trim()) throw new BadRequestException('Option key cannot be empty');
    if (keys.has(opt.key)) throw new BadRequestException(`Duplicate option key: ${opt.key}`);
    keys.add(opt.key);
  }
}

export function normalizeFillAnswers(answer: Record<string, unknown>): string[] {
  if (Array.isArray(answer?.answers)) {
    return (answer.answers as string[]).map((a) => String(a).trim()).filter(Boolean);
  }
  if (typeof answer?.text === 'string' && answer.text.trim()) {
    return answer.text
      .split('|')
      .map((a) => a.trim())
      .filter(Boolean);
  }
  return [];
}

export function buildTrueFalseOptions(): QuestionOption[] {
  return [
    { key: 'T', label: 'True' },
    { key: 'F', label: 'False' },
  ];
}

export function assignOptionKeys(labels: string[]): QuestionOption[] {
  return labels.map((label, i) => ({
    key: String.fromCharCode(65 + i),
    label: label.trim(),
  }));
}
