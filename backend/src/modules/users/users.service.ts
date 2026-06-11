import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.module';
import {
  CreateDepartmentDto,
  CreateUserDto,
  UpdateDepartmentDto,
  UpdateRolePermissionsDto,
  UpdateUserDto,
} from '../admin/dto/admin.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(search?: string, roleCode?: string, includeInactive = false) {
    const where: Prisma.UserWhereInput = {};
    if (!includeInactive) {
      where.status = UserStatus.ACTIVE;
    }
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim() } },
        { employeeNo: { contains: search.trim() } },
        { email: { contains: search.trim() } },
      ];
    }
    if (roleCode) {
      where.userRoles = { some: { role: { code: roleCode } } };
    }
    return this.prisma.user.findMany({
      where,
      include: { department: true, userRoles: { include: { role: true } } },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  findDepartments() {
    return this.prisma.department.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  async findDepartmentTree() {
    const departments = await this.prisma.department.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    type DeptNode = (typeof departments)[0] & { children: DeptNode[] };
    const map = new Map<string, DeptNode>();
    departments.forEach((d) => map.set(d.id, { ...d, children: [] }));
    const roots: DeptNode[] = [];
    for (const dept of map.values()) {
      if (dept.parentId && map.has(dept.parentId)) {
        map.get(dept.parentId)!.children.push(dept);
      } else {
        roots.push(dept);
      }
    }
    return roots;
  }

  async createDepartment(dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
      },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    await this.getDepartmentOrThrow(id);
    if (dto.parentId === id) {
      throw new BadRequestException('Department cannot be its own parent');
    }
    return this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        parentId: dto.parentId,
        status: dto.status,
      },
    });
  }

  async deleteDepartment(id: string) {
    await this.getDepartmentOrThrow(id);
    const childCount = await this.prisma.department.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Remove child departments first');
    }
    const userCount = await this.prisma.user.count({ where: { departmentId: id } });
    if (userCount > 0) {
      throw new BadRequestException('Reassign users before deleting this department');
    }
    await this.prisma.department.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { success: true };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { department: true, userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { employeeNo: dto.employeeNo.trim() },
    });
    if (existing) throw new ConflictException('Employee number already exists');

    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role) throw new BadRequestException('Invalid role');

    const passwordHash = await bcrypt.hash(dto.password ?? 'ChangeMe123!', 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        employeeNo: dto.employeeNo.trim(),
        departmentId: dto.departmentId ?? null,
        email: dto.email?.trim() ?? null,
        phone: dto.phone?.trim() ?? null,
        passwordHash,
        userRoles: { create: { roleId: role.id } },
      },
      include: { department: true, userRoles: { include: { role: true } } },
    });
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    if (dto.roleCode) {
      const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
      if (!role) throw new BadRequestException('Invalid role');
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        departmentId: dto.departmentId,
        email: dto.email,
        phone: dto.phone,
        status: dto.status,
      },
      include: { department: true, userRoles: { include: { role: true } } },
    });
  }

  async deleteUser(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { success: true };
  }

  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'SUPER_ADMIN') {
      throw new BadRequestException('Super Admin permissions cannot be modified');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes } },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
    });

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
  }

  private async getDepartmentOrThrow(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept || dept.status !== 'ACTIVE') throw new NotFoundException('Department not found');
    return dept;
  }
}
