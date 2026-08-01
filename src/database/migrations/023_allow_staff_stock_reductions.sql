-- Staff stock adjustments can increase or decrease a balance.  The audit table
-- remains append-only; only its validation is widened to permit a negative
-- quantity_change while never permitting a negative resulting balance.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'stock_movements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%quantity_change > 0%'
        OR pg_get_constraintdef(oid) LIKE '%new_quantity >= previous_quantity%'
      )
  LOOP
    EXECUTE format('ALTER TABLE stock_movements DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_quantity_change_nonzero_check'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_quantity_change_nonzero_check
      CHECK (quantity_change <> 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_new_quantity_nonnegative_check'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_new_quantity_nonnegative_check
      CHECK (new_quantity >= 0);
  END IF;
END $$;
