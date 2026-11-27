-- Cartes cadeaux : une carte (1 ou 3 cours) au nom du destinataire, payée par l'acheteur.
ALTER TABLE cards ADD COLUMN expires_at TEXT;        -- date de fin propre à la carte (cartes cadeaux) ; NULL = règle CARD_VALIDITY_DAYS
ALTER TABLE cards ADD COLUMN gift_from_name TEXT;    -- acheteur (NULL = carte classique)
ALTER TABLE cards ADD COLUMN gift_from_email TEXT;
ALTER TABLE cards ADD COLUMN gift_message TEXT;
ALTER TABLE cards ADD COLUMN gift_send_to TEXT;      -- 'recipient' | 'buyer' : à qui envoyer l'email cadeau

-- Report d'une réservation sur un autre cours
ALTER TABLE bookings ADD COLUMN moved_from_class_id INTEGER;
ALTER TABLE bookings ADD COLUMN moved_at TEXT;
