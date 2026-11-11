-- Laure Yoga Club — schéma initial
-- Toutes les dates sont stockées en ISO 8601 UTC (ex. 2026-11-15T10:00:00.000Z).

CREATE TABLE classes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  starts_at     TEXT    NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 60,
  title         TEXT    NOT NULL DEFAULT 'Cours de yoga',
  location      TEXT    NOT NULL DEFAULT 'Maison Né, 25 rue Beccaria, 75012 Paris',
  capacity      INTEGER NOT NULL,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);
CREATE INDEX idx_classes_starts_at ON classes (starts_at);

-- Carte 3 cours (achetée en ligne ou vendue sur place par Laure)
CREATE TABLE cards (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  email              TEXT    NOT NULL,
  credits_total      INTEGER NOT NULL,
  credits_left       INTEGER NOT NULL,
  amount_cents       INTEGER NOT NULL,
  payment            TEXT    NOT NULL,             -- 'online' | 'on_site'
  status             TEXT    NOT NULL,             -- 'pending' | 'active' | 'expired'
  stripe_session_id  TEXT    UNIQUE,
  payment_intent     TEXT,
  created_at         TEXT    NOT NULL
);
CREATE INDEX idx_cards_email ON cards (email);

CREATE TABLE bookings (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id           INTEGER NOT NULL REFERENCES classes (id),
  name               TEXT    NOT NULL,
  email              TEXT    NOT NULL,
  phone              TEXT,
  payment            TEXT    NOT NULL,             -- 'online' | 'on_site' | 'card'
  amount_cents       INTEGER NOT NULL,             -- montant dû (0 pour une carte)
  status             TEXT    NOT NULL,             -- 'pending' | 'confirmed' | 'cancelled'
  paid               INTEGER NOT NULL DEFAULT 0,   -- payé (auto en ligne, coché par Laure sur place)
  card_id            INTEGER REFERENCES cards (id),
  token              TEXT    NOT NULL UNIQUE,      -- lien d'annulation
  stripe_session_id  TEXT    UNIQUE,
  payment_intent     TEXT,
  expires_at         TEXT,                         -- fin de réservation de la place (paiement en ligne en attente)
  created_at         TEXT    NOT NULL,
  cancelled_at       TEXT
);
CREATE INDEX idx_bookings_class ON bookings (class_id, status);
CREATE INDEX idx_bookings_email ON bookings (email);
