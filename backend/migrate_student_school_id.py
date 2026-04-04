"""
Migration: Add school_id column to students table and backfill from class_group.
This makes student-school lookup direct (no need to join through class).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # 1. Add school_id column if it doesn't exist
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'students' AND column_name = 'school_id'
        """))
        if result.fetchone() is None:
            print("Adding school_id column to students...")
            conn.execute(text("""
                ALTER TABLE students
                ADD COLUMN school_id INTEGER REFERENCES schools(id)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_students_school_id ON students(school_id)
            """))
            conn.commit()
            print("Column added.")
        else:
            print("school_id column already exists.")

        # 2. Backfill school_id from class_group
        result = conn.execute(text("""
            UPDATE students SET school_id = cg.school_id
            FROM class_groups cg
            WHERE students.class_id = cg.id
            AND students.school_id IS NULL
            AND cg.school_id IS NOT NULL
        """))
        conn.commit()
        print(f"Backfilled school_id for {result.rowcount} students.")

        # 3. Add composite index for school + student_number lookups
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_students_school_number
            ON students(school_id, student_number)
        """))
        conn.commit()
        print("Composite index on (school_id, student_number) created.")

    print("Migration complete!")

if __name__ == "__main__":
    migrate()
