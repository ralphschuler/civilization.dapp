ALTER TABLE village_appearance_preferences
  DROP CONSTRAINT IF EXISTS village_appearance_preferences_appearance_check;

ALTER TABLE village_appearance_preferences
  ADD CONSTRAINT village_appearance_preferences_appearance_check
  CHECK (appearance IN ('classic', 'dusk', 'dawn'));
