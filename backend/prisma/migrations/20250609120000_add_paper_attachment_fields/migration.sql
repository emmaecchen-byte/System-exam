-- Paper audit attachment metadata (Word/PDF originals)
ALTER TABLE "papers" ADD COLUMN "attachment_file_name" TEXT;
ALTER TABLE "papers" ADD COLUMN "attachment_file_path" TEXT;
ALTER TABLE "papers" ADD COLUMN "attachment_file_size" INTEGER;
ALTER TABLE "papers" ADD COLUMN "attachment_mime_type" TEXT;
ALTER TABLE "papers" ADD COLUMN "attachment_uploaded_at" DATETIME;
ALTER TABLE "papers" ADD COLUMN "attachment_uploaded_by" TEXT;
