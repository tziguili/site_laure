-- Parrainage vérifié : email de la personne parrainée (qui doit avoir réservé et payé le même cours,
-- et dont c'est le premier cours). referral_name reprend le nom de sa réservation.
ALTER TABLE bookings ADD COLUMN referral_email TEXT;
CREATE INDEX idx_bookings_referral ON bookings (referral_email);
