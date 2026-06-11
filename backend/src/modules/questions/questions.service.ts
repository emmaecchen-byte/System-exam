import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import { CreateQuestionDto, QueryQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { validateQuestionData } from './question.validator';

/** Strip sensitive fields for candidate-facing responses */
export function toCandidateQuestion(question: {
  id: string;
  type: string;
  stem: string;
  optionsJson: unknown;
  score: unknown;
}) {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: question.optionsJson,
    score: question.score,
  };
}

const questionInclude = {
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, employeeNo: true } },
} satisfies Prisma.QuestionInclude;

@Injectable()
export class QuestionsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: QueryQuestionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: Prisma.QuestionWhereInput = {
      status: { not: ContentStatus.ARCHIVED },
    };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type) where.type = query.type;
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ContentStatus;
    }
    if (query.search?.trim()) {
      where.OR = [
        { stem: { contains: query.search.trim() } },
        { explanation: { contains: query.search.trim() } },
      ];
    }

    const orderBy: Prisma.QuestionOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [total, items] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    return {
      data: items.map((q) => this.toResponse(q)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: questionInclude,
    });
    if (!question || question.status === ContentStatus.ARCHIVED) {
      throw new NotFoundException('Question not found');
    }
    return this.toResponse(question);
  }

  async create(
    dto: CreateQuestionDto,
    createdById: string,
    checkDuplicate = !dto.forceDuplicate,
  ) {
    validateQuestionData(dto);

    if (checkDuplicate) {
      const dup = await this.findDuplicate(dto.categoryId, dto.type, dto.stem);
      if (dup) {
        throw new ConflictException({
          message: 'A similar question already exists in this category',
          duplicateId: dup.id,
          warning: true,
        });
      }
    }

    const question = await this.prisma.question.create({
      data: {
        categoryId: dto.categoryId,
        type: dto.type,
        stem: dto.stem.trim(),
        optionsJson: this.normalizeOptions(dto.type, dto.optionsJson) as Prisma.InputJsonValue,
        standardAnswerJson: dto.standardAnswerJson as Prisma.InputJsonValue,
        score: dto.score,
        explanation: dto.explanation?.trim() || null,
        scoringRubric: dto.scoringRubric?.trim() || null,
        difficulty: dto.difficulty ?? 2,
        tagsJson: dto.tagsJson ?? [],
        status: dto.status ?? ContentStatus.ACTIVE,
        createdById,
      },
      include: questionInclude,
    });

    await this.auditService.log({
      actorId: createdById,
      action: 'CREATE',
      objectType: 'Question',
      objectId: question.id,
      afterData: { type: question.type, stem: question.stem },
    });

    return this.toResponse(question);
  }

  async update(id: string, dto: UpdateQuestionDto, actorId?: string) {
    const existing = await this.getQuestionOrThrow(id);
    const merged = {
      type: dto.type ?? existing.type,
      stem: dto.stem ?? existing.stem,
      optionsJson: dto.optionsJson ?? existing.optionsJson,
      standardAnswerJson: dto.standardAnswerJson ?? existing.standardAnswerJson,
      score: dto.score !== undefined ? Number(dto.score) : Number(existing.score),
      scoringRubric: dto.scoringRubric ?? existing.scoringRubric ?? undefined,
    };

    validateQuestionData(merged);

    const question = await this.prisma.question.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.stem !== undefined ? { stem: dto.stem.trim() } : {}),
        ...(dto.optionsJson !== undefined
          ? {
              optionsJson: this.normalizeOptions(
                merged.type,
                dto.optionsJson,
              ) as Prisma.InputJsonValue,
            }
          : {}),
        ...(dto.standardAnswerJson !== undefined
          ? { standardAnswerJson: dto.standardAnswerJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.explanation !== undefined
          ? { explanation: dto.explanation?.trim() || null }
          : {}),
        ...(dto.scoringRubric !== undefined
          ? { scoringRubric: dto.scoringRubric?.trim() || null }
          : {}),
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.tagsJson !== undefined ? { tagsJson: dto.tagsJson } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        version: existing.version + 1,
      },
      include: questionInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Question',
      objectId: id,
      beforeData: { stem: existing.stem, version: existing.version },
      afterData: { stem: question.stem, version: question.version },
    });

    return this.toResponse(question);
  }

  async remove(id: string, actorId?: string) {
    const existing = await this.getQuestionOrThrow(id);

    const paperLinks = await this.prisma.paperQuestion.findMany({
      where: { questionId: id },
      select: { paperId: true },
    });
    const linkedPaperIds = [...new Set(paperLinks.map((l) => l.paperId))];

    // Papers used by exams that already have attempts must keep their question
    // snapshots intact — finished (and in-progress) tests are never altered.
    const lockedPaperIds = new Set(
      linkedPaperIds.length === 0
        ? []
        : (
            await this.prisma.paper.findMany({
              where: {
                id: { in: linkedPaperIds },
                exams: { some: { attempts: { some: {} } } },
              },
              select: { id: true },
            })
          ).map((p) => p.id),
    );

    const removablePaperIds = linkedPaperIds.filter((paperId) => !lockedPaperIds.has(paperId));

    await this.prisma.$transaction(async (tx) => {
      if (removablePaperIds.length > 0) {
        await tx.paperQuestion.deleteMany({
          where: { questionId: id, paperId: { in: removablePaperIds } },
        });
        for (const paperId of removablePaperIds) {
          await this.recalculatePaperTotal(tx, paperId);
          await this.reindexPaperSortOrder(tx, paperId);
        }
      }

      return tx.question.update({
        where: { id },
        data: { status: ContentStatus.ARCHIVED },
        include: questionInclude,
      });
    });

    const auditParts = ['Soft delete'];
    if (removablePaperIds.length > 0) {
      auditParts.push(`removed from ${removablePaperIds.length} paper(s)`);
    }
    if (lockedPaperIds.size > 0) {
      auditParts.push(`preserved on ${lockedPaperIds.size} paper(s) with exam attempts`);
    }

    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'Question',
      objectId: id,
      beforeData: existing,
      reason: auditParts.join('; '),
    });

    return {
      message: 'Question deleted',
      id,
      removedFromPapers: removablePaperIds.length,
      preservedOnPapers: lockedPaperIds.size,
    };
  }

  private async recalculatePaperTotal(
    tx: Prisma.TransactionClient,
    paperId: string,
  ) {
    const total = await tx.paperQuestion.aggregate({
      where: { paperId },
      _sum: { score: true },
    });
    await tx.paper.update({
      where: { id: paperId },
      data: { totalScore: total._sum.score ?? 0 },
    });
  }

  private async reindexPaperSortOrder(tx: Prisma.TransactionClient, paperId: string) {
    const items = await tx.paperQuestion.findMany({
      where: { paperId },
      orderBy: { sortOrder: 'asc' },
    });
    for (let i = 0; i < items.length; i++) {
      await tx.paperQuestion.update({
        where: { id: items[i].id },
        data: { sortOrder: i },
      });
    }
  }

  async findDuplicate(categoryId: string, type: QuestionType, stem: string) {
    return this.prisma.question.findFirst({
      where: {
        categoryId,
        type,
        stem: stem.trim(),
        status: { not: ContentStatus.ARCHIVED },
      },
      select: { id: true, stem: true },
    });
  }

  private async getQuestionOrThrow(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question || question.status === ContentStatus.ARCHIVED) {
      throw new NotFoundException('Question not found');
    }
    return question;
  }

  private normalizeOptions(type: QuestionType, optionsJson?: unknown) {
    if (type === QuestionType.TRUE_FALSE) {
      return [
        { key: 'T', label: 'True' },
        { key: 'F', label: 'False' },
      ];
    }
    return optionsJson ?? null;
  }

  private toResponse(
    question: Prisma.QuestionGetPayload<{ include: typeof questionInclude }>,
  ) {
    return {
      id: question.id,
      categoryId: question.categoryId,
      category: question.category,
      type: question.type,
      typeLabel: this.typeLabel(question.type),
      stem: question.stem,
      optionsJson: question.optionsJson,
      standardAnswerJson: question.standardAnswerJson,
      score: Number(question.score),
      explanation: question.explanation,
      scoringRubric: question.scoringRubric,
      difficulty: question.difficulty,
      difficultyLabel: question.difficulty <= 1 ? 'Easy' : question.difficulty >= 3 ? 'Hard' : 'Medium',
      tagsJson: question.tagsJson,
      status: question.status,
      version: question.version,
      createdBy: question.createdBy,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  private typeLabel(type: QuestionType) {
    const map: Record<QuestionType, string> = {
      SINGLE_CHOICE: 'Single Choice',
      MULTIPLE_CHOICE: 'Multiple Choice',
      TRUE_FALSE: 'True/False',
      FILL_BLANK: 'Fill-in-Blank',
      SHORT_ANSWER: 'Short Answer',
    };
    return map[type];
  }
}
