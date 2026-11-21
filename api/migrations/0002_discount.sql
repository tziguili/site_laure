-- Tarif réduit déclaré par le client lors de la réservation en ligne :
-- 'first' = « C'est mon premier cours » (vérifié : aucun cours confirmé pour cet email),
-- 'referral' = « Je parraine un·e ami·e » (déclaratif, nom de la personne parrainée dans referral_name).
ALTER TABLE bookings ADD COLUMN discount TEXT;
ALTER TABLE bookings ADD COLUMN referral_name TEXT;
