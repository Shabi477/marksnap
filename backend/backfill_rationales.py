"""
Backfill missing explanation and distractor_rationale for existing questions.
Sends each question to GPT-4o to generate the missing fields, then updates the DB.

Usage:
    cd backend
    python backfill_rationales.py [--dry-run] [--limit N]
"""
import os
import sys
import json
import argparse
import time

from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
OPENAI_KEY = os.getenv("OPEN_AI_KEY") or os.getenv("OPENAI_API_KEY")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)
if not OPENAI_KEY:
    print("ERROR: OPEN_AI_KEY not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
client = OpenAI(api_key=OPENAI_KEY)

SYSTEM_PROMPT = """You are an expert UK maths teacher. Given a multiple-choice question with its options and correct answer, provide:

1. "explanation" — a clear step-by-step explanation of how to arrive at the correct answer
2. "distractor_rationale" — for EACH option (including the correct one), explain what misconception or error would lead a student to choose it. For the correct answer, say "Correct answer" or explain why it's right.

Return ONLY valid JSON:
{
  "explanation": "step-by-step explanation...",
  "distractor_rationale": {
    "A": "reason a student picks A",
    "B": "reason a student picks B",
    "C": "reason a student picks C",
    "D": "reason a student picks D"
  }
}

No markdown, no code fences, no extra text."""


def build_prompt(q: dict) -> str:
    parts = [f"Question: {q['question_text']}", ""]
    for letter in ["A", "B", "C", "D", "E"]:
        val = q.get(f"option_{letter.lower()}")
        if val:
            parts.append(f"{letter}) {val}")
    parts.append(f"\nCorrect answer: {q['correct_answer']}")
    return "\n".join(parts)


def get_rationale(q: dict) -> dict | None:
    """Call GPT-4o to generate explanation + distractor_rationale."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_prompt(q)},
            ],
            temperature=0.2,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        return json.loads(raw)
    except Exception as e:
        print(f"  ERROR for Q{q['id']}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Backfill missing rationales")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be updated without writing")
    parser.add_argument("--limit", type=int, default=0, help="Max questions to process (0 = all)")
    args = parser.parse_args()

    with engine.connect() as conn:
        # Find questions missing explanation OR distractor_rationale
        query = text("""
            SELECT id, question_text, option_a, option_b, option_c, option_d, option_e,
                   correct_answer, explanation, distractor_rationale
            FROM questions
            WHERE explanation IS NULL OR distractor_rationale IS NULL
            ORDER BY id
        """)
        rows = conn.execute(query).mappings().all()

        total = len(rows)
        if args.limit > 0:
            rows = rows[:args.limit]

        print(f"Found {total} questions missing explanation/rationale")
        print(f"Processing {len(rows)} question{'s' if len(rows) != 1 else ''}")
        if args.dry_run:
            print("DRY RUN — no changes will be written\n")

        updated = 0
        failed = 0

        for i, row in enumerate(rows):
            q = dict(row)
            qid = q["id"]
            needs_explanation = q["explanation"] is None
            needs_rationale = q["distractor_rationale"] is None

            print(f"[{i+1}/{len(rows)}] Q{qid}: {q['question_text'][:60]}...")
            print(f"  Missing: {'explanation ' if needs_explanation else ''}{'rationale' if needs_rationale else ''}")

            if args.dry_run:
                updated += 1
                continue

            result = get_rationale(q)
            if not result:
                failed += 1
                continue

            explanation = result.get("explanation")
            distractor_rationale = result.get("distractor_rationale")

            # Build UPDATE
            sets = []
            params = {"qid": qid}
            if needs_explanation and explanation:
                sets.append("explanation = :explanation")
                params["explanation"] = explanation
            if needs_rationale and distractor_rationale:
                dr = distractor_rationale if isinstance(distractor_rationale, str) else json.dumps(distractor_rationale)
                sets.append("distractor_rationale = :dr")
                params["dr"] = dr

            if sets:
                update_sql = text(f"UPDATE questions SET {', '.join(sets)} WHERE id = :qid")
                conn.execute(update_sql, params)
                conn.commit()
                updated += 1
                print(f"  ✓ Updated")
            else:
                print(f"  — Nothing to update (AI returned empty)")

            # Rate limit: ~0.5s between calls to avoid hitting limits
            time.sleep(0.5)

        print(f"\nDone: {updated} updated, {failed} failed, {total - len(rows)} skipped (limit)")


if __name__ == "__main__":
    main()
