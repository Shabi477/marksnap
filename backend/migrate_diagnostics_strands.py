"""
Migration: Rename Intervention Diagnostics strands to category-prefixed format
(Numeracy: / Literacy: / Other:) and update topic names for merged entries.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

STRAND_RENAMES = {
    "Numeracy Foundations":               "Numeracy: Foundations",
    "Arithmetic Fluency":                 "Numeracy: Arithmetic Fluency",
    "Fractions & Proportional Reasoning": "Numeracy: Fractions & Proportional Reasoning",
    "Spatial & Geometric Reasoning":      "Numeracy: Spatial & Geometric Reasoning",
    "Data Handling & Reasoning":          "Numeracy: Data Handling",
    "Mathematical Language & Reasoning":  "Numeracy: Mathematical Language",
    "Cognitive & Processing Skills":      "Other: Cognitive & Processing Skills",
    "Algebraic Readiness":                "Numeracy: Algebraic Readiness",
    "Diagnostic Baselines":               "Numeracy: Diagnostic Baselines",
}

# Topics that are being replaced by new versions (will be removed)
TOPICS_TO_REMOVE = [
    "Working memory: number recall tasks",
    "Processing speed: rapid number identification",
    "Visual discrimination: shapes and symbols",
    "Sequencing and logical ordering",
    "KS2 readiness check",
    "KS3 readiness check",
    "GCSE Foundation gap analysis",
]


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get the Intervention Diagnostics subject ID
    cur.execute("SELECT id FROM subjects WHERE name = 'Intervention Diagnostics' AND is_default = true")
    row = cur.fetchone()
    if not row:
        print("Intervention Diagnostics subject not found — nothing to migrate.")
        conn.close()
        return

    subject_id = row[0]
    print(f"Intervention Diagnostics subject_id = {subject_id}")

    # Rename strands
    for old_strand, new_strand in STRAND_RENAMES.items():
        cur.execute(
            "UPDATE topics SET strand = %s WHERE subject_id = %s AND strand = %s",
            (new_strand, subject_id, old_strand)
        )
        if cur.rowcount > 0:
            print(f"  Renamed strand: '{old_strand}' → '{new_strand}' ({cur.rowcount} topics)")

    # Remove old topics that are being replaced by new versions
    for name in TOPICS_TO_REMOVE:
        cur.execute(
            "DELETE FROM topics WHERE subject_id = %s AND name = %s",
            (subject_id, name)
        )
        if cur.rowcount > 0:
            print(f"  Removed old topic: '{name}'")

    conn.commit()
    cur.close()
    conn.close()
    print("\nStrand migration complete!")


if __name__ == "__main__":
    main()
