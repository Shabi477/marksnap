"""
Migration: Add skill_type column to questions + normalise maths strand names.

1. ALTER TABLE questions ADD COLUMN skill_type VARCHAR (nullable)
2. Rename maths topic strands:
   - "Ratio & Proportion" → "Ratio and Proportion"
   - "Ratio, Proportion & Rates of Change" → "Ratio and Proportion"
   - "Geometry & Measures" → "Geometry"
   - "Statistics & Probability" → split into "Statistics" / "Probability"
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from sqlalchemy import text

# --- Strand renames (simple 1-to-1) ---
STRAND_RENAMES = {
    "Ratio & Proportion": "Ratio and Proportion",
    "Ratio, Proportion & Rates of Change": "Ratio and Proportion",
    "Geometry & Measures": "Geometry",
}

# --- Topics that need "Statistics & Probability" split into "Probability" ---
PROBABILITY_TOPICS = [
    "Probability scales and basic probability",
    "Sample space diagrams and listing outcomes",
    "Relative frequency and experimental probability",
    "Probability: single events",
    "Probability: combined events (AND/OR rules)",
    "Tree diagrams",
    "Venn diagrams and set notation",
    "Conditional probability",
    "Relative frequency and expected outcomes",
]

db = SessionLocal()

try:
    # 1. Add skill_type column if not exists
    result = db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'questions' AND column_name = 'skill_type'"
    ))
    if not result.fetchone():
        db.execute(text("ALTER TABLE questions ADD COLUMN skill_type VARCHAR"))
        db.commit()
        print("Added skill_type column to questions table")
    else:
        print("skill_type column already exists — skipping")

    # 2. Get Maths subject ID
    row = db.execute(text(
        "SELECT id FROM subjects WHERE name = 'Maths' AND is_default = true"
    )).fetchone()
    if not row:
        print("Maths subject not found — skipping strand renames")
        sys.exit(0)
    maths_id = row[0]
    print(f"Maths subject_id = {maths_id}")

    # 3. Simple strand renames
    for old_strand, new_strand in STRAND_RENAMES.items():
        result = db.execute(text(
            "UPDATE topics SET strand = :new WHERE strand = :old AND subject_id = :sid"
        ), {"new": new_strand, "old": old_strand, "sid": maths_id})
        count = result.rowcount
        if count:
            print(f"  Renamed '{old_strand}' → '{new_strand}' ({count} topics)")

    # 4. Split "Statistics & Probability" → "Probability" for probability topics
    for topic_name in PROBABILITY_TOPICS:
        result = db.execute(text(
            "UPDATE topics SET strand = 'Probability' "
            "WHERE name = :name AND subject_id = :sid AND strand = 'Statistics & Probability'"
        ), {"name": topic_name, "sid": maths_id})
        if result.rowcount:
            print(f"  '{topic_name}' → Probability")

    # 5. Remaining "Statistics & Probability" topics → "Statistics"
    result = db.execute(text(
        "UPDATE topics SET strand = 'Statistics' "
        "WHERE strand = 'Statistics & Probability' AND subject_id = :sid"
    ), {"sid": maths_id})
    if result.rowcount:
        print(f"  Remaining Statistics & Probability → Statistics ({result.rowcount} topics)")

    db.commit()
    print("\nMigration complete!")

except Exception as e:
    db.rollback()
    print(f"Error: {e}")
    raise
finally:
    db.close()
