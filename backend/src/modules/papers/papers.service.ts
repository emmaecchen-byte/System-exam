import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, Prisma, Question } from '@prisma/client';
import { createReadStream } from 'fs';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import {
  AddPaperQuestionsDto,
  CreatePaperDto,
  QueryPaperDto,
  ReorderPaperQuestionsDto,
  UpdatePaperDto,
  UpdatePaperQuestionScoreDto,
} from './dto/paper.dto';
import {
  deletePaperAttachmentFile,
  resolvePaperAttachmentAbsolutePath,
  writePaperAttachment,
} from './paper-attachment.util';

const paperInclude = {
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { paperQuestions: true, exams: true } },
} satisfies Prisma.PaperInclude;

const paperDetailInclude = {
  category: true,
  createdBy: { select: { id: true, name: true, employeeNo: true } },
  _count: { select: { exams: true } },
  paperQuestions: {
    orderBy: { sortOrder: 'asc' as const },
    include: { question: { select: { id: true, type: true, status: true } } },
  },
} satisfies Prisma.PaperInclude;

@Injectable()
export class PapersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: QueryPaperDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PaperWhereInput = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ContentStatus;
    } else {
      where.status = { not: ContentStatus.DISABLED };
    }
    if (query.search?.trim()) {
      where.title = { contains: query.search.trim() };
    }

    const [total, items] = await Promise.all([
      this.prisma.paper.count({ where }),
      this.prisma.paper.findMany({
        where,
        include: paperInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return {
      data: items.map((p) => this.toListItem(p)),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  }

  /** Published papers for exam creation dropdown */
  async findPublishedOptions() {
    const papers = await this.prisma.paper.findMany({
      where: { status: ContentStatus.ACTIVE },
      select: {
        id: true,
        title: true,
        version: true,
        totalScore: true,
        category: { select: { name: true } },
      },
      orderBy: [{ title: 'asc' }, { version: 'desc' }],
    });
    return papers.map((p) => ({
      ...p,
      totalScore: Number(p.totalScore),
      label: `${p.title} (v${p.version}) — ${p.category.name}`,
    }));
  }

  async findOne(id: string) {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: paperDetailInclude,
    });
    if (!paper) throw new NotFoundException('Paper not found');
    return this.toDetail(paper);
  }

  async preview(id: string) {
    const paper = await this.findOne(id);
    return {
      ...paper,
      questions: paper.questions.map((q) => ({
        sortOrder: q.sortOrder,
        score: q.score,
        stem: (q.snapshot as { stem?: string }).stem,
        type: (q.snapshot as { type?: string }).type,
        typeLabel: this.typeLabel((q.snapshot as { type?: string }).type ?? ''),
        options: (q.snapshot as { optionsJson?: unknown }).optionsJson,
      })),
    };
  }

  async getVersions(id: string) {
    const paper = await this.getPaperOrThrow(id);
    const familyId = paper.paperFamilyId ?? paper.id;
    const versions = await this.prisma.paper.findMany({
      where: {
        OR: [{ id: familyId }, { paperFamilyId: familyId }],
        version: { gt: 0 },
      },
      include: paperInclude,
      orderBy: { version: 'desc' },
    });
    return versions.map((p) => this.toListItem(p));
  }

  async create(
    dto: CreatePaperDto,
    createdById: string,
    attachment?: Express.Multer.File,
  ) {
    const paper = await this.prisma.paper.create({
      data: {
        title: dto.title.trim(),
        categoryId: dto.categoryId,
        sourceFileId: dto.sourceFileId,
        createdById,
        totalScore: 0,
        version: 0,
        status: ContentStatus.DRAFT,
      },
    });

    await this.prisma.paper.update({
      where: { id: paper.id },
      data: { paperFamilyId: paper.id },
    });

    if (attachment) {
      await this.saveAttachment(paper.id, attachment, createdById);
    }

    await this.auditService.log({
      actorId: createdById,
      action: 'CREATE',
      objectType: 'Paper',
      objectId: paper.id,
      objectName: paper.title,
      afterData: { categoryId: dto.categoryId, hasAttachment: Boolean(attachment) },
    });

    return this.findOne(paper.id);
  }

  async update(
    id: string,
    dto: UpdatePaperDto,
    actorId?: string,
    attachment?: Express.Multer.File,
  ) {
    const paper = await this.getPaperOrThrow(id);
    this.assertEditable(paper);

    await this.prisma.paper.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      },
    });

    if (attachment) {
      await this.saveAttachment(id, attachment, actorId);
    }

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Paper',
      objectId: id,
      afterData: { ...dto, attachmentUpdated: Boolean(attachment) },
    });

    return this.findOne(id);
  }

  async getAttachmentFile(id: string) {
    const paper = await this.getPaperOrThrow(id);
    if (!paper.attachmentFilePath || !paper.attachmentFileName) {
      throw new NotFoundException('Paper attachment not found');
    }
    const absolutePath = resolvePaperAttachmentAbsolutePath(paper.attachmentFilePath);
    return {
      stream: createReadStream(absolutePath),
      fileName: paper.attachmentFileName,
      mimeType: paper.attachmentMimeType ?? 'application/octet-stream',
      size: paper.attachmentFileSize ?? undefined,
    };
  }

  async uploadAttachment(id: string, file: Express.Multer.File | undefined, actorId?: string) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    await this.saveAttachment(id, file, actorId);

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Paper',
      objectId: id,
      afterData: {
        attachmentFileName: file.originalname,
        attachmentFileSize: file.size,
      },
      reason: 'Uploaded paper attachment',
    });

    const paper = await this.findOne(id);
    return {
      success: true,
      attachment: paper.attachment,
    };
  }

  async removeAttachment(id: string, actorId?: string) {
    const paper = await this.getPaperOrThrow(id);
    this.assertEditable(paper);
    if (!paper.attachmentFilePath) {
      throw new NotFoundException('Paper attachment not found');
    }

    await deletePaperAttachmentFile(paper.attachmentFilePath);
    await this.prisma.paper.update({
      where: { id },
      data: {
        attachmentFileName: null,
        attachmentFilePath: null,
        attachmentFileSize: null,
        attachmentMimeType: null,
        attachmentUploadedAt: null,
        attachmentUploadedById: null,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'Paper',
      objectId: id,
      objectName: paper.title,
      reason: 'Removed paper attachment',
    });

    return { success: true };
  }

  private async saveAttachment(
    paperId: string,
    file: Express.Multer.File,
    uploadedById?: string,
  ) {
    const paper = await this.getPaperOrThrow(paperId);
    this.assertEditable(paper);

    if (paper.attachmentFilePath) {
      await deletePaperAttachmentFile(paper.attachmentFilePath);
    }

    const stored = await writePaperAttachment(paperId, file);
    await this.prisma.paper.update({
      where: { id: paperId },
      data: {
        attachmentFileName: file.originalname,
        attachmentFilePath: stored.relativePath,
        attachmentFileSize: file.size,
        attachmentMimeType: file.mimetype,
        attachmentUploadedAt: new Date(),
        attachmentUploadedById: uploadedById ?? null,
      },
    });
  }

  async remove(id: string, actorId?: string) {
    const paper = await this.getPaperOrThrow(id);
    if (paper.status !== ContentStatus.DRAFT && paper.status !== ContentStatus.ARCHIVED) {
      throw new BadRequestException(
        'Only draft or archived papers can be deleted. Archive published papers first.',
      );
    }
    if (paper._count?.exams && paper._count.exams > 0) {
      throw new ConflictException('Paper is referenced by exams');
    }

    await deletePaperAttachmentFile(paper.attachmentFilePath);
    await this.prisma.paper.delete({ where: { id } });
    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'Paper',
      objectId: id,
    });
    return { message: 'Paper deleted', id };
  }

  async addQuestions(paperId: string, dto: AddPaperQuestionsDto, actorId?: string) {
    const paper = await this.getPaperOrThrow(paperId);
    this.assertEditable(paper);

    const existing = await this.prisma.paperQuestion.findMany({
      where: { paperId },
      select: { questionId: true, sortOrder: true },
    });
    const existingIds = new Set(existing.map((e) => e.questionId));
    let nextOrder =
      existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 0;

    for (const questionId of dto.questionIds) {
      if (existingIds.has(questionId)) continue;

      const question = await this.prisma.question.findUnique({ where: { id: questionId } });
      if (!question || question.status === ContentStatus.ARCHIVED) {
        throw new NotFoundException(`Question not found: ${questionId}`);
      }

      const score = dto.scores?.[questionId] ?? Number(question.score);
      await this.prisma.paperQuestion.create({
        data: {
          paperId,
          questionId,
          sortOrder: nextOrder++,
          score,
          questionSnapshotJson: this.buildSnapshot(question) as Prisma.InputJsonValue,
        },
      });
    }

    await this.recalculateTotal(paperId);
    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Paper',
      objectId: paperId,
      reason: 'Added questions',
    });
    return this.findOne(paperId);
  }

  async removeQuestion(paperId: string, questionId: string, actorId?: string) {
    const paper = await this.getPaperOrThrow(paperId);
    this.assertEditable(paper);

    await this.prisma.paperQuestion.deleteMany({ where: { paperId, questionId } });
    await this.reindexSortOrder(paperId);
    await this.recalculateTotal(paperId);
    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Paper',
      objectId: paperId,
      reason: `Removed question ${questionId}`,
    });
    return this.findOne(paperId);
  }

  async updateQuestionScore(
    paperId: string,
    questionId: string,
    dto: UpdatePaperQuestionScoreDto,
    _actorId?: string,
  ) {
    const paper = await this.getPaperOrThrow(paperId);
    this.assertEditable(paper);

    const updated = await this.prisma.paperQuestion.updateMany({
      where: { paperId, questionId },
      data: { score: dto.score },
    });
    if (updated.count === 0) throw new NotFoundException('Question not on this paper');

    await this.recalculateTotal(paperId);
    return this.findOne(paperId);
  }

  async reorderQuestions(paperId: string, dto: ReorderPaperQuestionsDto, _actorId?: string) {
    const paper = await this.getPaperOrThrow(paperId);
    this.assertEditable(paper);

    for (const item of dto.orders) {
      await this.prisma.paperQuestion.updateMany({
        where: { paperId, questionId: item.questionId },
        data: { sortOrder: item.sortOrder },
      });
    }

    return this.findOne(paperId);
  }

  async publish(id: string, actorId?: string) {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: { paperQuestions: { include: { question: true } } },
    });
    if (!paper) throw new NotFoundException('Paper not found');
    if (paper.status !== ContentStatus.DRAFT) {
      throw new BadRequestException('Only draft papers can be published');
    }
    if (paper.paperQuestions.length === 0) {
      throw new BadRequestException('Paper must contain at least one question');
    }
    if (Number(paper.totalScore) <= 0) {
      throw new BadRequestException('Total score must be greater than 0');
    }

    const familyId = paper.paperFamilyId ?? paper.id;
    const maxVersion = await this.prisma.paper.aggregate({
      where: {
        OR: [{ id: familyId }, { paperFamilyId: familyId }],
        version: { gt: 0 },
      },
      _max: { version: true },
    });
    const nextVersion = (maxVersion._max.version ?? 0) + 1;

    for (const pq of paper.paperQuestions) {
      const q = pq.question;
      await this.prisma.paperQuestion.update({
        where: { id: pq.id },
        data: {
          questionSnapshotJson: this.buildSnapshot(q) as Prisma.InputJsonValue,
        },
      });
    }

    const published = await this.prisma.paper.update({
      where: { id },
      data: { status: ContentStatus.ACTIVE, version: nextVersion },
    });

    await this.auditService.log({
      actorId,
      action: 'PUBLISH',
      objectType: 'Paper',
      objectId: id,
      afterData: { version: nextVersion },
    });

    return this.findOne(published.id);
  }

  async createNewVersion(id: string, createdById: string, actorId?: string) {
    const source = await this.prisma.paper.findUnique({
      where: { id },
      include: { paperQuestions: true },
    });
    if (!source) throw new NotFoundException('Paper not found');
    if (source.status !== ContentStatus.ACTIVE) {
      throw new BadRequestException('New versions can only be created from published papers');
    }

    const familyId = source.paperFamilyId ?? source.id;

    const existingDraft = await this.prisma.paper.findFirst({
      where: {
        paperFamilyId: familyId,
        status: ContentStatus.DRAFT,
        id: { not: source.id },
      },
    });
    if (existingDraft) {
      return this.findOne(existingDraft.id);
    }

    const draft = await this.prisma.paper.create({
      data: {
        title: source.title,
        categoryId: source.categoryId,
        totalScore: source.totalScore,
        version: 0,
        status: ContentStatus.DRAFT,
        paperFamilyId: familyId,
        sourceFileId: source.sourceFileId,
        attachmentFileName: source.attachmentFileName,
        attachmentFilePath: source.attachmentFilePath,
        attachmentFileSize: source.attachmentFileSize,
        attachmentMimeType: source.attachmentMimeType,
        attachmentUploadedAt: source.attachmentUploadedAt,
        attachmentUploadedById: source.attachmentUploadedById,
        createdById,
      },
    });

    for (const pq of source.paperQuestions) {
      await this.prisma.paperQuestion.create({
        data: {
          paperId: draft.id,
          questionId: pq.questionId,
          sortOrder: pq.sortOrder,
          score: pq.score,
          questionSnapshotJson: pq.questionSnapshotJson as Prisma.InputJsonValue,
        },
      });
    }

    await this.auditService.log({
      actorId: actorId ?? createdById,
      action: 'CREATE',
      objectType: 'Paper',
      objectId: draft.id,
      reason: `New version from ${id}`,
      afterData: { sourcePaperId: id, familyId },
    });

    return this.findOne(draft.id);
  }

  async archive(id: string, actorId?: string) {
    const paper = await this.getPaperOrThrow(id);
    if (paper.status !== ContentStatus.ACTIVE) {
      throw new BadRequestException('Only published papers can be archived');
    }

    await this.prisma.paper.update({
      where: { id },
      data: { status: ContentStatus.ARCHIVED },
    });

    await this.auditService.log({
      actorId,
      action: 'ARCHIVE',
      objectType: 'Paper',
      objectId: id,
    });

    return { message: 'Paper archived', id };
  }

  async unarchive(id: string, actorId?: string) {
    const paper = await this.getPaperOrThrow(id);
    if (paper.status !== ContentStatus.ARCHIVED) {
      throw new BadRequestException('Only archived papers can be restored');
    }

    const restored = await this.prisma.paper.update({
      where: { id },
      data: { status: ContentStatus.ACTIVE },
      include: paperInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'Paper',
      objectId: id,
      objectName: paper.title,
      reason: 'Paper unarchived — restored to published',
      afterData: { status: ContentStatus.ACTIVE },
    });

    return this.toListItem(restored);
  }

  private async getPaperOrThrow(id: string) {
    const paper = await this.prisma.paper.findUnique({
      where: { id },
      include: { _count: { select: { exams: true, paperQuestions: true } } },
    });
    if (!paper) throw new NotFoundException('Paper not found');
    return paper;
  }

  private assertEditable(paper: { status: ContentStatus }) {
    if (paper.status !== ContentStatus.DRAFT) {
      throw new BadRequestException('Published papers are immutable. Create a new version to edit.');
    }
  }

  private buildSnapshot(question: Question) {
    return {
      id: question.id,
      type: question.type,
      stem: question.stem,
      optionsJson: question.optionsJson,
      standardAnswerJson: question.standardAnswerJson,
      explanation: question.explanation,
      scoringRubric: question.scoringRubric,
      difficulty: question.difficulty,
      tagsJson: question.tagsJson,
      version: question.version,
    };
  }

  private async recalculateTotal(paperId: string) {
    const total = await this.prisma.paperQuestion.aggregate({
      where: { paperId },
      _sum: { score: true },
    });
    await this.prisma.paper.update({
      where: { id: paperId },
      data: { totalScore: total._sum.score ?? 0 },
    });
  }

  private async reindexSortOrder(paperId: string) {
    const items = await this.prisma.paperQuestion.findMany({
      where: { paperId },
      orderBy: { sortOrder: 'asc' },
    });
    for (let i = 0; i < items.length; i++) {
      await this.prisma.paperQuestion.update({
        where: { id: items[i].id },
        data: { sortOrder: i },
      });
    }
  }

  private toListItem(
    paper: Prisma.PaperGetPayload<{ include: typeof paperInclude }>,
  ) {
    return {
      id: paper.id,
      title: paper.title,
      categoryId: paper.categoryId,
      category: paper.category,
      version: paper.version,
      versionLabel: paper.version === 0 ? 'Draft' : `v${paper.version}`,
      totalScore: Number(paper.totalScore),
      status: paper.status,
      statusLabel: this.statusLabel(paper.status),
      questionCount: paper._count.paperQuestions,
      examCount: paper._count.exams,
      paperFamilyId: paper.paperFamilyId,
      hasAttachment: Boolean(paper.attachmentFilePath),
      attachment: paper.attachmentFileName
        ? {
            fileName: paper.attachmentFileName,
            fileSize: paper.attachmentFileSize,
            mimeType: paper.attachmentMimeType,
            uploadedAt: paper.attachmentUploadedAt,
          }
        : null,
      updatedAt: paper.updatedAt,
      createdAt: paper.createdAt,
    };
  }

  private toDetail(
    paper: Prisma.PaperGetPayload<{ include: typeof paperDetailInclude }>,
  ) {
    const listBase = this.toListItem({
      ...paper,
      _count: {
        paperQuestions: paper.paperQuestions.length,
        exams: paper._count.exams,
      },
    } as Prisma.PaperGetPayload<{ include: typeof paperInclude }>);

    return {
      ...listBase,
      isEditable: paper.status === ContentStatus.DRAFT,
      questions: paper.paperQuestions.map((pq) => ({
        id: pq.id,
        questionId: pq.questionId,
        sortOrder: pq.sortOrder,
        score: Number(pq.score),
        snapshot: pq.questionSnapshotJson,
        questionStatus: pq.question?.status,
      })),
    };
  }

  private statusLabel(status: ContentStatus) {
    const map: Record<ContentStatus, string> = {
      DRAFT: 'Draft',
      ACTIVE: 'Published',
      ARCHIVED: 'Archived',
      DISABLED: 'Inactive',
    };
    return map[status];
  }

  private typeLabel(type: string) {
    const map: Record<string, string> = {
      SINGLE_CHOICE: 'Single Choice',
      MULTIPLE_CHOICE: 'Multiple Choice',
      TRUE_FALSE: 'True/False',
      FILL_BLANK: 'Fill-in-Blank',
      SHORT_ANSWER: 'Short Answer',
    };
    return map[type] ?? type;
  }
}
