import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const MAX_BYTES = 20 * 1024 * 1024;

export function getUploadRoot(): string {
  return process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'uploads');
}

export function assertPaperAttachmentFile(file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestException('Only .doc, .docx, and .pdf files are allowed');
  }
  if (file.size > MAX_BYTES) {
    throw new BadRequestException('File size must not exceed 20MB');
  }
}

export function paperAttachmentDir(paperId: string): string {
  return path.join(getUploadRoot(), 'papers', paperId);
}

export function buildStoredFileName(originalName: string): string {
  const safeBase = path.basename(originalName).replace(/[^\w.\-()+\s]/g, '_');
  const timestamp = Date.now();
  return `${timestamp}_${safeBase}`;
}

export async function writePaperAttachment(
  paperId: string,
  file: Express.Multer.File,
): Promise<{ relativePath: string; absolutePath: string; storedName: string }> {
  assertPaperAttachmentFile(file);
  const dir = paperAttachmentDir(paperId);
  await fs.mkdir(dir, { recursive: true });
  const storedName = buildStoredFileName(file.originalname);
  const absolutePath = path.join(dir, storedName);
  await fs.writeFile(absolutePath, file.buffer);
  const relativePath = path.join('papers', paperId, storedName);
  return { relativePath, absolutePath, storedName };
}

export async function deletePaperAttachmentFile(relativePath?: string | null) {
  if (!relativePath) return;
  const absolutePath = path.join(getUploadRoot(), relativePath);
  await fs.unlink(absolutePath).catch(() => undefined);
}

export function resolvePaperAttachmentAbsolutePath(relativePath: string): string {
  return path.join(getUploadRoot(), relativePath);
}
