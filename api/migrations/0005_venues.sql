-- Lieux des cours collectifs (gérés par Laure dans l'admin, affichés sur la page Planning).
CREATE TABLE venues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,              -- « Maison Né »
  address     TEXT    NOT NULL,              -- « 25 rue Beccaria, 75012 Paris »
  info        TEXT    NOT NULL DEFAULT '',   -- accès, ambiance… (« Près de la place d'Aligre… »)
  maps_url    TEXT    NOT NULL DEFAULT '',   -- lien Google Maps (vide = recherche sur l'adresse)
  position    INTEGER NOT NULL DEFAULT 0,    -- ordre d'affichage
  photo_at    TEXT,                          -- date de la photo (sert aussi de version pour le cache), NULL = pas de photo
  created_at  TEXT    NOT NULL
);

-- Photo d'ambiance du lieu, à part pour garder la liste des lieux légère (redimensionnée par l'admin, < 1,5 Mo).
CREATE TABLE venue_photos (
  venue_id  INTEGER PRIMARY KEY REFERENCES venues (id) ON DELETE CASCADE,
  type      TEXT NOT NULL,                   -- image/jpeg | image/webp | image/png
  data      BLOB NOT NULL
);

INSERT INTO venues (name, address, info, maps_url, position, created_at) VALUES (
  'Maison Né',
  '25 rue Beccaria, 75012 Paris',
  'Près de la place d''Aligre, à 5 minutes à pied de Gare de Lyon.',
  'https://www.google.com/maps/search/?api=1&query=25+rue+Beccaria+75012+Paris',
  0,
  '2026-11-25T00:00:00.000Z'
);
