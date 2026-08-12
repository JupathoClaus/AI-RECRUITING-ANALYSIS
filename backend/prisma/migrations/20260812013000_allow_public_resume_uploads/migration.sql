-- Public candidates do not have recruiter User records. Keep recruiter
-- attribution when present while allowing candidate-authored resume uploads.
ALTER TABLE "StoredFile" ALTER COLUMN "uploadedByUserId" DROP NOT NULL;
