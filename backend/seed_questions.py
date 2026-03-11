"""
Seed system questions from JSON files in seed_data/ directory.
Idempotent: skips questions that already exist (based on question_text hash).
"""
import os
import sys
import json
import hashlib

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Subject, Topic, Question


def hash_question(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()[:32]


def seed_from_file(db, filepath: str):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    subject_name = data["subject"]
    subject = db.query(Subject).filter(Subject.name == subject_name, Subject.is_default == True).first()
    if not subject:
        print(f"  Subject '{subject_name}' not found — skipping {filepath}")
        return

    total_added = 0
    total_skipped = 0

    for topic_data in data["topics"]:
        topic_name = topic_data["name"]
        topic = db.query(Topic).filter(
            Topic.name == topic_name, Topic.subject_id == subject.id
        ).first()

        if not topic:
            topic = Topic(
                name=topic_name,
                subject_id=subject.id,
                order_index=topic_data.get("order_index", 0),
            )
            db.add(topic)
            db.flush()
            print(f"  Created topic: {topic_name}")

        for q_data in topic_data["questions"]:
            # Check if question already exists (by text hash)
            q_hash = hash_question(q_data["question_text"])
            existing = db.query(Question).filter(
                Question.question_text == q_data["question_text"],
                Question.topic_id == topic.id,
            ).first()

            if existing:
                total_skipped += 1
                continue

            q = Question(
                topic_id=topic.id,
                subject_id=subject.id,
                question_text=q_data["question_text"],
                option_a=q_data["option_a"],
                option_b=q_data["option_b"],
                option_c=q_data.get("option_c"),
                option_d=q_data.get("option_d"),
                option_e=q_data.get("option_e"),
                num_options=sum(1 for k in ["option_a", "option_b", "option_c", "option_d", "option_e"] if q_data.get(k)),
                correct_answer=q_data["correct_answer"].upper(),
                difficulty=q_data.get("difficulty", "medium"),
                source="system",
                school_id=None,
                created_by=None,
                explanation=q_data.get("explanation"),
                year_group=q_data.get("year_group"),
                key_stage=q_data.get("key_stage"),
                is_active=True,
                status="approved",
            )
            db.add(q)
            total_added += 1

    db.commit()
    print(f"  {filepath}: {total_added} added, {total_skipped} skipped (already exist)")


def run_seed():
    seed_dir = os.path.join(os.path.dirname(__file__), "seed_data")
    if not os.path.exists(seed_dir):
        print("No seed_data directory found.")
        return

    db = SessionLocal()
    try:
        json_files = sorted(f for f in os.listdir(seed_dir) if f.endswith(".json"))
        print(f"Found {len(json_files)} seed file(s)")

        for filename in json_files:
            filepath = os.path.join(seed_dir, filename)
            print(f"\nSeeding: {filename}")
            seed_from_file(db, filepath)

        print("\nSeeding complete!")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
