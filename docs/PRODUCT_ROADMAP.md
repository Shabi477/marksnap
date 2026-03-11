# MarkSnap — Product Roadmap & Business Plan

> **Status:** Living document — updated as decisions are made  
> **Last Updated:** 2026-03-11  
> **Owner:** Shabi (Online Maths Academy)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [User Roles & Tiers](#2-user-roles--tiers)
3. [Pricing Model](#3-pricing-model)
4. [Market Analysis](#4-market-analysis)
5. [Education Structure](#5-education-structure)
6. [Subjects](#6-subjects)
7. [Question Bank Strategy](#7-question-bank-strategy)
8. [AI Test Generation](#8-ai-test-generation)
9. [Feature Tiers — What Each Plan Gets](#9-feature-tiers--what-each-plan-gets)
10. [Build Phases](#10-build-phases)
11. [Revenue Projections](#11-revenue-projections)
12. [International Expansion](#12-international-expansion)
13. [Key Decisions Log](#13-key-decisions-log)

---

## 1. Product Vision

MarkSnap is an end-to-end multiple-choice test platform for UK schools:

1. **Create** tests (manually or from a question bank / AI)
2. **Print** answer sheets with QR codes
3. **Scan** completed sheets (batch upload or live camera)
4. **Grade** instantly with question-level analysis (QLA)
5. **Track** student progress over time across multiple tests

### Target Users
- Individual teachers (free tier — funnel to paid)
- Schools (Standard/Premium/All-Access — the revenue)
- Super Admin (us — curate question bank, approve content)

---

## 2. User Roles & Tiers

### Roles

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Super Admin** | Platform-wide | Manage question bank, approve teacher submissions, platform settings |
| **School Admin / HOD** | School-wide | Manage teachers, classes, subjects, invite codes, school settings |
| **Teacher** | Own classes | Create tests, scan, view results, manage students |
| **Standalone Teacher** | Individual | Same as Teacher but no school affiliation |

### Account Tiers

| Tier | Who | Price |
|------|-----|-------|
| **Free** | Individual teacher | £0 |
| **Standard** | School (per subject) | £30/subject/year |
| **Premium** | School (per subject) | £50/subject/year |
| **All-Access** | School (all subjects) | £300/year |

---

## 3. Pricing Model

### Tier Breakdown

| Feature | Free | Standard (£30/subj) | Premium (£50/subj) | All-Access (£300) |
|---------|------|---------------------|--------------------|--------------------|
| Create own tests | ✅ | ✅ | ✅ | ✅ |
| Print answer sheets | ✅ | ✅ | ✅ | ✅ |
| Scan & grade | ✅ | ✅ | ✅ | ✅ |
| Simple QLA (per test) | ✅ | ✅ | ✅ | ✅ |
| Access question bank | ❌ | ✅ | ✅ | ✅ |
| Student progress over time | ❌ | ✅ | ✅ | ✅ |
| Full analysis suite | ❌ | ✅ | ✅ | ✅ |
| AI-generate tests | ❌ | ❌ | ✅ | ✅ |
| Create own questions (manual) | ❌ | ❌ | ✅ | ✅ |
| All subjects included | ❌ | ❌ | ❌ | ✅ |

### Pricing Notes
- Free tier is the growth engine — teachers try it, love it, push school to buy
- Standard at £30/subject is extremely competitive vs UK EdTech (most charge £500+/school)
- All-Access at £300 is compelling for schools with 6+ subjects
- Consider raising Standard to £50/subject if adoption proves strong

---

## 4. Market Analysis

### UK Market

| Segment | Schools |
|---------|---------|
| Primary schools | ~20,500 |
| Secondary schools | ~3,500 |
| Independent schools | ~2,500 |
| **Total** | **~26,500** |

### Revenue Scenarios

| Timeframe | Penetration | Schools | Est. Revenue |
|-----------|-------------|---------|-------------|
| Year 1 | 0.01-0.05% | 3-15 | £900 - £4,500 |
| Year 2 | 0.1-0.3% | 25-80 | £7,500 - £24,000 |
| Year 3 | 0.5-1% | 130-265 | £39,000 - £79,500 |
| Year 5 | 2-5% | 530-1,325 | £159,000 - £397,500 |

### Breakeven
- Fixed costs: ~£120-480/year (Railway + Neon + domain)
- AI costs: ~£3/school/year (negligible)
- **Breakeven at ~15 paying schools**

### Comparable UK Products
| Product | Schools | Price |
|---------|---------|-------|
| Sparx Maths | ~2,500 | £1,000-5,000/school |
| Hegarty Maths | ~3,000 | £1,000+/school |
| Educake | ~2,000 | £500+/school |
| GCSEPod | ~1,400 | £1,500+/school |

MarkSnap undercuts all of these significantly.

---

## 5. Education Structure

### UK (Primary Market)

| Key Stage | Years | Ages | School Type |
|-----------|-------|------|-------------|
| KS1 | 1-2 | 5-7 | Primary |
| KS2 | 3-6 | 7-11 | Primary |
| KS3 | 7-9 | 11-14 | Secondary |
| KS4 | 10-11 | 14-16 | Secondary |
| KS5 | 12-13 | 16-18 | Secondary / Sixth Form |

### US (Future Expansion)

| Stage | Grades | School Type |
|-------|--------|-------------|
| Elementary | K-5 | Elementary |
| Middle | 6-8 | Middle School |
| High | 9-12 | High School |

### Implementation
- Region selector at registration (UK default, US later)
- Key stages / grades stored in a configurable table
- All content (questions, tests) tagged with region + stage

---

## 6. Subjects

### Launch Subjects
1. **Maths** (Mathematics)
2. **English**
3. **Science**

### Future Subjects (add as demand grows)
- History, Geography, MFL, Computing, RE, etc.

### Implementation
- Fixed seed subjects at launch (not user-created)
- Super Admin can add new subjects via admin panel
- Schools subscribe per subject (or all via All-Access)

---

## 7. Question Bank Strategy

### Question Sources

| Source | Created By | Shared? | Approval Needed? |
|--------|-----------|---------|-----------------|
| **Curated** | Super Admin | Yes — available to all | No (trusted) |
| **AI Generated** | Premium teachers | After approval | Yes — Super Admin reviews |
| **Teacher Created** | Premium teachers | Private by default | Optional submission for sharing |

### Question Structure
```
Question:
  - text: "What is 3/4 + 1/2?"
  - subject: Maths
  - key_stage: KS2
  - topic: "Fractions"
  - difficulty: Easy | Medium | Hard
  - options: ["5/4", "1", "5/6", "4/6"]
  - correct_answer: A (index 0)
  - distractor_rationale: "Option B: common mistake (treating as whole numbers)..."
  - source: curated | ai_generated | teacher_contributed
  - status: draft | pending_review | approved | rejected
  - created_by: teacher_id (nullable for system questions)
  - vetted: true/false
```

### Content Flywheel
1. Super Admin seeds initial question bank
2. Premium teachers generate questions (AI or manual)
3. Teachers optionally submit questions for sharing
4. Super Admin reviews and approves the best ones
5. Shared bank grows → more value for Standard tier → more subscriptions

---

## 8. AI Test Generation

### Provider
- **OpenAI GPT-4o-mini** (cost-efficient: ~£0.01-0.03 per test)
- Teacher's API key not needed — platform provides (cost covered by subscription)

### Flow
1. Teacher selects: Subject → Topic(s) → Key Stage → Difficulty → Number of questions
2. AI generates MCQs with plausible distractors
3. Teacher reviews, edits, removes as needed
4. Teacher saves test (questions auto-submitted for Super Admin approval)
5. Answer key set automatically from correct answers

### Cost Impact
- At £50/subject/year (Premium), even 100 AI-generated tests = ~£3 in API costs
- Well within margin

---

## 9. Feature Tiers — What Each Plan Gets

### Free (Individual Teacher)
- ✅ Create unlimited tests (manual answer key only)
- ✅ Print answer sheets with QR codes
- ✅ Scan & grade (batch upload + live camera)
- ✅ Simple QLA per test (colour-coded results table)
- ✅ Excel export (single test)
- ❌ No question bank access
- ❌ No progress tracking
- ❌ No AI generation

### Standard (£30/subject/school/year)
- ✅ Everything in Free
- ✅ Browse & use question bank (pick questions by topic)
- ✅ Student progress tracking over time (multi-test trends)
- ✅ Full analysis suite (difficulty indices, item discrimination)
- ✅ Department-wide reporting
- ❌ No AI generation
- ❌ No custom question creation

### Premium (£50/subject/school/year)
- ✅ Everything in Standard
- ✅ AI-generate tests from topics/criteria
- ✅ Create own questions (manual)
- ✅ Submit questions to shared bank

### All-Access (£300/school/year)
- ✅ Everything in Premium
- ✅ All subjects included
- ✅ School-wide analytics dashboard
- ✅ Priority support

---

## 10. Build Phases

### Phase 1: Foundation (Current)
- [x] Core scan flow (create → key → print → scan → grade → export)
- [x] Auth (standalone + school registration)
- [x] Class & student management
- [x] Live scanner
- [ ] Complete school management UI
- [ ] Add school type (primary/secondary) + key stage fields
- [ ] Add region field (UK default, US future)
- [ ] Add tier field (free/standard/premium/all-access)
- [ ] Seed fixed subjects (Maths, English, Science)
- [ ] Wire up subject assignment properly

### Phase 2: Question Bank
- [ ] Question model + topics table
- [ ] Super Admin panel (create/manage/approve questions)
- [ ] Super Admin role + auth middleware
- [ ] Question CRUD API (search by subject/topic/stage/difficulty)
- [ ] Seed initial question bank (Maths KS3 as pilot)

### Phase 3: Test Builder
- [ ] "Build from Bank" flow (teacher picks questions)
- [ ] Auto-generate test (random selection by criteria)
- [ ] Answer key auto-populated from question data
- [ ] Test preview before printing

### Phase 4: AI Generation
- [ ] OpenAI integration (GPT-4o-mini)
- [ ] AI generation UI (select criteria → generate → review)
- [ ] Auto-submit generated questions for approval
- [ ] Rate limiting / usage tracking per school

### Phase 5: Progress & Analytics
- [ ] Student progress over time (multi-test trends)
- [ ] Topic mastery tracking
- [ ] Department / school-wide reports
- [ ] Difficulty & discrimination indices

### Phase 6: Premium Features
- [ ] Subscription / tier gating (middleware)
- [ ] Payment integration (Stripe)
- [ ] Combined question + answer sheet PDF (for primary schools)
- [ ] Test paper PDF generation (questions printed separately)

### Phase 7: International
- [ ] US grade levels (Elementary/Middle/High)
- [ ] US Letter paper size support
- [ ] USD pricing
- [ ] Curriculum alignment tags

---

## 11. Revenue Projections

### Running Costs

| Service | Monthly | Annual |
|---------|---------|--------|
| Railway (backend) | £5-20 | £60-240 |
| Neon PostgreSQL | £0-19 | £0-228 |
| Vercel (frontend) | Free | Free |
| OpenAI API | Variable | ~£3/school |
| Domain | — | ~£10 |
| **Total** | **~£10-40** | **£120-480** |

### Milestones

| Milestone | Schools | Annual Revenue | Annual Profit |
|-----------|---------|---------------|---------------|
| Breakeven | ~15 | ~£4,500 | ~£0 |
| Side income | 50-100 | £15,000-30,000 | £14,000-29,000 |
| Full-time viable | 200+ | £60,000+ | £58,000+ |
| Scaling (need to hire) | 500+ | £150,000+ | £140,000+ |

---

## 12. International Expansion

### Strategy
- **Now:** Build for UK, but design data model to support multiple regions
- **After 50+ UK schools:** Add US support
- **Implementation:** Region selector at registration (not IP detection)

### UK vs US Differences

| Feature | UK | US |
|---------|-----|-----|
| Stages | KS1-KS5 | Grades K-12 |
| Curriculum | National Curriculum (standardised) | State-by-state (Common Core + state standards) |
| Terminology | "Maths", "Year 7" | "Math", "7th Grade" |
| Currency | GBP (£) | USD ($) |
| Paper size | A4 | US Letter (8.5×11") |

### Why UK First
- Standardised curriculum = question bank works everywhere
- US has 50 different standards = much harder to build universal content
- Get product-market fit in UK, then adapt for US

---

## 13. Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-11 | UK-first, US later | Standardised curriculum, simpler to build universal content |
| 2026-03-11 | School types: Primary (KS1-2), Secondary (KS3-5) | Matches UK education system |
| 2026-03-11 | Launch subjects: Maths, English, Science | Core subjects tested in every school |
| 2026-03-11 | Teacher questions are private; AI questions need approval | Prevents low-quality content in shared bank |
| 2026-03-11 | Premium teachers can create questions manually | Not just AI — manual creation adds value |
| 2026-03-11 | OpenAI GPT-4o-mini for AI generation | Cost-efficient (~£0.01-0.03 per test) |
| 2026-03-11 | 4 pricing tiers: Free/Standard/Premium/All-Access | Free = funnel, All-Access = anchor for larger schools |
| 2026-03-11 | Region selector at registration (not IP detection) | More reliable, supports VPNs and traveling users |
