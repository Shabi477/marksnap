"""
Migration: Add subjects, teacher_subjects, and new Test columns.
Run once: python migrate_subjects.py
"""
import os
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

engine = create_engine(DATABASE_URL)

MIGRATIONS = [
    # 1. Create subjects table
    """
    CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        school_id INTEGER NOT NULL REFERENCES schools(id),
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,

    # 2. Create teacher_subjects join table
    """
    CREATE TABLE IF NOT EXISTS teacher_subjects (
        teacher_id INTEGER NOT NULL REFERENCES teachers(id),
        subject_id INTEGER NOT NULL REFERENCES subjects(id),
        is_hod INTEGER DEFAULT 0,
        PRIMARY KEY (teacher_id, subject_id)
    )
    """,

    # 3. Add subject_id to tests
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='tests' AND column_name='subject_id') THEN
            ALTER TABLE tests ADD COLUMN subject_id INTEGER REFERENCES subjects(id);
        END IF;
    END $$
    """,

    # 4. Add test_date to tests
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='tests' AND column_name='test_date') THEN
            ALTER TABLE tests ADD COLUMN test_date TIMESTAMP;
        END IF;
    END $$
    """,

    # 5. Add test_file_path to tests
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='tests' AND column_name='test_file_path') THEN
            ALTER TABLE tests ADD COLUMN test_file_path VARCHAR;
        END IF;
    END $$
    """,
]

if __name__ == "__main__":
    with engine.connect() as conn:
        for i, sql in enumerate(MIGRATIONS, 1):
            print(f"Running migration {i}...")
            conn.execute(text(sql))
        conn.commit()
    print("All migrations completed successfully!")
