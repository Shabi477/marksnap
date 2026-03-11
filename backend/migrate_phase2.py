"""
Phase 2 Migration: Question Bank
- Create topics table
- Create questions table
- Create test_questions table
- Add is_bank_test column to tests table
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text, inspect

def run_migration():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    with engine.begin() as conn:
        # 1. Create topics table
        if "topics" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE topics (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    subject_id INTEGER NOT NULL REFERENCES subjects(id),
                    order_index INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX ix_topics_id ON topics(id)"))
            conn.execute(text("CREATE INDEX ix_topics_subject_id ON topics(subject_id)"))
            print("Created topics table")
        else:
            print("topics table already exists")

        # 2. Create questions table
        if "questions" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE questions (
                    id SERIAL PRIMARY KEY,
                    topic_id INTEGER NOT NULL REFERENCES topics(id),
                    subject_id INTEGER NOT NULL REFERENCES subjects(id),
                    question_text TEXT NOT NULL,
                    option_a VARCHAR NOT NULL,
                    option_b VARCHAR NOT NULL,
                    option_c VARCHAR,
                    option_d VARCHAR,
                    option_e VARCHAR,
                    num_options INTEGER NOT NULL DEFAULT 4,
                    correct_answer VARCHAR NOT NULL,
                    difficulty VARCHAR NOT NULL DEFAULT 'medium',
                    source VARCHAR NOT NULL DEFAULT 'system',
                    school_id INTEGER REFERENCES schools(id),
                    created_by INTEGER REFERENCES teachers(id),
                    image_url VARCHAR,
                    explanation TEXT,
                    year_group VARCHAR,
                    key_stage VARCHAR,
                    is_active BOOLEAN DEFAULT TRUE,
                    status VARCHAR NOT NULL DEFAULT 'approved',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX ix_questions_id ON questions(id)"))
            conn.execute(text("CREATE INDEX ix_questions_subject_id ON questions(subject_id)"))
            conn.execute(text("CREATE INDEX ix_questions_topic_id ON questions(topic_id)"))
            conn.execute(text("CREATE INDEX ix_questions_difficulty ON questions(difficulty)"))
            conn.execute(text("CREATE INDEX ix_questions_source ON questions(source)"))
            conn.execute(text("CREATE INDEX ix_questions_key_stage ON questions(key_stage)"))
            print("Created questions table")
        else:
            print("questions table already exists")

        # 3. Create test_questions table
        if "test_questions" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE test_questions (
                    id SERIAL PRIMARY KEY,
                    test_id INTEGER NOT NULL REFERENCES tests(id),
                    question_id INTEGER NOT NULL REFERENCES questions(id),
                    section_name VARCHAR NOT NULL DEFAULT 'A',
                    question_number INTEGER NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX ix_test_questions_id ON test_questions(id)"))
            conn.execute(text("CREATE INDEX ix_test_questions_test_id ON test_questions(test_id)"))
            conn.execute(text("CREATE UNIQUE INDEX uq_test_questions ON test_questions(test_id, question_number, section_name)"))
            print("Created test_questions table")
        else:
            print("test_questions table already exists")

        # 4. Add is_bank_test to tests table
        existing_cols = [c["name"] for c in inspector.get_columns("tests")]
        if "is_bank_test" not in existing_cols:
            conn.execute(text("ALTER TABLE tests ADD COLUMN is_bank_test BOOLEAN DEFAULT FALSE"))
            print("Added is_bank_test column to tests")
        else:
            print("is_bank_test column already exists")

    print("\nPhase 2 migration complete!")


if __name__ == "__main__":
    run_migration()
