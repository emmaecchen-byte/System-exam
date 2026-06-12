-- Per-candidate question and option randomization
ALTER TABLE "exams" ADD COLUMN "random_question_order" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "exams" ADD COLUMN "random_option_order" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "exam_attempts" ADD COLUMN "question_order_json" JSONB;
ALTER TABLE "exam_attempts" ADD COLUMN "option_orders_json" JSONB;
