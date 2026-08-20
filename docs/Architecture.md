# Maxenius HRMS - Architecture Documentation

## 1. System Overview
Maxenius HRMS is an enterprise-grade Human Resource & Document Management System designed for role-based access control (RBAC), multi-department employee governance, two-factor authentication (2FA TOTP), cross-user document sharing, financial ledger tracking, and real-time notification dispatch.

The system is built as a decoupled Client-Server architecture:
- **Frontend Layer**: Single Page Application (SPA) built with React 18, TypeScript, TailwindCSS, and Lucide Icons, served via Vite.
- **Backend Layer**: RESTful API powered by Python Flask, SQLAlchemy ORM, Flask-JWT-Extended, and PyOTP for TOTP 2FA governance.
- **Database Layer**: Relational database (SQLite/PostgreSQL compatible) managed via SQLAlchemy models with foreign key constraints and transactional integrity.
- **Media & Document Vault Storage**: Local filesystem storage (`backend/app/uploads/`) with path-sanitized UUID storage keys and access-controlled binary streaming.

---

## 2. High-Level System Architecture Diagram

```mermaid
graph TD
    Client[React 18 SPA + Socket.IO Client] -->|HTTPS REST API / JSON| API[Flask API v1 Gateway]
    Client -->|WSS WebSockets| RealTimeGateway[Socket.IO Real-Time Gateway]
    Client -->|Pre-signed PUT/GET| ObjectStorage[AWS S3 / MinIO Object Storage]
    
    subgraph Backend & Real-Time Gateway
        API --> AuthBP[Auth & 2FA Blueprint]
        API --> ProfileBP[Employees & Profile Blueprint]
        API --> ChatBP[Real-Time Chat & Presigned Files BP]
        API --> DocBP[Document Hub Blueprint]
        
        RealTimeGateway --> RedisPubSub[Redis Cluster Pub/Sub & Presence]
        ChatBP --> S3Service[S3 / MinIO Presigned URL Engine]
    end

    subgraph Async AI Pipeline & Vector Store
        RealTimeGateway -->|@HRBot Event| AsyncWorker[Celery / Async AI Pipeline]
        AsyncWorker --> RAGEngine[HR Chatbot Engine]
        RAGEngine --> VectorStore[(PostgreSQL + pgvector Store)]
    end

    subgraph Data & Storage Layer
        AuthBP & ProfileBP & ChatBP & DocBP --> DB[(PostgreSQL Database)]
    end
```

---

## 3. Core Component Breakdown

### 3.1 Frontend Subsystem (`frontend/src/`)
- **State Management**:
  - `authStore.ts` (Zustand): Persists `user` identity profile, JWT `access_token`, and role privileges in `localStorage`.
- **Layout Framework**:
  - `DashboardLayout.tsx`: Executive navigation header, collapsible sidebar, search drawer, and real-time Notification Bell dropdown.
- **Module Workspaces**:
  - `LoginPage.tsx`: 2-Step Login with Password Visibility Eye toggle, Remember Me, and TOTP PIN Challenge card with countdown timer.
  - `ProfilePage.tsx`: Employee Self-Service (ESS) profile, personal avatar manager, and private document vault.
  - `DocumentsPage.tsx`: Dedicated Team Document Hub with search/filtering, category tags (`HANDOVER`, `MEDICAL`, `EXPENSE_RECEIPT`, `CONTRACT`), list feed, and Share File modal.
  - `EmployeesPage.tsx`, `AttendancePage.tsx`, `LeavePage.tsx`, `PayrollPage.tsx`, `ExpensesPage.tsx`, `RevenuePage.tsx`, `PerformancePage.tsx`, `NoticesPage.tsx`, `AssetsPage.tsx`, `AuditPage.tsx`.

### 3.2 Backend Subsystem (`backend/app/`)
- **Blueprints & API Gateway** (`app/api/v1/`):
  - `auth.py`: Login, 2FA setup, 2FA verify, password hash generation.
  - `employees.py`: Employee directory CRUD, avatar image upload processing, profile update.
  - `documents.py`: File upload streaming, `EmployeeDocument` creation, `DocumentShare` permission mapping, binary download streaming.
  - `notifications.py`: Dynamic notification aggregator (`leave_approval`, `expense_approval`, `asset_approval`, `document_share`, `announcement`, `holiday`).
  - `finance.py`, `expenses.py`, `payroll.py`, `assets.py`, `attendance.py`, `leave.py`, `performance.py`, `audit.py`.
- **Security & RBAC Infrastructure** (`app/core/security.py`):
  - Token decoding supporting both `Authorization: Bearer <token>` headers and URL fallback query parameter `?token=<access_token>` for direct file downloads.
  - Decorators: `@jwt_required()`, `@jwt_required(optional=True)`, `@role_required()`, `@permission_required()`.

---

## 4. Cross-Cutting Concerns

### 4.1 Authentication & 2FA Lifecycle
1. **Password Authentication**: Client posts credentials to `POST /api/v1/auth/login`.
2. **2FA Enforcement**: If user has 2FA enabled, backend returns `requires_2fa: true` and temporary challenge token `temp_token`.
3. **Challenge Completion**: User enters 6-digit TOTP code. Client posts to `POST /api/v1/auth/2fa/verify-login`. Backend validates token using `pyotp.TOTP(secret).verify(code)`.
4. **Session Token**: Backend issues JWT `access_token` stored in frontend `localStorage`.

### 4.2 Authorization & Access Control Matrix
| Resource / Action | Employee (ESS) | Line Manager | HR Manager | Super Admin |
| :--- | :--- | :--- | :--- | :--- |
| **Personal Profile View/Edit** | Self Only | Direct Reports | All | All |
| **Private Vault Upload** | Self Only | Direct Reports | All | All |
| **Share Document with Team** | Yes | Yes | Yes | Yes |
| **Revoke Share Access** | Uploader Only | Uploader Only | Uploader / HR | All |
| **Approve Leave / Expense** | No | Department | All | All |
| **Manage Hardware Assets** | Request Only | View Only | Full Control | Full Control |

### 4.3 Error Handling & Logging
- Uniform JSON Error Payload:
  ```json
  {
    "error": {
      "code": "unauthorized | forbidden | not_found | validation_error",
      "message": "Human-readable diagnostic explanation"
    }
  }
  ```
- **Auditing**: `ActivityLog` model records auditable actions (`user_id`, `action`, `entity_type`, `entity_id`, `metadata_info`, `timestamp`).
