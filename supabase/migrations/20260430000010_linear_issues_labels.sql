-- Add labels to linear_issues so we can filter team insights by Linear labels
-- (e.g., exclude UX-labeled tickets which aren't dev work).
ALTER TABLE linear_issues
  ADD COLUMN IF NOT EXISTS labels jsonb;
