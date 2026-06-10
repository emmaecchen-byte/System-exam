import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(search?: string, roleCode?: string) {
    const where: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
    };
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

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { department: true, userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
