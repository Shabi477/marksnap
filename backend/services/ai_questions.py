"""
AI-powered batch question generation using OpenAI.
Generates MCQs with distractors, explanations, and distractor rationale.
"""
import os
import json
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPEN_AI_KEY"))

SYSTEM_PROMPT = """You are an expert UK teacher creating multiple-choice questions for students.
You specialise in creating questions for mainstream maths, SEND intervention diagnostics, literacy, and other subjects.
You must generate high-quality questions with plausible distractors (wrong answers) that reflect common student misconceptions.

RULES:
- Each question must have exactly the requested number of options (default 4: A–D)
- Distractors must be based on real student errors (e.g. sign errors, order-of-operations mistakes, forgetting to carry, reading comprehension errors)
- The correct answer position should be varied across questions (don't always make A correct)
- Questions should be age-appropriate for the specified key stage and year group
- Difficulty should match the requested level: easy (recall/fluency), medium (application), hard (reasoning/problem-solving)
- Question text should be clear, unambiguous, and self-contained
- For SEND / intervention topics, use simple, accessible language appropriate for students who may have learning difficulties
- For each distractor, explain what misconception it targets
- ALWAYS return a JSON object with a "questions" key containing an ARRAY of question objects, even if only generating 1 question

Return ONLY valid JSON — no markdown, no code fences, no extra text.
The response MUST be: {"questions": [...]}"""

def build_user_prompt(
    topic_name: str,
    subject_name: str,
    count: int,
    difficulty: str,
    key_stage: str,
    year_group: str | None,
    num_options: int,
    skill_type: str | None,
    strand: str | None,
) -> str:
    parts = [
        f"Generate {count} multiple-choice questions for:",
        f"- Subject: {subject_name}",
        f"- Topic: {topic_name}",
        f"- Key Stage: {key_stage}",
        f"- Difficulty: {difficulty}",
        f"- Number of options per question: {num_options}",
    ]
    if year_group:
        parts.append(f"- Year Group: {year_group}")
    if skill_type:
        parts.append(f"- Skill Type: {skill_type}")
    if strand:
        parts.append(f"- Strand/Area: {strand}")

    option_letters = ["A", "B", "C", "D", "E"][:num_options]
    option_fields = ", ".join(f'"option_{l.lower()}": "..."' for l in option_letters)

    distractor_letters = [l for l in option_letters]
    distractor_fields = ", ".join(f'"{l}": "explanation of why a student might pick this"' for l in distractor_letters)

    parts.append(f"""
Return a JSON array of {count} objects. Each object must have:
{{
  "question_text": "the question stem",
  {option_fields},
  "correct_answer": "one of {'/'.join(option_letters)}",
  "explanation": "step-by-step explanation of the correct answer",
  "distractor_rationale": {{ {distractor_fields} }},
  "skill_type": "fluency|reasoning|problem_solving"
}}

Vary the correct answer position across questions. Make distractors realistic.""")

    return "\n".join(parts)


def generate_questions(
    topic_name: str,
    subject_name: str,
    count: int = 5,
    difficulty: str = "medium",
    key_stage: str = "KS3",
    year_group: str | None = None,
    num_options: int = 4,
    skill_type: str | None = None,
    strand: str | None = None,
) -> list[dict]:
    """Call OpenAI to generate batch MCQs. Returns list of question dicts."""

    user_prompt = build_user_prompt(
        topic_name=topic_name,
        subject_name=subject_name,
        count=count,
        difficulty=difficulty,
        key_stage=key_stage,
        year_group=year_group,
        num_options=num_options,
        skill_type=skill_type,
        strand=strand,
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content.strip()
    parsed = json.loads(raw)

    # Handle: [...], {"questions": [...]}, or single question {...}
    if isinstance(parsed, list):
        questions = parsed
    elif isinstance(parsed, dict):
        # Try common wrapper key names
        questions = None
        for key in ("questions", "data", "items"):
            if key in parsed and isinstance(parsed[key], list):
                questions = parsed[key]
                break
        if questions is None:
            # Check if any value is a list of dicts
            for v in parsed.values():
                if isinstance(v, list):
                    questions = v
                    break
        if questions is None:
            # Single question object returned — wrap in a list
            if "question_text" in parsed:
                questions = [parsed]
            else:
                raise ValueError(f"Unexpected AI response structure: {list(parsed.keys())}")
    else:
        questions = [parsed]

    # Validate and normalise each question
    validated = []
    for q in questions:
        # Handle case where items are JSON strings instead of dicts
        if isinstance(q, str):
            q = json.loads(q)
        # Ensure distractor_rationale is a JSON string
        dr = q.get("distractor_rationale")
        if isinstance(dr, dict):
            dr = json.dumps(dr)

        validated.append({
            "question_text": q["question_text"],
            "option_a": q["option_a"],
            "option_b": q["option_b"],
            "option_c": q.get("option_c"),
            "option_d": q.get("option_d"),
            "option_e": q.get("option_e"),
            "correct_answer": q["correct_answer"].upper(),
            "explanation": q.get("explanation"),
            "distractor_rationale": dr,
            "skill_type": q.get("skill_type"),
        })

    return validated
