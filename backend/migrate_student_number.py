"""
Migration: Rename class_number to student_number (school-wide unique, 3-digit)
- Renames column class_number → student_number
- Re-numbers students to be unique within their school (not just class)
- Adds index on student_number for fast lookup
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

    columns = [col["name"] for col in inspector.get_columns("students")]

    with engine.begin() as conn:
        # Step 1: Rename column if needed
        if "class_number" in columns and "student_number" not in columns:
            print("Renaming class_number → student_number...")
            conn.execute(text(
                "ALTER TABLE students RENAME COLUMN class_number TO student_number"
            ))
        elif "student_number" not in columns:
            print("Adding student_number column...")
            conn.execute(text(
                "ALTER TABLE students ADD COLUMN student_number INTEGER"
            ))

        # Step 2: Re-number students to be unique per school
        # For students in classes with a school_id, number within the school.
        # For standalone (no school), number within the owner's classes.
        print("Re-numbering students school-wide...")
        conn.execute(text("""
            UPDATE students SET student_number = sub.rn
            FROM (
                SELECT s.id,
                       ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(cg.school_id, cg.owner_id * -1)
                           ORDER BY s.id
                       ) AS rn
                FROM students s
                JOIN class_groups cg ON s.class_id = cg.id
            ) sub
            WHERE students.id = sub.id
        """))

        # Step 3: Add index if not exists
        indexes = inspector.get_indexes("students")
        idx_names = [idx["name"] for idx in indexes]
        if "ix_students_student_number" not in idx_names:
            print("Adding index on student_number...")
            conn.execute(text(
                "CREATE INDEX ix_students_student_number ON students (student_number)"
            ))

        print("Done — student_number column ready (school-wide unique)")


if __name__ == "__main__":
    run_migration()
