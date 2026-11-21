-- Demande d'avis Google envoyée le lendemain du cours (une seule fois par adresse email).
ALTER TABLE bookings ADD COLUMN review_sent_at TEXT;
