"""
Migration: Create objectives table, add objective_id to questions, seed KS3/KS4 objectives.
"""
import os
import sys
import json
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

from database import engine, SessionLocal
from sqlalchemy import text


def migrate():
    with engine.connect() as conn:
        # 1. Create objectives table if it doesn't exist
        result = conn.execute(text("""
            SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'objectives')
        """))
        if not result.scalar():
            print("Creating objectives table...")
            conn.execute(text("""
                CREATE TABLE objectives (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    description TEXT,
                    topic_id INTEGER NOT NULL REFERENCES topics(id),
                    order_index INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_objectives_topic_id ON objectives(topic_id)"))
            conn.commit()
            print("objectives table created.")
        else:
            print("objectives table already exists.")

        # 2. Add objective_id column to questions if it doesn't exist
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'questions' AND column_name = 'objective_id'
        """))
        if result.fetchone() is None:
            print("Adding objective_id column to questions...")
            conn.execute(text("""
                ALTER TABLE questions
                ADD COLUMN objective_id INTEGER REFERENCES objectives(id)
            """))
            conn.execute(text("CREATE INDEX ix_questions_objective_id ON questions(objective_id)"))
            conn.commit()
            print("Column added.")
        else:
            print("objective_id column already exists.")

    print("Schema migration complete!")


def seed_objectives():
    """Seed KS3/KS4 objectives from JSON."""
    seed_path = os.path.join(os.path.dirname(__file__), "seed_data", "maths_objectives.json")
    if not os.path.exists(seed_path):
        print(f"Seed file not found: {seed_path}")
        return

    with open(seed_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        # Get Maths subject
        result = db.execute(text("SELECT id FROM subjects WHERE name = 'Maths' LIMIT 1"))
        row = result.fetchone()
        if not row:
            print("Maths subject not found — skipping seed.")
            return
        subject_id = row[0]

        total_created = 0
        total_skipped = 0

        for entry in data["objectives"]:
            topic_name = entry["topic"]
            key_stage = entry["key_stage"]

            # Find the topic
            result = db.execute(text(
                "SELECT id FROM topics WHERE name = :name AND key_stage = :ks AND subject_id = :sid LIMIT 1"
            ), {"name": topic_name, "ks": key_stage, "sid": subject_id})
            topic_row = result.fetchone()
            if not topic_row:
                print(f"  Topic not found: '{topic_name}' ({key_stage}) — skipping")
                total_skipped += len(entry["objectives"])
                continue

            topic_id = topic_row[0]

            for idx, obj_name in enumerate(entry["objectives"]):
                # Check if objective already exists
                result = db.execute(text(
                    "SELECT id FROM objectives WHERE name = :name AND topic_id = :tid LIMIT 1"
                ), {"name": obj_name, "tid": topic_id})
                if result.fetchone():
                    total_skipped += 1
                    continue

                db.execute(text(
                    "INSERT INTO objectives (name, topic_id, order_index) VALUES (:name, :tid, :idx)"
                ), {"name": obj_name, "tid": topic_id, "idx": idx + 1})
                total_created += 1

        db.commit()
        print(f"Seeded {total_created} objectives ({total_skipped} already existed).")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
    seed_objectives()
