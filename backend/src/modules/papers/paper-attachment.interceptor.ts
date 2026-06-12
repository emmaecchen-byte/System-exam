import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new BadRequestException('Only .doc, .docx, and .pdf files are allowed') as Error, false);
      return;
    }
    cb(null, true);
  },
};

/** Used on create/update paper (field name: attachment). */
export const PaperAttachmentInterceptor = FileInterceptor('attachment', multerOptions);

/** Used on POST /papers/:id/attachment (field name: file). */
export const PaperAttachmentFileInterceptor = FileInterceptor('file', multerOptions);
