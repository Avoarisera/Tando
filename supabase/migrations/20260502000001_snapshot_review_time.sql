ALTER TABLE monthly_snapshots
  ADD COLUMN IF NOT EXISTS median_review_time_hours float;
