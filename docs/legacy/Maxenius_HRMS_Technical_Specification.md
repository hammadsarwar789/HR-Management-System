# Maxenius HRMS — Technical Requirements & Architecture Specification

**Version:** 1.0
**Stack:** React + Vite + TypeScript (Frontend) · Flask + PostgreSQL (Backend) · REST API

---

## 1. Executive Summary

Maxenius HRMS is a modular, multi-tenant-ready Human Resource Management System built for Maxenius's internal software house operations. It manages the full employee lifecycle — onboarding, attendance, leave, payroll (with tax and 5% security holdback), assets, performance, and compliance/audit — behind a role-based REST API consumed by a React SPA.

This document consolidates the original feature list and README draft into a single, implementation-ready specification: finalized tech stack, system architecture, database schema, REST API contract, repository layout, security model, and delivery roadmap.

---

## 2. Finalized Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA, feature-based architecture |
| Frontend state/data | TanStack Query + Zustand (or Redux Toolkit) | Server cache vs. UI state kept separate |
| UI | Tailwind CSS + a component primitive library (e.g. shadcn/ui) | Consistent design system |
| Backend API | Flask (Python 3.11+) | REST API, application-factory pattern |
| API contract | Flask-Smorest or Flask-RESTX | Gives OpenAPI/Swagger docs for free |
| Validation | Pydantic v2 | Request/response schema validation |
| ORM & migrations | SQLAlchemy 2.0 + Alembic | Explicit migrations, no auto-sync in prod |
| Database | PostgreSQL 15+ | Primary transactional store |
| Cache / sessions | Redis | Session store, rate-limit counters, cache |
| Background jobs | Celery + Redis broker | Payroll runs, PDF generation, biometric sync, reminders |
| Scheduler | Celery Beat | Nightly attendance reconciliation, leave accrual |
| Object storage | AWS S3 or self-hosted MinIO | CNIC/CV/contract documents, payslip PDFs |
| PDF generation | WeasyPrint | Payslips, letters |
| Auth | JWT (access + refresh) + TOTP 2FA | httpOnly refresh cookie |
| API docs | OpenAPI 3.0 / Swagger UI | Auto-generated from schemas |
| Containerization | Docker + Docker Compose | Local + staging parity |
| CI/CD | GitHub Actions | Lint, test, build, migrate, deploy |
| Error tracking | Sentry | Frontend + backend |
| Reverse proxy | Nginx | TLS termination, static asset serving |

Redis/Celery and object storage are included because payroll runs, payslip generation, and biometric ingestion are inherently asynchronous, bursty workloads — running them synchronously inside a request would make the API fragile under load. This is the one addition beyond your literal "Flask, Postgres, REST" list; everything else maps directly to it.

---

## 3. System Architecture

```
                    ┌───────────────────────────────────────────┐
                    │         React + Vite + TS (SPA)            │
                    │   Admin Dashboard  │  Employee ESS Portal   │
                    └───────────────────┬─────────────────────────┘
                                        │ HTTPS / REST (JWT Bearer)
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │        Nginx (TLS, static, reverse proxy)  │
                    └───────────────────┬─────────────────────────┘
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │     Flask API (Gunicorn workers)            │
                    │  Auth · RBAC middleware · Rate limiting     │
                    └───┬───────────┬───────────┬───────────┬────┘
                        │           │           │           │
                        ▼           ▼           ▼           ▼
                 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
                 │ Employee │ │ Attendance│ │ Leave &   │ │ Payroll & │
                 │ & Asset  │ │ & Biometric│ │ Approval │ │ Tax       │
                 │ Service  │ │ Core      │ │ Workflow │ │ Engine    │
                 └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
                      │            │            │            │
                      └────────────┴─────┬──────┴────────────┘
                                          ▼
                    ┌───────────────────────────────────────────┐
                    │              Data & Storage Layer            │
                    │  PostgreSQL (transactional)                 │
                    │  Redis (cache, sessions, Celery broker)     │
                    │  S3 / MinIO (documents, payslips)           │
                    └───────────────────────────────────────────┘
                                          ▲
                    ┌─────────────────────┴─────────────────────┐
                    │   Celery Workers + Beat (async & scheduled) │
                    │  Payroll batch runs · Payslip PDFs          │
                    │  Nightly attendance reconciliation           │
                    │  Biometric device polling · Email/notice     │
                    └───────────────────────────────────────────┘
```

**Request flow:** the SPA never talks to the database directly. Every write goes through Flask, which enforces RBAC + row-level ownership (an `employee` role can only touch rows where `employee_id = current_user.id`), then either commits synchronously (CRUD) or enqueues a Celery task (payroll runs, PDF generation, biometric ingestion) and returns a job reference the frontend can poll.

---

## 4. Functional Requirements by Module

### 4.1 Employee Management
- Create/edit/deactivate employee records; deactivation is soft (status flag), never a hard delete, to preserve payroll/attendance history.
- Fields: employee code, name, CNIC, department, designation, branch/location, employment type (full-time/part-time/contract), joining date, resignation date, emergency contact.
- Document upload (CNIC, CV, certificates) to object storage; retrieved only via short-lived pre-signed URLs.

### 4.2 Roles & Permissions (RBAC)
- Base roles: Super Admin, HR Manager, Department Manager, Employee.
- Custom roles composed from a fixed permission catalog (e.g. `employee:read`, `payroll:approve`, `leave:approve_department`).
- Department Managers are scoped to their own department's employees at the query layer, not just hidden in the UI.

### 4.3 Attendance Management
- Check-in/check-out (manual and biometric).
- Late arrival / early leaving thresholds are configurable per company policy, not hardcoded.
- Overtime accrual, daily/monthly attendance reports.
- Biometric device ingestion endpoint (token-authenticated) + nightly reconciliation job.

### 4.4 Leave Management
- Configurable leave types with annual allowances (Casual, Sick, Annual, etc.).
- Multi-tier approval (Department Manager → HR Manager for certain leave types/durations).
- Real-time leave balance, deducted only on approval, restored on rejection/cancellation.
- Leave history per employee.

### 4.5 Payroll Management
- Salary structure per employee: basic salary + allowances (JSON, flexible per role).
- Deductions: tax bracket, 5% security holdback, other ad-hoc deductions.
- Overtime pay and bonus inputs feed into gross salary.
- Monthly payroll run is a batch job (Celery), not a per-employee synchronous request.
- PDF payslip generation and salary history per employee.

### 4.6 Performance Management
- Goal setting per employee/cycle, KPI tracking, manager feedback, and periodic evaluation cycles.

### 4.7 Holiday Management
- Company and public holidays; holiday calendar feeds attendance and leave calculations (holidays shouldn't count as absences or consume leave).

### 4.8 Assets Management
- Asset registry (laptops, phones, SIMs, office equipment) with serials and status.
- Assignment/return history per employee, per asset.

### 4.9 Expense Management
- Expense request submission with category and receipts, approval workflow, reimbursement tracking, and reporting.

### 4.10 Notices & Announcements
- Company-wide announcements, event notices, birthday wishes, holiday notices — visible on the ESS dashboard.

### 4.11 Employee Self-Service (ESS)
- View/update own profile, download payslips and documents, apply for leave, view attendance history — all scoped to the logged-in employee via row-level access control, not just UI hiding.

### 4.12 Document Management
- Contracts, offer letters, appointment letters, experience letters, company policies — versioned, access-controlled, stored in object storage.

### 4.13 Security
- Login with password + optional TOTP 2FA, password reset flow, activity logs, login history.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | p95 API response time < 300ms for CRUD endpoints; payroll runs execute asynchronously and must not block the request thread |
| Scalability | Stateless Flask workers behind Nginx, horizontally scalable; DB connection pooling (PgBouncer recommended at scale) |
| Availability | Target 99.5%+ uptime for production; health-check endpoints for orchestration/monitoring |
| Data integrity | All multi-step writes (e.g. leave approval + balance deduction) wrapped in DB transactions |
| Backup & DR | Automated nightly PostgreSQL backups with point-in-time recovery; S3 versioning enabled on document buckets |
| Auditability | Every administrative action, salary revision, and asset assignment writes an immutable row to `activity_logs` |
| Data privacy | CNIC and salary data classified as sensitive; access restricted by RBAC + row-level security; encrypted at rest |
| Accessibility | ESS portal targets WCAG 2.1 AA for core flows (profile, payslip, leave application) |

---

## 6. Database Schema

Refined and extended from the original DDL — adds leave balances, permissions catalog, notices, expenses, performance, and audit tables that the module list requires but the original schema didn't yet cover.

```sql
-- ========== 1. AUTH, ROLES & PERMISSIONS ==========
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,      -- e.g. 'payroll:approve'
    description TEXT
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_system_role BOOLEAN DEFAULT FALSE,   -- true for Super Admin/HR/Dept Mgr/Employee
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT REFERENCES roles(id),
    is_active BOOLEAN DEFAULT TRUE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE login_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 2. EMPLOYEE PROFILES ==========
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE employees (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_code VARCHAR(30) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    cnic VARCHAR(20) UNIQUE NOT NULL,
    phone VARCHAR(20),
    department_id INT REFERENCES departments(id),
    designation VARCHAR(100) NOT NULL,
    location VARCHAR(100) DEFAULT 'Main Office',
    employment_type VARCHAR(30) NOT NULL,   -- full_time | part_time | contract
    joining_date DATE NOT NULL,
    resignation_date DATE,
    emergency_contact JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',    -- active | resigned | terminated
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,          -- cnic | cv | certificate | contract | offer_letter
    storage_key TEXT NOT NULL,              -- S3/MinIO object key
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 3. ATTENDANCE & BIOMETRICS ==========
CREATE TABLE attendance (
    id BIGSERIAL PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,            -- present | absent | half_day | on_leave | holiday
    late_minutes INT DEFAULT 0,
    early_leaving_minutes INT DEFAULT 0,
    overtime_hours NUMERIC(4,2) DEFAULT 0.00,
    device_id VARCHAR(50),
    CONSTRAINT unique_employee_daily_attendance UNIQUE (employee_id, date)
);

-- ========== 4. LEAVE MANAGEMENT ==========
CREATE TABLE leave_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    allowed_days_per_year INT NOT NULL,
    requires_hr_approval BOOLEAN DEFAULT FALSE
);

CREATE TABLE leave_balances (
    id SERIAL PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id INT REFERENCES leave_types(id),
    year INT NOT NULL,
    allocated_days NUMERIC(4,1) NOT NULL,
    used_days NUMERIC(4,1) DEFAULT 0,
    UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id INT REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days NUMERIC(4,1) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',   -- pending | approved | rejected | cancelled
    approved_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 5. PAYROLL & SECURITY HOLD ==========
CREATE TABLE salary_structures (
    id SERIAL PRIMARY KEY,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    basic_salary NUMERIC(12,2) NOT NULL,
    allowances JSONB DEFAULT '{}',
    security_deduction_rate NUMERIC(5,2) DEFAULT 5.00,
    tax_bracket_rate NUMERIC(5,2) DEFAULT 0.00,
    effective_from DATE NOT NULL
);

CREATE TABLE payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id),
    month_year DATE NOT NULL,
    basic_salary NUMERIC(12,2) NOT NULL,
    total_allowances NUMERIC(12,2) DEFAULT 0.00,
    overtime_pay NUMERIC(12,2) DEFAULT 0.00,
    bonus NUMERIC(12,2) DEFAULT 0.00,
    tax_deducted NUMERIC(12,2) DEFAULT 0.00,
    security_deduction NUMERIC(12,2) DEFAULT 0.00,
    other_deductions NUMERIC(12,2) DEFAULT 0.00,
    net_salary NUMERIC(12,2) NOT NULL,
    payslip_storage_key TEXT,
    status VARCHAR(20) DEFAULT 'processed', -- pending | processed | failed
    generated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (employee_id, month_year)
);

-- ========== 6. ASSETS ==========
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_tag VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,          -- laptop | mobile | sim | equipment
    model VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100) UNIQUE,
    status VARCHAR(20) DEFAULT 'available'  -- available | assigned | retired | lost
);

CREATE TABLE asset_assignments (
    id SERIAL PRIMARY KEY,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id),
    assigned_date DATE NOT NULL,
    returned_date DATE,
    notes TEXT
);

-- ========== 7. EXPENSES ==========
CREATE TABLE expense_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    receipt_storage_key TEXT,
    status VARCHAR(20) DEFAULT 'pending',   -- pending | approved | rejected | reimbursed
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 8. PERFORMANCE ==========
CREATE TABLE performance_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    cycle VARCHAR(20) NOT NULL,             -- e.g. '2026-H1'
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'in_progress'
);

CREATE TABLE performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES users(id),
    cycle VARCHAR(20) NOT NULL,
    kpi_score NUMERIC(4,2),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 9. HOLIDAYS & ANNOUNCEMENTS ==========
CREATE TABLE holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    type VARCHAR(20) DEFAULT 'public'       -- public | company
);

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(20) DEFAULT 'general', -- general | event | birthday | holiday
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ========== 10. AUDIT ==========
CREATE TABLE activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,           -- e.g. 'salary.updated', 'asset.assigned'
    entity_type VARCHAR(50),
    entity_id TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Indexing note:** add B-tree indexes on every foreign key used in filters (`attendance.employee_id`, `leave_requests.employee_id`, `payroll_runs.employee_id`, etc.) and a composite index on `(employee_id, date)` for attendance reporting queries.

---

## 7. REST API Specification

**Conventions:** base path `/api/v1`, JWT Bearer auth on all routes except `/auth/*`, pagination via `?page=&per_page=`, filtering via query params, consistent error envelope:

```json
{ "error": { "code": "leave_balance_exceeded", "message": "..." } }
```

| Module | Method & Path | Purpose |
|---|---|---|
| Auth | `POST /auth/login` | Email/password login, returns access + refresh token |
| Auth | `POST /auth/refresh` | Rotate access token |
| Auth | `POST /auth/logout` | Revoke refresh token |
| Auth | `POST /auth/2fa/enable`, `/2fa/verify` | TOTP setup and verification |
| Auth | `POST /auth/password/forgot`, `/password/reset` | Password reset flow |
| Employees | `GET/POST /employees`, `GET/PUT/DELETE /employees/{id}` | CRUD |
| Employees | `POST /employees/{id}/documents` | Upload document → object storage |
| Employees | `GET /employees/{id}/documents/{doc_id}/url` | Pre-signed download URL |
| RBAC | `GET/POST /roles`, `GET /permissions` | Role & permission management |
| Attendance | `POST /attendance/biometric-ingest` | Device-token-authenticated ingestion |
| Attendance | `POST /attendance/check-in`, `/check-out` | Manual attendance |
| Attendance | `GET /attendance?employee_id=&from=&to=` | Query attendance |
| Attendance | `GET /attendance/reports/summary` | Aggregated reports |
| Leave | `GET /leave-types`, `GET /leave-balances/{employee_id}` | Reference & balance data |
| Leave | `POST /leave-requests`, `GET /leave-requests` | Apply / list |
| Leave | `PUT /leave-requests/{id}/approve`, `/reject` | Approval workflow |
| Payroll | `POST /payroll/runs` | Trigger monthly run (async, returns job id) |
| Payroll | `GET /payroll/runs/{id}` | Run status + breakdown |
| Payroll | `GET /payroll/runs/{id}/payslip-url` | Pre-signed payslip PDF URL |
| Payroll | `GET /employees/{id}/salary-history` | Historical payroll records |
| Assets | `GET/POST /assets`, `POST /assets/{id}/assign`, `/return` | Registry & assignment |
| Expenses | `POST/GET /expenses`, `PUT /expenses/{id}/approve`, `/reject` | Claims workflow |
| Performance | `POST/GET /performance/goals`, `POST/GET /performance/reviews` | Goals & reviews |
| Holidays | `GET/POST /holidays` | Calendar management |
| Announcements | `GET/POST /announcements` | Company notices |
| Audit | `GET /audit-logs` | Admin-only, filterable by user/action/date |

---

## 8. Repository Structure

```
maxenius-hrms/
├── frontend/                       # React + Vite + TypeScript
│   ├── src/
│   │   ├── api/                    # typed API client per module
│   │   ├── components/             # shared UI primitives
│   │   ├── features/               # feature-sliced: employees/, attendance/, leave/, payroll/...
│   │   │   └── employees/
│   │   │       ├── components/
│   │   │       ├── hooks/
│   │   │       ├── types.ts
│   │   │       └── index.tsx
│   │   ├── layouts/
│   │   ├── lib/                    # axios instance, query client, utils
│   │   ├── pages/                  # route-level views
│   │   ├── store/                  # global client state
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/                        # Flask
│   ├── app/
│   │   ├── api/v1/                 # blueprints: auth, employees, attendance, leaves, payroll, assets, expenses, performance
│   │   ├── core/                   # config, security, jwt handlers, rate limiting
│   │   ├── db/                     # engine, session factory
│   │   ├── models/                 # SQLAlchemy models
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── services/               # business logic: payroll engine, biometric parser
│   │   ├── tasks/                  # Celery tasks
│   │   └── __init__.py             # app factory
│   ├── migrations/                 # Alembic
│   ├── tests/
│   ├── scripts/                    # seed_data.py, cron helpers
│   ├── .env.example
│   ├── requirements.txt
│   ├── Dockerfile
│   └── wsgi.py
│
├── docker-compose.yml
├── docs/                           # ERD, OpenAPI export
└── README.md
```

---

## 9. Security Architecture

- **AuthN:** JWT access token (short-lived, ~15 min) + refresh token in an httpOnly, secure cookie; TOTP-based 2FA optional per user.
- **AuthZ:** RBAC checked at the route level (decorator/middleware) *and* row-level (query filters scoped to `employee_id` or `department_id` for non-admin roles) — UI hiding alone is not sufficient.
- **Password storage:** bcrypt or argon2, never reversible encryption.
- **Rate limiting:** Flask-Limiter on `/auth/*` and biometric ingestion endpoints.
- **File uploads:** MIME-type and size validated server-side before storage; documents are private-by-default, served only via 5-minute pre-signed URLs.
- **Transport:** TLS everywhere (Nginx termination); CORS restricted to known frontend origins.
- **Secrets:** never committed; `.env` local only, real secrets in a vault/secret manager in staging+prod.
- **Audit trail:** every salary revision, role change, and asset assignment writes to `activity_logs` — this table should be append-only (no UPDATE/DELETE grants for the app role).

---

## 10. Background Jobs (Celery)

| Task | Trigger | Notes |
|---|---|---|
| `process_payroll_run` | Manual trigger via `POST /payroll/runs` | Computes gross/net, writes `payroll_runs`, generates payslip PDF |
| `generate_payslip_pdf` | Chained after payroll computation | WeasyPrint → S3/MinIO |
| `reconcile_attendance` | Celery Beat, nightly | Parses raw biometric logs, flags late/absent, computes overtime |
| `poll_biometric_devices` | Celery Beat, every N minutes | For network-restricted devices via local agent |
| `send_leave_notification` | On leave request status change | Email/notification to employee & approver |
| `accrue_monthly_leave` | Celery Beat, monthly | Leave balance accrual per policy |

---

## 11. DevOps & Deployment

- **Local/staging:** `docker-compose.yml` orchestrates frontend, backend, PostgreSQL, Redis, Celery worker, Celery beat, and Nginx.
- **Migrations:** Alembic migrations run as an explicit CI/CD step (`alembic upgrade head`) before the new backend image goes live — never auto-migrate on app boot in production.
- **CI/CD (GitHub Actions):** lint (Ruff/ESLint) → test (pytest/Vitest) → build Docker images → push to registry → run migrations → deploy.
- **Health checks:** `GET /healthz` (DB + Redis connectivity) for orchestrator liveness/readiness probes.
- **Logging:** structured JSON logs from Flask and Celery, shipped to a central log store; Sentry for exception tracking on both frontend and backend.

---

## 12. Testing Strategy

| Layer | Tooling | Coverage target |
|---|---|---|
| Backend unit | pytest | Business logic (payroll engine, leave balance math) |
| Backend integration | pytest + test DB | API endpoints against a real Postgres test instance |
| Frontend unit | Vitest + React Testing Library | Components, hooks |
| E2E | Playwright | Critical flows: login, leave apply/approve, payroll run, payslip download |
| Contract | OpenAPI schema validation in CI | Catches frontend/backend drift |

---

## 13. Implementation Roadmap

**Phase 1 — Foundation (Weeks 1–3)**
Database schema & migrations · JWT auth + 2FA + password reset · RBAC framework · Employee CRUD + ESS profile view.

**Phase 2 — Operational Engine (Weeks 4–6)**
Attendance processing + biometric ingestion · Leave management & approval workflow · Holiday calendar · Announcements · Secured document storage.

**Phase 3 — Financials & Assets (Weeks 7–9)**
Salary structure, tax & 5% security deduction engine · Async payroll runs + PDF payslips · Asset registry & assignment log · Expense claims & reimbursement.

**Phase 4 — Governance & Deployment (Weeks 10–12)**
Performance/KPI module · Full audit trail & activity logs · Attendance/HR analytics & reports · Security hardening, load testing, production deploy.

---

## 14. Environment Variables

```env
# Backend
APP_ENV=production
SECRET_KEY=
JWT_SECRET_KEY=
DATABASE_URL=postgresql://hrms_user:password@localhost:5432/maxenius_hrms
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1

S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET_NAME=maxenius-hrms-documents
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=

# Frontend (.env for Vite — must be prefixed VITE_)
VITE_API_BASE_URL=https://api.maxenius-hrms.com/api/v1
```
