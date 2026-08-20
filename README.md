# Maxenius HRMS

Maxenius HRMS is an enterprise-grade, modular Human Resource & Document Governance System. It manages the complete employee lifecycle — 2FA TOTP authentication, Employee Self-Service (ESS) profile, dedicated Document Hub & team file sharing, attendance, leave entitlements, payroll (with tax & 5% security holdback), hardware assets, expense claims, revenue ledger, performance KPIs, company notices, and audit logs.

---

## Technical Documentation Suite

Complete system architecture, API schemas, and entity specifications are organized in the [`docs/`](docs/) directory:

- 🏛️ [**System Architecture (`docs/Architecture.md`)**](docs/Architecture.md): Component breakdown, security model, and Mermaid architecture diagrams.
- 📡 [**REST API Reference (`docs/API.md`)**](docs/API.md): Complete endpoint paths, request payloads, response schemas, and status codes.
- 🗄️ [**Database ERD & Schema (`docs/DATABASE.md`)**](docs/DATABASE.md): Entity relationship diagram, table columns, foreign keys, and indexes.
- ✨ [**Feature Inventory (`docs/feature.md`)**](docs/feature.md): Complete list of implemented functional capabilities.
- 🔄 [**End-to-End Workflows (`docs/flow.md`)**](docs/flow.md): Sequence flow diagrams for 2FA, document sharing, and notifications.
- 📐 [**Architecture Decisions (`docs/Decision.md`)**](docs/Decision.md): ADRs documenting design rationale and trade-offs.
- ⚡ [**Concurrency & Workers (`docs/CONCURRENCY_AND_WORKERS.md`)**](docs/CONCURRENCY_AND_WORKERS.md): Processing pipelines, WSGI thread pools, and worker scaling.
- 🛑 [**System Constraints (`docs/constraints.md`)**](docs/constraints.md): Upload limits, security boundaries, and environmental prerequisites.
- 🐛 [**Resolved Bugs & Troubleshooting (`docs/bug.md`)**](docs/bug.md): Resolved root causes and diagnostic instructions.

> 📜 *Note: Historical prompt specifications and design reference documents are archived in [`docs/legacy/`](docs/legacy/).*

---

## Tech Stack

- **Backend**: Python Flask, Flask-SocketIO (WebSockets), SQLAlchemy ORM, Flask-JWT-Extended, PyOTP, Werkzeug Security, SQLite / PostgreSQL.
- **Frontend**: React 18, Vite, TypeScript, Socket.IO Client (WebSockets), TailwindCSS, Lucide Icons, Zustand.


---

## Setup & Running

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python scripts/seed_data.py
python wsgi.py
```
*(Runs REST API server on `http://localhost:5000`)*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*(Runs SPA client on `http://localhost:5173`)*

---

## Default System Credentials (Seeded)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin@maxenius.com` | `Admin@123` |
| **HR Manager** | `hr@maxenius.com` | `Hr@12345` |
| **Department Manager** | `manager@maxenius.com` | `Manager@123` |
| **Employee** | `employee@maxenius.com` | `Employee@123` |
