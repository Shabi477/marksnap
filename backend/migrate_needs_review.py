"""Add needs_review column to scan_results table."""
from database import engine
from sqlalchemy import text, inspect

def migrate():
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("scan_results")]
    if "needs_review" in columns:
        print("needs_review column already exists")
        return

    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE scan_results ADD COLUMN needs_review BOOLEAN DEFAULT FALSE"
        ))
        conn.commit()
        print("Added needs_review column to scan_results")

if __name__ == "__main__":
    migrate()
