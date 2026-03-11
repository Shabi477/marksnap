"""
Phase 1 Migration: Add school_type, region, tier, key_stage, is_default columns.
Run once: cd backend && python migrate_phase1.py
"""
import os
from dotenv import load_dotenv
load_dotenv()

from database import engine
from sqlalchemy import text

MIGRATIONS = [
    # School: add school_type, region, tier
    "ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type VARCHAR",
    "ALTER TABLE schools ADD COLUMN IF NOT EXISTS region VARCHAR NOT NULL DEFAULT 'UK'",
    "ALTER TABLE schools ADD COLUMN IF NOT EXISTS tier VARCHAR NOT NULL DEFAULT 'free'",
    # Teacher: add tier
    "ALTER TABLE teachers ADD COLUMN IF NOT EXISTS tier VARCHAR NOT NULL DEFAULT 'free'",
    # ClassGroup: add key_stage
    "ALTER TABLE class_groups ADD COLUMN IF NOT EXISTS key_stage VARCHAR",
    # Subject: make school_id nullable + add is_default
    "ALTER TABLE subjects ALTER COLUMN school_id DROP NOT NULL",
    "ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE",
]


def run_migrations():
    with engine.connect() as conn:
        for sql in MIGRATIONS:
            try:
                conn.execute(text(sql))
                print(f"  OK: {sql[:70]}...")
            except Exception as e:
                print(f"  SKIP: {sql[:70]}... ({e})")
        conn.commit()
    print("\nPhase 1 migration complete.")


if __name__ == "__main__":
    run_migrations()
