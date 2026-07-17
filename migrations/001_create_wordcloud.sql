CREATE TABLE
    IF NOT EXISTS words (
        name TEXT NOT NULL,
        word TEXT NOT NULL,
        submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (name, word) ON CONFLICT REPLACE
    ) STRICT;