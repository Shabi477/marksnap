# MarkSnap — System Architecture Document

> **Status:** Living document — updated as features are added  
> **Last Updated:** 2026-03-11  
> **Repository:** https://github.com/Shabi477/marksnap

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Deployment & Infrastructure](#4-deployment--infrastructure)
5. [Database Schema](#5-database-schema)
6. [Backend API Reference](#6-backend-api-reference)
7. [Services & Processing Pipeline](#7-services--processing-pipeline)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Authentication & Authorisation](#9-authentication--authorisation)
10. [Scanning Engine](#10-scanning-engine)
11. [Answer Sheet PDF Generation](#11-answer-sheet-pdf-generation)
12. [Data Flow Diagrams](#12-data-flow-diagrams)
13. [Branding & Design System](#13-branding--design-system)
14. [Environment Variables](#14-environment-variables)
15. [Planned Features](#15-planned-features)
16. [Appendix: File Index](#16-appendix-file-index)

---

## 1. Overview

MarkSnap is an end-to-end multiple-choice test scanning and grading platform built for **Online Maths Academy (OMA)**. Teachers create tests, print personalised answer sheets with QR codes, and scan completed sheets using either bulk image upload or a live phone camera — the system grades instantly.

### Core Workflow
```
Create Test → Set Answer Key → Print Sheets → Students Fill In → Scan → Instant Results
```

### Key Principles
- **Minimal teacher process** — scanning should be "flip, beep, flip, beep"
- **No app download** — everything works in the browser (including camera)
- **Multi-tenant** — schools with multiple teachers, HODs, and class groups
- **Offline-tolerant scanning** — printed bubble sheets work anywhere

---

## 2. Technology Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | FastAPI | 0.115.0 |
| Server | Uvicorn | 0.30.6 |
| ORM | SQLAlchemy | 2.0.35 |
| Database | PostgreSQL (Neon) | — |
| DB Driver | psycopg2-binary | 2.9.9 |
| Auth | python-jose (JWT) + bcrypt | 3.3.0 / 4.0.1 |
| Image Processing | OpenCV (headless) | ≥4.10.0 |
| QR Code Read | pyzbar | 0.1.9 |
| QR Code Write | qrcode | 7.4.2 |
| PDF Generation | ReportLab | 4.2.2 |
| PDF→Image | pdf2image + poppler | 1.17.0 |
| Excel Export | openpyxl | 3.1.5 |
| Validation | Pydantic | 2.9.2 |
| Image Library | Pillow | 10.4.0 |
| Environment | python-dotenv | 1.0.1 |

### Frontend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 18.3.1 |
| Build Tool | Vite | 5.4.8 |
| CSS | Tailwind CSS | 3.4.13 |
| Routing | React Router | 6.26.2 |
| HTTP Client | Axios | 1.7.7 |
| Icons | Lucide React | 0.447.0 |
| QR Detection | jsQR | 1.4.0 |
| Notifications | React Hot Toast | 2.4.1 |

### Runtime
| Component | Technology |
|-----------|-----------|
| Python | 3.13 |
| Node.js | 20+ (build only) |
| System Deps | zbar, poppler-utils (via Nixpacks) |

---

## 3. Project Structure

```
marksnap/
├── backend/
│   ├── main.py                    # FastAPI app + CORS + router registration
│   ├── database.py                # SQLAlchemy engine + session (PostgreSQL)
│   ├── models.py                  # All ORM models
│   ├── schemas.py                 # Pydantic request/response schemas
│   ├── auth.py                    # JWT token creation + get_current_teacher dep
│   ├── requirements.txt           # Python dependencies
│   ├── .env                       # DATABASE_URL, SECRET_KEY (gitignored)
│   │
│   ├── routers/
│   │   ├── auth_router.py         # Register, login, me
│   │   ├── classes_router.py      # Class CRUD + student management
│   │   ├── tests_router.py        # Test CRUD + answer key + sheet generation
│   │   ├── scan_router.py         # Batch upload + live scan + flagged review
│   │   ├── results_router.py      # Results query + Excel export + progress
│   │   ├── school_router.py       # HOD: school management
│   │   └── subjects_router.py     # Subject CRUD + teacher assignment
│   │
│   ├── services/
│   │   ├── scanner.py             # OpenCV bubble detection + answer extraction
│   │   ├── sheet_generator.py     # ReportLab PDF answer sheet builder
│   │   ├── qr_handler.py          # QR code encode/decode
│   │   └── excel_export.py        # Results → XLSX with colour coding
│   │
│   └── uploads/                   # Uploaded scan images (gitignored)
│       ├── batch_{id}/            # Per-batch scan files
│       └── live/                  # Temporary live scan files (auto-deleted)
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js             # Dev proxy /api → localhost:8000
│   ├── tailwind.config.js         # Brand colours + Nunito font
│   │
│   └── src/
│       ├── main.jsx               # React entry point
│       ├── App.jsx                # Routes + ProtectedRoute wrapper
│       ├── index.css              # Tailwind directives + custom styles
│       │
│       ├── context/
│       │   └── AuthContext.jsx    # Auth state provider + hooks
│       │
│       ├── services/
│       │   └── api.js             # Axios instance + API modules
│       │
│       ├── components/
│       │   └── Layout.jsx         # Sidebar navigation + responsive shell
│       │
│       └── pages/
│           ├── Login.jsx          # Login / Register / Register School
│           ├── Dashboard.jsx      # Stats + quick actions + recent tests
│           ├── Classes.jsx        # Class list + create
│           ├── ClassDetail.jsx    # Student list + CSV upload
│           ├── Tests.jsx          # Test list + create with sections
│           ├── TestDetail.jsx     # Answer key editor + action bar
│           ├── ScanUpload.jsx     # Batch scan upload + flagged review
│           ├── LiveScanner.jsx    # Camera-based live scanning
│           ├── Results.jsx        # Results table + Excel export
│           └── SchoolManagement.jsx  # HOD admin panel
│
├── docs/
│   ├── ARCHITECTURE.md            # This document
│   └── QUESTION_BANK_ARCHITECTURE.md  # Premade questions feature design
│
├── requirements.txt               # Root: points to backend/requirements.txt
├── railway.toml                   # Railway deployment config
├── nixpacks.toml                  # Nixpacks build (zbar + poppler)
├── vercel.json                    # Vercel frontend config + API rewrite
├── start-servers.bat              # Local dev: start backend + frontend
├── stop-servers.bat               # Local dev: stop both
└── .gitignore
```

---

## 4. Deployment & Infrastructure

### Production Architecture
```
┌──────────────┐     HTTPS      ┌──────────────┐     HTTPS     ┌──────────────┐
│   Browser    │ ──────────────▶│   Vercel      │              │   Railway     │
│  (React SPA) │                │  (Frontend)   │─── /api/* ──▶│  (Backend)    │
└──────────────┘                └──────────────┘              └──────┬───────┘
                                                                      │
                                                                      │ TCP/SSL
                                                                      ▼
                                                              ┌──────────────┐
                                                              │   Neon       │
                                                              │ (PostgreSQL) │
                                                              └──────────────┘
```

### Vercel (Frontend)
- Build: `cd frontend && npm run build`
- Output: `frontend/dist`
- API rewrite: `/api/:path*` → `${BACKEND_URL}/api/:path*`
- Framework: Vite

### Railway (Backend)
- Builder: Nixpacks
- System packages: `zbar`, `poppler_utils`
- Start: `cd backend && python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /api/health` (300s timeout)
- Restart policy: on failure (max 10 retries)

### Neon (Database)
- Managed PostgreSQL
- Connection via `DATABASE_URL` env var
- Pool settings: `pool_pre_ping=True, pool_recycle=300`

### Local Development
```
# Backend (terminal 1)
cd backend
.\venv\Scripts\activate
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Frontend (terminal 2)
cd frontend
npm run dev    # → http://localhost:5173, proxies /api to :8000
```

---

## 5. Database Schema

### Entity Relationship Diagram
```
School
  ├── 1:many → Teacher
  ├── 1:many → ClassGroup
  ├── 1:many → Subject
  └── 1:many → TestAssignment

Teacher
  ├── many:1 → School (nullable — standalone teachers have no school)
  ├── 1:many → ClassGroup (owned)
  ├── many:many → ClassGroup (assigned, via teacher_classes)
  ├── many:many → Subject (via teacher_subjects, with is_hod flag)
  └── 1:many → Test

Subject
  ├── many:1 → School
  ├── many:many → Teacher (via teacher_subjects)
  └── 1:many → Test

ClassGroup
  ├── many:1 → School (nullable)
  ├── many:1 → Teacher (owner)
  ├── many:many → Teacher (assigned)
  ├── 1:many → Student
  └── 1:many → ScanBatch

Student
  ├── many:1 → ClassGroup
  └── 1:many → ScanResult

Test
  ├── many:1 → Teacher (creator)
  ├── many:1 → Subject (nullable)
  ├── 1:many → TestSection
  ├── 1:many → AnswerKey
  ├── 1:many → ScanBatch
  └── 1:many → TestAssignment

TestSection
  └── many:1 → Test

AnswerKey
  └── many:1 → Test

ScanBatch
  ├── many:1 → Test
  ├── many:1 → ClassGroup (nullable)
  └── 1:many → ScanResult

ScanResult
  ├── many:1 → ScanBatch
  └── many:1 → Student (nullable)

TestAssignment
  ├── many:1 → Test
  ├── many:1 → School
  ├── many:1 → Teacher (assigner)
  ├── many:1 → Teacher (target, nullable)
  └── many:1 → ClassGroup (nullable)
```

### Table Definitions

#### `schools`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | Auto-increment |
| name | String(200) | Not null |
| invite_code | String(20) | Unique, auto-generated |
| created_at | DateTime | Default: now |

#### `teachers`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(100) | |
| email | String(200) | Unique |
| hashed_password | String(200) | bcrypt hash |
| role | String(20) | `standalone` / `hod` / `teacher` / `school_admin` |
| school_id | Integer FK → schools | Nullable |
| created_at | DateTime | |

#### `subjects`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(200) | |
| school_id | Integer FK → schools | Not null |

#### `teacher_subjects` (junction)
| Column | Type | Notes |
|--------|------|-------|
| teacher_id | Integer FK → teachers | PK |
| subject_id | Integer FK → subjects | PK |
| is_hod | Boolean | Default: False |

#### `class_groups`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(100) | |
| year_group | String(20) | Nullable (e.g. "2026") |
| school_id | Integer FK → schools | Nullable |
| owner_id | Integer FK → teachers | Not null |
| created_at | DateTime | |

#### `teacher_classes` (junction)
| Column | Type | Notes |
|--------|------|-------|
| teacher_id | Integer FK → teachers | PK |
| class_id | Integer FK → class_groups | PK |

#### `students`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(100) | |
| student_code | String(50) | Unique, auto: `S{uuid[:8]}` |
| class_id | Integer FK → class_groups | |
| created_at | DateTime | |

#### `tests`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(200) | |
| teacher_id | Integer FK → teachers | Creator |
| subject_id | Integer FK → subjects | Nullable |
| test_date | String(20) | Nullable (ISO date) |
| test_file_path | String(500) | Nullable (uploaded paper) |
| created_at | DateTime | |

#### `test_sections`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| test_id | Integer FK → tests | |
| section_name | String(10) | "A", "B", etc. |
| num_questions | Integer | |
| num_options | Integer | Default: 4 (supports 2–5) |
| page_number | Integer | Default: 1 |
| order_index | Integer | Display order |
| start_question | Integer | Auto-calculated |

#### `answer_keys`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| test_id | Integer FK → tests | |
| question_number | Integer | |
| section_name | String(10) | |
| correct_answer | String(1) | "A"–"E" |

#### `scan_batches`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| test_id | Integer FK → tests | |
| class_id | Integer FK → class_groups | Nullable |
| status | String(20) | `pending` / `processing` / `completed` / `error` |
| total_pages | Integer | |
| processed_pages | Integer | Default: 0 |
| error_message | Text | Nullable |
| uploaded_at | DateTime | |

#### `scan_results`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| scan_batch_id | Integer FK → scan_batches | |
| student_id | Integer FK → students | Nullable |
| student_code | String(50) | Nullable |
| page_number | Integer | |
| section_name | String(10) | |
| question_number | Integer | |
| selected_answer | String(1) | Nullable (no answer detected) |
| is_correct | Boolean | Nullable |
| confidence | Float | 0.0–1.0 |
| needs_review | Boolean | Default: False |

#### `test_assignments`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| test_id | Integer FK → tests | |
| school_id | Integer FK → schools | |
| assigned_by | Integer FK → teachers | |
| teacher_id | Integer FK → teachers | Nullable |
| class_id | Integer FK → class_groups | Nullable |
| year_group | String(20) | Nullable |
| created_at | DateTime | |

---

## 6. Backend API Reference

### Auth (`/api/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Register (standalone or join school via invite) | — |
| POST | `/register-school` | Create school + admin account | — |
| POST | `/login` | Get JWT token | — |
| GET | `/me` | Current teacher + school info | JWT |

### Classes (`/api/classes`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List visible classes | JWT |
| POST | `/` | Create class | JWT (standalone/HOD/admin) |
| DELETE | `/{id}` | Delete class + students | JWT (owner/HOD/admin) |
| GET | `/{id}/students` | List students | JWT |
| POST | `/{id}/students` | Add student | JWT |
| DELETE | `/{id}/students/{sid}` | Remove student | JWT |
| POST | `/{id}/students/upload` | Bulk CSV upload | JWT |
| GET | `/search-students` | Search across visible classes | JWT |
| POST | `/{id}/add-existing-student` | Transfer student | JWT |

### Tests (`/api/tests`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List own + assigned tests | JWT |
| POST | `/` | Create test with sections | JWT |
| GET | `/{id}` | Test detail + sections | JWT |
| DELETE | `/{id}` | Delete test cascade | JWT |
| POST | `/{id}/answer-key` | Set/update answer key | JWT |
| GET | `/{id}/answer-key` | Retrieve answer key | JWT |
| GET | `/{id}/sheets/{classId}` | Generate answer sheet PDF | JWT |
| POST | `/{id}/upload-paper` | Upload reference test paper | JWT |
| GET | `/{id}/paper` | Download reference paper | JWT |

### Scanning (`/api/scan`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/upload/{testId}` | Upload batch images/PDFs | JWT |
| GET | `/batches/{testId}` | List scan batches | JWT |
| GET | `/batch/{id}/status` | Batch status check | JWT |
| GET | `/batch/{id}/flagged` | Get flagged results (needs review) | JWT |
| PUT | `/result/{id}/correct` | Teacher corrects a result | JWT |
| POST | `/live/{testId}` | Single-image live scan → instant result | JWT |

### Results (`/api/results`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/{testId}` | All student results | JWT |
| GET | `/{testId}/export` | Export to Excel (.xlsx) | JWT |
| GET | `/progress/class/{id}` | Class progress across tests | JWT |
| GET | `/progress/class/{id}/export` | Export progress to Excel | JWT |

### School Management (`/api/school`) — HOD only
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | School info | JWT (HOD) |
| GET | `/invite-code` | Current invite code | JWT (HOD) |
| POST | `/regenerate-invite` | New invite code | JWT (HOD) |
| GET | `/teachers` | List school teachers | JWT (HOD) |
| GET | `/classes` | List school classes | JWT (HOD) |
| POST | `/classes` | Create class | JWT (HOD) |
| DELETE | `/classes/{id}` | Delete class | JWT (HOD) |
| POST | `/assign-teacher` | Assign teacher → class | JWT (HOD) |
| DELETE | `/unassign-teacher` | Remove assignment | JWT (HOD) |
| POST | `/import-classes` | Bulk import from Excel | JWT (HOD) |
| GET | `/students/search` | Search students | JWT (HOD) |
| POST | `/students/transfer` | Transfer student | JWT (HOD) |
| GET | `/year-groups` | List distinct year groups | JWT (HOD) |
| POST | `/push-test` | Assign test to classes/teachers | JWT (HOD) |
| GET | `/test-assignments` | List assignments | JWT (HOD) |
| DELETE | `/test-assignments/{id}` | Remove assignment | JWT (HOD) |

### Subjects (`/api/subjects`) — HOD only
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List school subjects | JWT (HOD) |
| POST | `/` | Create subject | JWT (HOD) |
| DELETE | `/{id}` | Delete subject | JWT (HOD) |
| POST | `/{id}/teachers` | Assign teacher to subject | JWT (HOD) |
| DELETE | `/{id}/teachers/{tid}` | Remove teacher from subject | JWT (HOD) |
| GET | `/{id}/teachers` | List subject teachers | JWT (HOD) |

### Health
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check (Railway) | — |

---

## 7. Services & Processing Pipeline

### 7.1 Scanner Service (`scanner.py`)

The core image processing pipeline:

```
process_scan_batch(file_paths, test, answer_key_map, db)
│
├── Convert inputs to PIL Images
│   ├── PDF → pdf2image.convert_from_path(dpi=200)
│   └── JPG/PNG → Image.open()
│
└── For each image → _process_single_page()
    │
    ├── 1. Read QR Code (pyzbar)
    │   └── Extract: student_code, test_id, page, total_pages
    │
    ├── 2. Perspective Correction (_correct_perspective)
    │   ├── Find alignment markers (4 corner squares)
    │   ├── cv2.getPerspectiveTransform()
    │   └── cv2.warpPerspective() → flat, aligned image
    │
    ├── 3. Threshold → Binary Image
    │   └── cv2.threshold(THRESH_BINARY_INV + THRESH_OTSU)
    │
    ├── 4. Find Bubble Contours
    │   ├── cv2.findContours()
    │   └── _filter_bubble_contours()
    │       ├── Filter by area (min/max)
    │       ├── Filter by aspect ratio (~1.0 = circular)
    │       └── Filter by circularity
    │
    ├── 5. Group into Question Rows
    │   └── _group_bubbles() — cluster by Y coordinate
    │
    └── 6. Analyse Each Row
        └── _analyze_bubbles()
            ├── Calculate fill % for each bubble
            ├── Answer-change detection:
            │   ├── >85% filled → "cancelled" (crossed out)
            │   ├── 30–85% filled → selected answer
            │   └── <30% filled → not selected
            ├── Determine selected answer + confidence:
            │   ├── Single clear answer → confidence 0.95
            │   ├── Clear correction → confidence 0.85
            │   ├── Ambiguous → confidence 0.4 (flagged)
            │   └── No answer → confidence 0.0 (flagged)
            └── Compare with answer key → is_correct
```

### 7.2 Sheet Generator (`sheet_generator.py`)

```
generate_answer_sheets(test, students, class_group)
│
└── For each student, for each page:
    │
    ├── Header Banner
    │   ├── Full-width rounded cyan bar
    │   ├── MarkSnap logo (14mm SVG icon)
    │   └── School name / Test name
    │
    ├── Student Info Box
    │   ├── Student name and code
    │   ├── Class name
    │   └── Test date
    │
    ├── QR Code (22×22mm)
    │   └── JSON: { sid, tid, pg, tp }
    │
    ├── Instructions Box
    │   ├── "Fill bubbles completely with pencil"
    │   └── "To change: completely fill wrong bubble, neatly fill correct one"
    │
    ├── Bubble Grid (per section)
    │   ├── Multi-column layout
    │   ├── Question numbers (left)
    │   ├── Option bubbles: A B C D [E]
    │   ├── 4mm radius circles
    │   ├── 12mm X spacing, 11mm Y spacing
    │   └── Alternating row shading
    │
    └── Alignment Markers
        └── 5×5mm black squares in 4 corners
```

### 7.3 QR Handler (`qr_handler.py`)

```
generate_qr_code(data: dict) → PIL Image
  └── QR with error_correction=HIGH
  └── Data format: {"sid": "S1a2b3c4", "tid": 42, "pg": 1, "tp": 2}

read_qr_code(image: PIL Image) → dict | None
  └── pyzbar.decode(image)
  └── Parse JSON → return dict
```

### 7.4 Excel Export (`excel_export.py`)

```
generate_results_excel(test_name, student_results, answer_keys)
│
└── XLSX workbook with:
    ├── Rows: Questions (Q1, Q2, ...)
    ├── Columns: Students (name + code)
    ├── Cells: Answer letters
    │   ├── Green fill → correct
    │   └── Red fill → incorrect
    ├── Answer key column (light blue)
    ├── Item Difficulty row (% correct per question)
    └── Score + Percentage summary rows
```

---

## 8. Frontend Architecture

### 8.1 Routing

```
/login                     → Login.jsx (public)
/                          → Layout.jsx (protected wrapper)
  ├── /                    → Dashboard.jsx
  ├── /classes             → Classes.jsx
  ├── /classes/:classId    → ClassDetail.jsx
  ├── /tests               → Tests.jsx
  ├── /tests/:testId       → TestDetail.jsx
  ├── /scan/:testId        → ScanUpload.jsx
  ├── /live-scan/:testId   → LiveScanner.jsx
  ├── /results/:testId     → Results.jsx
  └── /school              → SchoolManagement.jsx (HOD only)
```

### 8.2 State Management

- **AuthContext** — global auth state (teacher object, JWT token)
- **Local component state** — each page manages its own data via `useState` + `useEffect`
- No external state library (Redux, Zustand) — not needed at current scale

### 8.3 API Service Layer (`api.js`)

Centralised Axios instance with:
- Base URL from `VITE_API_URL` env or same-origin `/api`
- Request interceptor: adds `Authorization: Bearer {token}`
- Response interceptor: catches 401 → logout + redirect

Exports grouped by domain:
```
authAPI.{register, registerSchool, login, getMe}
schoolAPI.{getInfo, getTeachers, getClasses, createClass, ...}
classesAPI.{list, create, getStudents, addStudent, uploadStudentsCSV}
testsAPI.{list, create, get, setAnswerKey, getAnswerKey, downloadSheets}
scanAPI.{upload, listBatches, getFlagged, correctResult, scanLive}
resultsAPI.{get, export}
```

### 8.4 Key Pages

#### Dashboard
- 3 stat cards (classes, students, tests)
- Quick action buttons
- Recent tests grid (latest 6)

#### TestDetail
- Answer key editor: grid of bubble buttons per question, grouped by section
- Class dropdown + Download Sheets button
- Live Scan (primary) / Upload Scans / View Results buttons
- Save Key with filled progress indicator

#### ScanUpload
- Drag-and-drop file zone + camera capture button
- File preview thumbnails
- Optional class selector
- Batch history with flagged count badges
- Expandable flagged review panel: A–E correction buttons per question

#### LiveScanner
- Full camera feed via `getUserMedia()` (rear-facing preferred)
- jsQR scanning loop at ~7fps (150ms interval)
- QR stability check (3 consecutive matching frames → capture)
- Auto-sends captured frame to backend
- Result overlay: student name, score, pass/fail icon
- Beep sounds (880Hz success, 300Hz error) + vibration
- 2-second cooldown between scans
- Running stats bar: total scanned, class average, pass count
- Scrolling student results list
- Pause/Resume + Stop Camera controls

#### Results
- Table: one row per student, one column per question
- Cells colour-coded green (correct) / red (incorrect)
- Score + percentage summary columns
- Class filter dropdown
- Export to Excel button

#### SchoolManagement
- 5 tabs: Overview, Classes, Teachers, Tests, Students
- Invite code display + copy/regenerate
- Excel bulk import for classes + students
- Test push: assign to classes, teachers, or year groups

---

## 9. Authentication & Authorisation

### JWT Flow
```
1. POST /api/auth/login → { access_token, token_type: "bearer" }
2. Client stores token in localStorage("marksnap_token")
3. All requests: Authorization: Bearer {token}
4. Backend: get_current_teacher() dependency decodes JWT → Teacher
5. 401 → frontend clears token, redirects to /login
```

### Token Details
- Algorithm: HS256
- Payload: `{ sub: teacher_email }`
- Secret: `SECRET_KEY` env var
- Expiry: 30 days (`ACCESS_TOKEN_EXPIRE_MINUTES = 43200`)

### Password Hashing
- Library: `bcrypt` (direct, not via passlib)
- Hash on register, verify on login

### Role-Based Access

| Role | Scope | Can See |
|------|-------|---------|
| `standalone` | Own data only | Own classes, tests, results |
| `teacher` | Assigned scope | Assigned classes + own tests + assigned tests |
| `hod` | Entire school | All school classes, teachers, tests, subjects |
| `school_admin` | Entire school | Same as HOD (future: distinct permissions) |

### Access Control Logic
```python
def _can_access_test(teacher, test, db):
    # 1. Teacher owns the test
    if test.teacher_id == teacher.id: return True
    # 2. HOD/school_admin in same school
    if teacher.role in ("hod", "school_admin") and teacher.school_id:
        if test.teacher.school_id == teacher.school_id: return True
    # 3. Explicitly assigned via TestAssignment
    assignment = db.query(TestAssignment).filter(
        TestAssignment.test_id == test.id,
        OR(teacher_id == teacher.id, class_id in teacher's classes)
    ).first()
    return assignment is not None
```

---

## 10. Scanning Engine

### Answer Sheet Physical Layout
```
┌─────────────────────────────────────────┐
│  [LOGO] MarkSnap        [School Name]   │  ← Cyan banner
│─────────────────────────────────────────│
│  Name: John Smith    Code: S1a2b3c4     │
│  Class: Year 8A      Date: 2026-03-11   │
│─────────────────────────────────────────│
│  [QR CODE]   Instructions:              │
│  22×22mm     Fill bubbles completely...  │
│─────────────────────────────────────────│
│  ■ (alignment)              ■ (alignment)│
│                                         │
│  Section A                              │
│  1.  (A) (B) (C) (D)    11. (A)(B)(C)(D)│
│  2.  (A) (B) (C) (D)    12. (A)(B)(C)(D)│
│  ...                     ...            │
│  10. (A) (B) (C) (D)    20. (A)(B)(C)(D)│
│                                         │
│  ■ (alignment)              ■ (alignment)│
└─────────────────────────────────────────┘
```

### Answer-Change Detection
Students can change their answer by scribbling out the wrong bubble:

| Fill Level | Meaning | Action |
|------------|---------|--------|
| >85% | Cancelled (scribbled out) | Skip this bubble |
| 30–85% | Selected answer | Count as chosen |
| <30% | Not filled | Ignore |

**Confidence levels:**
| Pattern | Confidence | Review? |
|---------|-----------|---------|
| Single clear answer | 0.95 | No |
| Crossed-out + new answer | 0.85 | No |
| Multiple ambiguous bubbles | 0.40 | Yes (flagged) |
| No answer detected | 0.00 | Yes (flagged) |

Flag threshold: `REVIEW_CONFIDENCE_THRESHOLD = 0.5`

### Live Scanning vs Batch Upload

| Feature | Live Scan | Batch Upload |
|---------|-----------|-------------|
| Input | Phone camera | Image/PDF files |
| QR detection | Client-side (jsQR) | Server-side (pyzbar) |
| Processing | Single sheet | Multiple sheets |
| Results | Instant overlay | Batch summary |
| Use case | Classroom: flip through stack | Office: photocopied batch |
| Flagged review | After session | Inline in upload page |

---

## 11. Answer Sheet PDF Generation

### Layout Constants
| Parameter | Value |
|-----------|-------|
| Page size | A4 (210 × 297 mm) |
| Left/right margin | 15 mm |
| Top margin | 18 mm |
| Bottom margin | 14 mm |
| Bubble radius | 4 mm |
| Bubble X spacing | 12 mm |
| Bubble Y spacing | 11 mm |
| QR code size | 22 × 22 mm |
| QR border | 1.5 mm |
| Alignment marker | 5 × 5 mm |
| Logo size | 14 × 14 mm |
| Header height | 14 mm |

### QR Code Payload
```json
{
  "sid": "S1a2b3c4",     // student_code
  "tid": 42,              // test_id
  "pg": 1,                // page_number
  "tp": 2                 // total_pages
}
```

---

## 12. Data Flow Diagrams

### Test Lifecycle
```
Teacher                    Backend                     Database
  │                          │                           │
  ├── Create Test ──────────▶ POST /tests/ ────────────▶ Test + TestSections
  │                          │                           │
  ├── Set Answer Key ───────▶ POST /tests/{id}/key ────▶ AnswerKey rows
  │                          │                           │
  ├── Download Sheets ──────▶ GET /tests/{id}/sheets ──▶ (reads Students)
  │  ◀── PDF blob ──────────┤  sheet_generator.py       │
  │                          │                           │
  │   [Print & distribute]   │                           │
  │   [Students fill in]     │                           │
  │                          │                           │
  ├── Scan (Live) ──────────▶ POST /scan/live/{id} ────▶ ScanBatch + ScanResults
  │  ◀── {score, student} ──┤  scanner.py               │
  │                          │                           │
  ├── Review flagged ───────▶ GET /batch/{id}/flagged    │
  │  ◀── flagged list ──────┤                           │
  ├── Correct ──────────────▶ PUT /result/{id}/correct ─▶ Update ScanResult
  │                          │                           │
  ├── View Results ─────────▶ GET /results/{testId}      │
  │  ◀── results table ────┤  (aggregated query)        │
  │                          │                           │
  └── Export Excel ─────────▶ GET /results/{id}/export   │
     ◀── .xlsx blob ───────┤  excel_export.py           │
```

### Live Scanner Flow
```
Phone Browser                      Backend
  │                                  │
  ├── getUserMedia() → camera feed   │
  │                                  │
  │  [150ms loop:]                   │
  ├── Canvas.getImageData()          │
  ├── jsQR.decode(imageData)         │
  │   ├── No QR → continue loop     │
  │   ├── New QR → reset counter     │
  │   └── Same QR (3x) → capture    │
  │                                  │
  ├── Canvas.toBlob("image/jpeg") ──▶ POST /scan/live/{testId}
  │                                  │  ├── Save temp file
  │                                  │  ├── process_scan_batch([file])
  │                                  │  ├── Create ScanBatch + ScanResults
  │                                  │  ├── Delete temp file
  │  ◀── LiveScanResponse ──────────┤  └── Return score/student/answers
  │                                  │
  ├── Play beep (880Hz)              │
  ├── Show result overlay            │
  ├── Add to scannedStudents[]       │
  ├── 2s cooldown                    │
  └── Resume loop                    │
```

---

## 13. Branding & Design System

### Colours
| Token | Hex | Usage |
|-------|-----|-------|
| brand-50 | #ecfeff | Lightest backgrounds |
| brand-100 | #cffafe | Hover states |
| brand-200 | #a5f3fc | Borders, spinners |
| brand-300 | #67e8f9 | Active states |
| brand-400 | #22d3ee | Links |
| brand-500 | **#0891b2** | Primary buttons, badges, accents |
| brand-600 | **#0e7490** | Button hover, headers |
| brand-700 | #155e75 | Text emphasis |
| brand-800 | #164e63 | Dark text |
| brand-900 | #0c4a6e | Darkest text |

Supplementary: emerald (success/pass), red (error/fail), amber (warning/flagged), gray (neutral)

### Typography
- **Font family:** Nunito (Google Fonts), fallback to system-ui
- **Headings:** `font-semibold` to `font-bold`
- **Body:** Regular weight

### Component Patterns
- `.card` — white rounded panel with shadow
- `.btn-primary` — brand-500 bg, white text, hover brand-600
- `.btn-secondary` — gray-100 bg, gray-700 text
- `.input-field` — bordered input with focus ring
- `.page-title` / `.page-subtitle` — consistent heading hierarchy

### Responsive Behaviour
- Sidebar collapses to top bar on mobile
- Cards stack vertically
- Tables scroll horizontally
- Camera view: full width, aspect-video

---

## 14. Environment Variables

### Backend (`.env`)
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required) | `postgresql://user:pass@host/db` |
| `SECRET_KEY` | JWT signing key | Random 64-char string |

### Frontend
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend URL (production only) | `https://marksnap-api.railway.app` |

### Railway
| Variable | Description |
|----------|-------------|
| `PORT` | Auto-set by Railway |
| `DATABASE_URL` | Neon connection string |
| `SECRET_KEY` | JWT secret |

### Vercel
| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Railway backend URL (for API rewrite) |

---

## 15. Planned Features

### In Progress
- [ ] **Live Scanner** — camera-based scanning with instant results (backend + frontend built, testing)

### Next: Question Bank
Full design in [QUESTION_BANK_ARCHITECTURE.md](QUESTION_BANK_ARCHITECTURE.md)
- Topic and Question models
- Question CRUD API + search
- Test builder (pick from bank)
- Auto-generate tests by criteria
- System-seeded questions for Maths
- Question-level analytics (difficulty, discrimination)

### Future
- [ ] Test paper PDF generation (from question text)
- [ ] Student progress dashboards
- [ ] Parent report generation
- [ ] AI-assisted question tagging
- [ ] PWA manifest (Add to Home Screen)
- [ ] Offline scan queue (scan now, upload later)

### Full Product Roadmap
See [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for:
- Pricing model & tiers (Free / Standard / Premium / All-Access)
- Market analysis & revenue projections
- Build phases (7 phases from foundation to international)
- Question bank strategy & AI generation plan
- UK education structure (KS1–KS5) & future US expansion

---

## 16. Appendix: File Index

### Backend Files
| File | Purpose |
|------|---------|
| `main.py` | App initialisation, CORS, router mounting, health endpoint |
| `database.py` | Engine + SessionLocal + get_db dependency |
| `models.py` | 11 SQLAlchemy models + 2 junction tables |
| `schemas.py` | ~30 Pydantic models for request/response |
| `auth.py` | JWT create + decode, get_current_teacher |
| `routers/auth_router.py` | Register, login, me |
| `routers/classes_router.py` | Class + student CRUD |
| `routers/tests_router.py` | Test CRUD + answer key + sheets |
| `routers/scan_router.py` | Batch upload + live scan + corrections |
| `routers/results_router.py` | Results + export + progress |
| `routers/school_router.py` | HOD school management |
| `routers/subjects_router.py` | Subject CRUD + teacher assignment |
| `services/scanner.py` | OpenCV scanning pipeline |
| `services/sheet_generator.py` | ReportLab PDF generation |
| `services/qr_handler.py` | QR encode/decode |
| `services/excel_export.py` | Results → XLSX |

### Frontend Files
| File | Purpose |
|------|---------|
| `App.jsx` | Routes + protected wrapper |
| `context/AuthContext.jsx` | Auth state + JWT management |
| `services/api.js` | Axios instance + API modules |
| `components/Layout.jsx` | Sidebar + responsive shell |
| `pages/Login.jsx` | 3-mode auth page |
| `pages/Dashboard.jsx` | Home with stats + quick actions |
| `pages/Classes.jsx` | Class list + create |
| `pages/ClassDetail.jsx` | Student management |
| `pages/Tests.jsx` | Test list + create |
| `pages/TestDetail.jsx` | Answer key + actions |
| `pages/ScanUpload.jsx` | Batch upload + flagged review |
| `pages/LiveScanner.jsx` | Camera live scanning |
| `pages/Results.jsx` | Results table + export |
| `pages/SchoolManagement.jsx` | HOD admin panel |

---

*This document should be updated whenever models, routes, or major features are added.*
