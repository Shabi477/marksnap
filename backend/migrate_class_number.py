"""
Migration: Add class_number to students table
- Adds class_number column (nullable integer) for QuickKey-style student identification
- Backfills existing students with sequential numbers within each class
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text, inspect


def run_migration():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    if "students" not in existing_tables:
        print("Students table does not exist — skipping migration")
        return

    # Check if column already exists
    columns = [col["name"] for col in inspector.get_columns("students")]

    with engine.begin() as conn:
        if "class_number" not in columns:
            print("Adding class_number column to students...")
            conn.execute(text(
                "ALTER TABLE students ADD COLUMN class_number INTEGER"
            ))

            # Backfill: assign sequential numbers within each class
            print("Backfilling class_number for existing students...")
            conn.execute(text("""
                UPDATE students SET class_number = sub.rn
                FROM (
                    SELECT id, ROW_NUMBER() OVER (PARTITION BY class_id ORDER BY id) AS rn
                    FROM students
                ) sub
                WHERE students.id = sub.id
            """))
            print("Done — class_number column added and backfilled")
        else:
            print("class_number column already exists — skipping")


if __name__ == "__main__":
    run_migration()
