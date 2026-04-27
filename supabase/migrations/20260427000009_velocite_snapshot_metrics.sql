ALTER TABLE monthly_snapshots
  ADD COLUMN IF NOT EXISTS p90_dev_cycle_hours   float,
  ADD COLUMN IF NOT EXISTS median_lead_time_hours float,
  ADD COLUMN IF NOT EXISTS rework_rate            float,
  ADD COLUMN IF NOT EXISTS median_qa_time_hours   float;
