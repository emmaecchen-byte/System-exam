import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';
import { AuditService } from '../../common/services/audit.service';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/category.dto';

const categoryInclude = {
  parent: { select: { id: true, name: true } },
  _count: {
    select: { exams: true, questions: true, papers: true, children: true },
  },
} satisfies Prisma.ExamCategoryInclude;

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: QueryCategoryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ExamCategoryWhereInput = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ContentStatus;
    } else if (!query.status) {
      where.status = { not: ContentStatus.ARCHIVED };
    }

    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim() } },
        { description: { contains: query.search.trim() } },
      ];
    }

    const orderBy: Prisma.ExamCategoryOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [total, items] = await Promise.all([
      this.prisma.examCategory.count({ where }),
      this.prisma.examCategory.findMany({
        where,
        include: categoryInclude,
        orderBy,
        skip,
        take: pageSize,
      }),
    ]);

    return {
      data: items.map((item) => this.toResponse(item)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  /** Active categories for parent dropdowns and exam creation */
  async findActiveOptions(excludeId?: string) {
    const categories = await this.prisma.examCategory.findMany({
      where: { status: ContentStatus.ACTIVE },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });

    if (!excludeId) {
      return categories;
    }

    const excluded = new Set(await this.getDescendantIds(excludeId));
    excluded.add(excludeId);
    return categories.filter((c) => !excluded.has(c.id));
  }

  async findOne(id: string) {
    const category = await this.prisma.examCategory.findUnique({
      where: { id },
      include: categoryInclude,
    });
    if (!category || category.status === ContentStatus.ARCHIVED) {
      throw new NotFoundException('Category not found');
    }
    return this.toResponse(category);
  }

  async create(dto: CreateCategoryDto, actorId?: string) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Category name is required');
    }

    await this.validateParentId(dto.parentId ?? null);

    const category = await this.prisma.examCategory.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        parentId: dto.parentId || null,
        status: dto.status ?? ContentStatus.ACTIVE,
      },
      include: categoryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'CREATE',
      objectType: 'ExamCategory',
      objectId: category.id,
      afterData: category,
    });

    return this.toResponse(category);
  }

  async update(id: string, dto: UpdateCategoryDto, actorId?: string) {
    const existing = await this.getCategoryOrThrow(id);
    const before = { ...existing };

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Category name is required');
      dto.name = name;
    }

    if (dto.parentId !== undefined) {
      await this.validateParentId(dto.parentId, id);
    }

    const category = await this.prisma.examCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: categoryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'ExamCategory',
      objectId: id,
      beforeData: before,
      afterData: category,
    });

    return this.toResponse(category);
  }

  async updateStatus(id: string, dto: UpdateCategoryStatusDto, actorId?: string) {
    if (dto.status !== ContentStatus.ACTIVE && dto.status !== ContentStatus.DISABLED) {
      throw new BadRequestException('Status must be ACTIVE or DISABLED');
    }

    const existing = await this.getCategoryOrThrow(id);
    const category = await this.prisma.examCategory.update({
      where: { id },
      data: { status: dto.status },
      include: categoryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'UPDATE',
      objectType: 'ExamCategory',
      objectId: id,
      beforeData: { status: existing.status },
      afterData: { status: dto.status },
      reason: 'Status toggle',
    });

    return this.toResponse(category);
  }

  async remove(id: string, actorId?: string) {
    const category = await this.prisma.examCategory.findUnique({
      where: { id },
      include: {
        _count: { select: { exams: true, questions: true, papers: true, children: true } },
      },
    });

    if (!category || category.status === ContentStatus.ARCHIVED) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.exams > 0) {
      throw new ConflictException({
        message: 'Cannot delete category with linked exams',
        linkedExams: category._count.exams,
        linkedQuestions: category._count.questions,
        linkedPapers: category._count.papers,
        linkedChildren: category._count.children,
      });
    }

    if (category._count.children > 0) {
      throw new ConflictException({
        message: 'Cannot delete category with child categories. Reassign or delete children first.',
        linkedChildren: category._count.children,
      });
    }

    const archived = await this.prisma.examCategory.update({
      where: { id },
      data: { status: ContentStatus.ARCHIVED },
      include: categoryInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'DELETE',
      objectType: 'ExamCategory',
      objectId: id,
      beforeData: category,
      afterData: archived,
      reason: 'Soft delete',
    });

    return {
      message: 'Category archived successfully',
      id,
      linkedQuestions: category._count.questions,
      linkedPapers: category._count.papers,
    };
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.examCategory.findUnique({ where: { id } });
    if (!category || category.status === ContentStatus.ARCHIVED) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async validateParentId(parentId: string | null, selfId?: string) {
    if (!parentId) return;

    if (selfId && parentId === selfId) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    const parent = await this.prisma.examCategory.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.status === ContentStatus.ARCHIVED) {
      throw new BadRequestException('Parent category not found');
    }

    if (selfId) {
      const descendants = await this.getDescendantIds(selfId);
      if (descendants.includes(parentId)) {
        throw new BadRequestException(
          'Cannot set parent to self or a descendant category (circular reference)',
        );
      }
    }
  }

  private async getDescendantIds(rootId: string): Promise<string[]> {
    const descendants: string[] = [];
    const queue = [rootId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await this.prisma.examCategory.findMany({
        where: { parentId: current, status: { not: ContentStatus.ARCHIVED } },
        select: { id: true },
      });
      for (const child of children) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  private toResponse(
    category: Prisma.ExamCategoryGetPayload<{ include: typeof categoryInclude }>,
  ) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      parentId: category.parentId,
      parent: category.parent,
      status: category.status,
      statusLabel: this.statusLabel(category.status),
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      counts: category._count,
    };
  }

  private statusLabel(status: ContentStatus) {
    switch (status) {
      case ContentStatus.ACTIVE:
        return 'active';
      case ContentStatus.DISABLED:
        return 'inactive';
      case ContentStatus.ARCHIVED:
        return 'archived';
      default:
        return status.toLowerCase();
    }
  }
}
