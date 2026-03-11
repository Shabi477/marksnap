# MarkSnap — Premade Question Bank Architecture

> **Status:** Draft — for discussion  
> **Date:** 2026-03-11  
> **Scope:** Add a premade multiple choice question bank per subject, enabling teachers to build tests from pre-authored questions rather than only uploading answer keys.

---

## 1. Problem Statement

Today MarkSnap handles **test structure and answer keys only**:
- Teachers define sections (number of questions, number of options)
- Teachers enter the correct answer letter (A–E) per question
- Question text lives only on the printed paper — the system never sees it

This means:
- Every test is created from scratch
- No question reuse across tests
- No item-level analytics ("which questions are students getting wrong?")
- No ability to auto-generate tests from a curated pool

### Goal
Introduce a **Question Bank** per subject so teachers can:
1. Browse/search premade questions
2. Pick questions to assemble a test (or auto-generate one)
3. Get the answer key set automatically
4. Still print physical answer sheets and scan them as today

---

## 2. Key Concepts

| Term | Definition |
|------|-----------|
| **Question** | A single MCQ: stem (question text), options (A–E with text), correct answer, metadata |
| **Question Bank** | The pool of all questions for a given subject, organised by topic |
| **Topic** | A grouping/tag within a subject (e.g. Maths → "Algebra", "Geometry") |
| **Difficulty** | Per-question rating: Easy / Medium / Hard |
| **Source** | Who authored: `system` (premade/curated), `school` (HOD/admin created), `teacher` (personal) |
| **Test Generation** | Creating a new Test by selecting questions from the bank |

---

## 3. Data Model

### 3.1 New Models

```
┌─────────────────────────────────────────────────────────┐
│  Subject (existing)                                     │
│  id, name, school_id                                    │
└──────────┬──────────────────────────────────────────────┘
           │ 1:many
           ▼
┌─────────────────────────────────────────────────────────┐
│  Topic                                                  │
│  id, name, subject_id (FK), order_index                 │
│  e.g. "Algebra", "Geometry", "Number & Place Value"     │
└──────────┬──────────────────────────────────────────────┘
           │ 1:many
           ▼
┌─────────────────────────────────────────────────────────┐
│  Question                                               │
│  id                                                     │
│  topic_id (FK → Topic)                                  │
│  subject_id (FK → Subject) — denormalised for queries   │
│  question_text: str                                     │
│  option_a: str                                          │
│  option_b: str                                          │
│  option_c: str | None                                   │
│  option_d: str | None                                   │
│  option_e: str | None                                   │
│  num_options: int (2–5, default 4)                      │
│  correct_answer: str  ("A"–"E")                         │
│  difficulty: str  ("easy" / "medium" / "hard")          │
│  source: str  ("system" / "school" / "teacher")         │
│  school_id: int | None  (NULL = system-wide)            │
│  created_by: int | None (FK → Teacher)                  │
│  image_url: str | None  (optional diagram/figure)       │
│  explanation: str | None (optional worked solution)      │
│  year_group: str | None (e.g. "Year 7", "Grade 10")     │
│  is_active: bool (default True — soft delete)           │
│  created_at, updated_at                                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  TestQuestion (join table: Test ↔ Question)             │
│  id                                                     │
│  test_id (FK → Test)                                    │
│  question_id (FK → Question)                            │
│  section_name: str (e.g. "A")                           │
│  question_number: int (position in test)                │
│  — unique(test_id, question_number, section_name)       │
│  — the answer key is derived from Question.correct_answer│
└─────────────────────────────────────────────────────────┘
```

### 3.2 Changes to Existing Models

| Model | Change | Reason |
|-------|--------|--------|
| **Test** | Add `is_bank_test: bool` (default False) | Distinguishes bank-generated tests from manual ones |
| **AnswerKey** | No schema change | For bank tests, auto-populated from TestQuestion → Question.correct_answer |
| **TestSection** | No schema change | Sections still define structure for the printed sheet |

### 3.3 Relationship Diagram

```
School ──1:many──▶ Subject ──1:many──▶ Topic ──1:many──▶ Question
                                                            │
                                                            │ many:many
                                                            ▼
                                                     TestQuestion ◀── Test
```

---

## 4. Visibility & Access Control

Questions have three source levels. Visibility rules:

| Source | Created by | Visible to |
|--------|-----------|-----------|
| `system` | Platform admins (seeded data) | All teachers, all schools |
| `school` | HOD or school_admin | All teachers in that school |
| `teacher` | Individual teacher | Only that teacher (+ HOD/admin in their school) |

### Query Logic (pseudocode)
```python
def get_visible_questions(teacher, subject_id):
    return Question.filter(
        subject_id == subject_id,
        is_active == True,
        OR(
            source == "system",                              # everyone sees system questions
            AND(source == "school", school_id == teacher.school_id),  # school pool
            AND(source == "teacher", created_by == teacher.id),       # own questions
        )
    )
```

---

## 5. API Design

### 5.1 Topics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subjects/{id}/topics` | List topics for a subject |
| POST | `/api/subjects/{id}/topics` | Create topic (HOD/admin or topic creator) |
| PUT | `/api/topics/{id}` | Rename / reorder |
| DELETE | `/api/topics/{id}` | Soft-delete (only if no questions or all questions moved) |

### 5.2 Questions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/questions?subject_id=&topic_id=&difficulty=&search=` | Browse/search question bank (filtered, paginated) |
| GET | `/api/questions/{id}` | Single question detail |
| POST | `/api/questions` | Create question |
| PUT | `/api/questions/{id}` | Edit question (only by creator, HOD, or admin) |
| DELETE | `/api/questions/{id}` | Soft-delete (set is_active=False) |
| POST | `/api/questions/bulk` | Bulk import (JSON array or CSV) |

### 5.3 Test Generation from Bank

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tests/generate` | Generate test from question selection |

**Request body:**
```json
{
  "name": "Year 8 Algebra Quiz",
  "subject_id": 3,
  "sections": [
    {
      "section_name": "A",
      "question_ids": [12, 45, 78, 23, 56]
    }
  ]
}
```

**What the endpoint does:**
1. Creates a `Test` with `is_bank_test = True`
2. Creates `TestSection` entries (num_questions derived from question_ids length)
3. Creates `TestQuestion` join records (preserving order)
4. Auto-creates `AnswerKey` entries from each Question's `correct_answer`
5. Returns the new test (ready for sheet generation + scanning)

### 5.4 Auto-Generate (Random Selection)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tests/auto-generate` | Auto-pick questions by criteria |

**Request body:**
```json
{
  "name": "Mixed Geometry Test",
  "subject_id": 3,
  "sections": [
    {
      "section_name": "A",
      "topic_ids": [5, 8],
      "count": 20,
      "difficulty_mix": { "easy": 5, "medium": 10, "hard": 5 }
    }
  ]
}
```

Random selection from matching pool, avoiding duplicates.

---

## 6. Frontend Pages

### 6.1 Question Bank Browser (`/questions/:subjectId`)
- Topic sidebar (collapsible tree)
- Question list with search, difficulty filter, topic filter
- Inline preview: stem + options + correct answer highlighted
- "Add to Test" button per question (shopping cart pattern)
- Bulk select

### 6.2 Question Editor (`/questions/new`, `/questions/:id/edit`)
- Form: question text, options A–E (with toggle for 3/4/5 options), correct answer radio, difficulty dropdown, topic dropdown, year group
- Optional image upload
- Optional explanation / worked solution
- Preview panel showing how question will appear

### 6.3 Test Builder (`/tests/build`)
- Two-panel layout:
  - Left: question bank browser (filtered)
  - Right: test assembly (drag to reorder, grouped by section)
- Running count: "15 / 20 questions selected"
- "Auto-fill" button: fills remaining slots by criteria
- "Create Test" → calls `/api/tests/generate`
- After creation → redirects to test detail (print sheets, etc.)

### 6.4 Question Import
- Upload CSV/Excel with columns: question_text, option_a, option_b, option_c, option_d, correct_answer, topic, difficulty
- Preview table before confirming import
- Validation errors shown inline

---

## 7. Printed Test Paper Generation (Future Enhancement)

Once questions have text content, MarkSnap can **generate the actual test paper PDF** (not just the answer sheet):

```
┌─────────────────────────────────────┐
│  Online Maths Academy              │
│  Year 8 Algebra Quiz               │
│  Name: ____________  Date: ______  │
│─────────────────────────────────────│
│  1. What is 3x + 5 when x = 2?    │
│     A) 8   B) 11   C) 10   D) 9   │
│                                     │
│  2. Simplify: 4a + 3a - 2a         │
│     A) 5a  B) 9a   C) 5   D) a    │
│  ...                                │
└─────────────────────────────────────┘
```

This is a natural next step but **not required for v1** — teachers can still create their own paper and just use the bank for answer key + analytics.

---

## 8. Analytics Unlocked

With questions stored in the database, new analytics become possible:

| Metric | Description |
|--------|-------------|
| **Question difficulty (empirical)** | % of students getting it right across all tests that used it |
| **Discrimination index** | Does the question distinguish strong from weak students? |
| **Topic mastery** | Per-student or per-class breakdown by topic |
| **Weak areas** | "Your class struggles with Fractions — 42% average" |
| **Question usage** | How many times a question has been used (avoid overuse) |

These can feed into a dashboard but are **phase 2** work.

---

## 9. System Questions — Seeding Strategy

For the `source = "system"` premade questions:

### Options (to discuss)
1. **Seed script** — JSON/CSV files checked into the repo, run via `python seed_questions.py`
2. **Admin panel** — A super-admin UI to manage system questions (heavier build)
3. **Import from existing question banks** — If OMA already has question databases, write a one-time importer

### Recommended: Seed script (v1)
- Store questions as JSON files in `backend/seed_data/maths_year7.json`, etc.
- Script reads JSON, creates Subject/Topic/Question records
- Idempotent (skip if question already exists, based on hash of question_text)
- Can be re-run when new questions are added

```
backend/
  seed_data/
    maths/
      year7_number.json
      year7_algebra.json
      year8_geometry.json
    science/
      year7_biology.json
```

### JSON format per file:
```json
{
  "subject": "Mathematics",
  "topic": "Algebra",
  "year_group": "Year 7",
  "questions": [
    {
      "question_text": "What is the value of 2x + 3 when x = 4?",
      "option_a": "8",
      "option_b": "11",
      "option_c": "10",
      "option_d": "14",
      "correct_answer": "B",
      "difficulty": "easy",
      "explanation": "2(4) + 3 = 8 + 3 = 11"
    }
  ]
}
```

---

## 10. Migration Plan

### Phase 1 — Core (build first)
1. Create `Topic` and `Question` models + migration
2. Create `TestQuestion` join model + migration
3. Add `is_bank_test` to `Test` model
4. Build question CRUD API (topics + questions)
5. Build question bank browser page (frontend)
6. Build question editor page (frontend)

### Phase 2 — Test Generation
7. Build `/api/tests/generate` endpoint
8. Build `/api/tests/auto-generate` endpoint
9. Build test builder page (two-panel UI)
10. Seed initial system questions for key subjects

### Phase 3 — Analytics & Paper Generation
11. Question-level analytics (difficulty, discrimination)
12. Topic mastery reports per class/student
13. Test paper PDF generation from question content
14. Question import from CSV/Excel

---

## 11. Open Questions

These need decisions before implementation:

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Should questions support images/diagrams?** | (a) Text-only for v1, add images later (b) Support images from the start | **(a)** — simpler; add `image_url` column now but don't build upload UI yet |
| 2 | **Should teachers see each other's `teacher`-source questions?** | (a) Private only (b) Opt-in sharing | **(a)** — keep it simple; HOD/admin can see all |
| 3 | **How to handle question edits after use in a test?** | (a) Immutable once used — edit creates a copy (b) Edit in place, tests reference the version at creation time | **(a)** — safer; prevents changing history |
| 4 | **Do topics come pre-defined per subject or can teachers create them?** | (a) System topics only (b) Teachers can add topics | **(b)** — more flexible; system seeds the common ones |
| 5 | **Should the system enforce "no duplicate questions"?** | (a) Allow duplicates (b) Warn on similar text | **(a)** for v1 — duplicate detection is complex |
| 6 | **Which subjects to seed first?** | Depends on OMA's curriculum focus | Maths first (OMA's core), then expand |
| 7 | **Should auto-generate exclude recently used questions?** | (a) No filter (b) Exclude questions used in last N tests | **(b)** — prevents students seeing the same question repeatedly |
| 8 | **LaTeX / math notation in question text?** | (a) Plain text only (b) Support LaTeX rendering | To discuss — Maths questions often need notation like fractions, exponents |
| 9 | **Per-question marks/weighting?** | (a) All questions worth 1 mark (b) Variable marks | **(a)** for v1 — MCQ tests typically equal-weighted |
| 10 | **Standalone teachers (no school) — can they use the bank?** | (a) System questions only (b) System + own teacher questions | **(b)** — they can create and use their own |

---

## 12. Technical Notes

- **No breaking changes** to existing scanning workflow. Bank tests still produce the same answer sheets and scan the same way.
- **AnswerKey remains the source of truth** for scan grading. Bank tests just auto-populate it.
- **TestQuestion** is informational — it links a test back to its source questions for analytics. The scanning pipeline still uses AnswerKey only.
- **Question text is never on the answer sheet** — the physical test paper is separate. The answer sheet only has bubbles.

---

## 13. File Structure (Planned)

```
backend/
  models.py            — add Topic, Question, TestQuestion
  schemas.py           — add TopicCreate/Response, QuestionCreate/Response, TestGenerate
  routers/
    questions_router.py — NEW: question CRUD + search
    topics_router.py    — NEW: topic CRUD (or nested under subjects_router)
    tests_router.py     — add /generate and /auto-generate endpoints
  services/
    question_bank.py    — NEW: search, random selection, duplicate checking
  seed_data/            — NEW: JSON files for system questions
  seed_questions.py     — NEW: seeding script

frontend/
  src/pages/
    QuestionBank.jsx    — NEW: browse/search questions
    QuestionEditor.jsx  — NEW: create/edit question form
    TestBuilder.jsx     — NEW: two-panel test assembly
  src/components/
    QuestionCard.jsx    — NEW: question preview card
    QuestionFilter.jsx  — NEW: filter sidebar (topic, difficulty, search)
```
