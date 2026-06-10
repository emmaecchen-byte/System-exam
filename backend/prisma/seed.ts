import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  PERMISSIONS,
  ROLE_PERMISSION_MAP,
  ROLES,
} from '../src/common/constants';

const prisma = new PrismaClient();

async function upsertUserWithRole(
  data: {
    employeeNo: string;
    name: string;
    email: string;
    password: string;
    departmentId: string;
  },
  roleCode: string,
) {
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.upsert({
    where: { employeeNo: data.employeeNo },
    update: { passwordHash, name: data.name, email: data.email },
    create: {
      name: data.name,
      employeeNo: data.employeeNo,
      email: data.email,
      passwordHash,
      departmentId: data.departmentId,
      status: 'ACTIVE',
    },
  });

  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (role) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  return user;
}

async function main() {
  const permissionEntries = Object.entries(PERMISSIONS).map(([key, code]) => ({
    code,
    name: key.replace(/_/g, ' '),
    module: code.split(':')[0],
  }));

  for (const p of permissionEntries) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  const roleDefs = [
    { code: ROLES.SUPER_ADMIN, name: 'Super Administrator' },
    { code: ROLES.ADMIN, name: 'Administrator' },
    { code: ROLES.EXAM_ADMIN, name: 'Exam Administrator' },
    { code: ROLES.GRADER, name: 'Grader' },
    { code: ROLES.CANDIDATE, name: 'Candidate' },
  ];

  for (const role of roleDefs) {
    const dbRole = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });

    const codes = ROLE_PERMISSION_MAP[role.code as keyof typeof ROLE_PERMISSION_MAP] ?? [];
    for (const code of codes) {
      const permission = await prisma.permission.findUnique({ where: { code } });
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: dbRole.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: dbRole.id, permissionId: permission.id },
      });
    }
  }

  const dept = await prisma.department.upsert({
    where: { id: 'seed-dept-quality' },
    update: {},
    create: {
      id: 'seed-dept-quality',
      name: 'Quality Department',
      status: 'ACTIVE',
    },
  });

  const qualitySystem = await prisma.examCategory.upsert({
    where: { id: 'seed-cat-quality-system' },
    update: {},
    create: {
      id: 'seed-cat-quality-system',
      name: 'Quality System',
      description: 'ISO and internal quality procedures',
      status: 'ACTIVE',
    },
  });

  const categories = [
    {
      id: 'seed-cat-iqc',
      name: 'IQC Incoming Inspection',
      description: 'Incoming material quality exams',
      parentId: qualitySystem.id,
    },
    {
      id: 'seed-cat-oqc',
      name: 'OQC Outgoing Inspection',
      description: 'Outgoing product quality exams',
      parentId: qualitySystem.id,
    },
    {
      id: 'seed-cat-safety',
      name: 'Production Safety',
      description: 'Workplace safety certification',
      parentId: null,
    },
    {
      id: 'seed-cat-job-skills',
      name: 'Job Skills',
      description: 'Role-based skill certification exams',
      parentId: null,
    },
  ];

  for (const cat of categories) {
    await prisma.examCategory.upsert({
      where: { id: cat.id },
      update: {
        name: cat.name,
        description: cat.description,
        parentId: cat.parentId,
      },
      create: {
        id: cat.id,
        name: cat.name,
        description: cat.description,
        parentId: cat.parentId,
        status: 'ACTIVE',
      },
    });
  }

  await upsertUserWithRole(
    {
      employeeNo: 'admin',
      name: 'Super Admin',
      email: 'admin@example.com',
      password: 'Admin@123',
      departmentId: dept.id,
    },
    ROLES.SUPER_ADMIN,
  );

  await upsertUserWithRole(
    {
      employeeNo: 'adminuser',
      name: 'System Administrator',
      email: 'adminuser@example.com',
      password: 'Admin@123',
      departmentId: dept.id,
    },
    ROLES.ADMIN,
  );

  await upsertUserWithRole(
    {
      employeeNo: 'examadmin',
      name: 'Exam Administrator',
      email: 'examadmin@example.com',
      password: 'ExamAdmin@123',
      departmentId: dept.id,
    },
    ROLES.EXAM_ADMIN,
  );

  await upsertUserWithRole(
    {
      employeeNo: 'grader',
      name: 'Lead Grader',
      email: 'grader@example.com',
      password: 'Grader@123',
      departmentId: dept.id,
    },
    ROLES.GRADER,
  );

  await upsertUserWithRole(
    {
      employeeNo: 'E10001',
      name: 'Sample Candidate',
      email: 'candidate@example.com',
      password: 'Candidate@123',
      departmentId: dept.id,
    },
    ROLES.CANDIDATE,
  );

  console.log('Seed completed.');
  console.log('Super Admin: admin@example.com / Admin@123');
  console.log('Admin: adminuser@example.com / Admin@123');
  console.log('Exam Admin: examadmin@example.com / ExamAdmin@123');
  console.log('Grader: grader@example.com / Grader@123');
  console.log('Candidate: candidate@example.com / Candidate@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
