"""
Migration: Add curriculum categorisation fields.
- topics: key_stage, strand columns
- questions: distractor_rationale column
- Update existing KS3 topics with strand/key_stage metadata
"""
import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Set DATABASE_URL environment variable")

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cur = conn.cursor()

def col_exists(table, column):
    cur.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table, column))
    return cur.fetchone() is not None

# --- topics: add key_stage, strand ---
if not col_exists("topics", "key_stage"):
    cur.execute("ALTER TABLE topics ADD COLUMN key_stage VARCHAR")
    print("Added topics.key_stage")
else:
    print("topics.key_stage already exists")

if not col_exists("topics", "strand"):
    cur.execute("ALTER TABLE topics ADD COLUMN strand VARCHAR")
    print("Added topics.strand")
else:
    print("topics.strand already exists")

# --- questions: add distractor_rationale ---
if not col_exists("questions", "distractor_rationale"):
    cur.execute("ALTER TABLE questions ADD COLUMN distractor_rationale TEXT")
    print("Added questions.distractor_rationale")
else:
    print("questions.distractor_rationale already exists")

# --- Backfill existing KS3 topics with strand metadata ---
STRAND_MAP = {
    "Number & Place Value": ("KS3", "Number"),
    "Algebra": ("KS3", "Algebra"),
    "Fractions, Decimals & Percentages": ("KS3", "Number"),
    "Ratio & Proportion": ("KS3", "Ratio, Proportion & Rates of Change"),
    "Geometry — Angles": ("KS3", "Geometry & Measures"),
    "Geometry — Area & Perimeter": ("KS3", "Geometry & Measures"),
    "Statistics & Probability": ("KS3", "Statistics & Probability"),
}
for topic_name, (ks, strand) in STRAND_MAP.items():
    cur.execute(
        "UPDATE topics SET key_stage = %s, strand = %s WHERE name = %s AND key_stage IS NULL",
        (ks, strand, topic_name)
    )
    if cur.rowcount:
        print(f"  Backfilled topic '{topic_name}' → {ks}/{strand}")

cur.close()
conn.close()
print("\nMigration complete!")
