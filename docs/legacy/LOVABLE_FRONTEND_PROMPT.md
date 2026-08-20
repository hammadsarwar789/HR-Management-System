# Maxenius HRMS — Master Frontend Prompt for Lovable AI

This document provides a comprehensive, production-ready specification and prompt for **Lovable AI** (lovable.dev) to generate or rebuild the frontend for **Maxenius HRMS** (Human Resource Management System).

---

## 1. Executive Prompt Overview for Lovable AI

> **Prompt to copy into Lovable AI:**
> 
> "Build a modern, high-performance enterprise HR Management System (HRMS) web application called **Maxenius HRMS**.
>
> The design must feature a dark-mode glassmorphic aesthetic (deep slate `#0f172a` / `#020617` backgrounds, blurred semi-transparent cards `backdrop-blur-md`, subtle border highlights, and vibrant teal `#14b8a6` / cyan `#06b6d4` accents).
>
> The app connects to a REST API at `http://localhost:5000/api/v1` (with `Authorization: Bearer <token>` headers). It must support 4 primary roles: **Super Admin**, **HR Manager**, **Department Manager**, and **Employee**.
>
> Mandatory features:
> 1. **Authentication & Session**: Login form with email/password, quick demo role switch buttons, JWT storage, auto logout on 401.
> 2. **Dashboard**: Executive summary KPI cards (Total Staff, Present Today, Pending Leaves, Monthly Payroll status), announcements feed, quick check-in widget.
> 3. **Employee Directory**: Filterable/searchable table, department filters, add/edit employee drawer with salary structure input (Basic Pay, Allowances, Tax %, **5% Security Holdback %**).
> 4. **Attendance & Biometrics**: Punch in/out action, late arrival minutes counter, overtime tracking, daily logs, biometric hardware stream simulation button.
> 5. **Leave Management**: Entitlement cards (Casual, Sick, Annual), request leave modal, real-time balance check, manager approval/rejection queue.
> 6. **Payroll Engine & 5% Security Holdback**: Run batch payroll button, earnings vs deductions breakdown, **5% Security Holdback highlight box**, PDF payslip download simulator.
> 7. **Assets Registry**: Laptop/Mobile/SIM inventory, serial number search, assign to employee modal, mark returned.
> 8. **Expense Claims**: Submit claim with category and amount, manager approval workflow.
> 9. **Performance & KPIs**: Goal setting cards, KPI evaluation score breakdown (out of 5.0), reviewer feedback.
> 10. **Holidays & Bulletins**: Company announcements feed, public/company holiday schedule timeline.
> 11. **Immutable Audit Logs**: Admin-only activity log table with timestamp, user, action badge, and JSON metadata viewer."

---

## 2. Project Domain Glossary & Terms Dictionary

Use these exact terms and business rules across the UI:

| Domain Term | Technical Definition & Business Rule | UI Display & Component Rule |
|---|---|---|
| **Maxenius HRMS** | Internal software house HR & Payroll Management platform. | Header logo badge with `MAXENIUS HRMS ENTERPRISE`. |
| **5% Security Holdback** | Mandatory operational policy: 5.0% of the employee's **basic salary** is withheld as an escrowed security holdback each month. | Highlighted in green/teal boxes on Payroll & Employee Salary modal. Formula: `Basic Salary * 0.05`. |
| **Basic Salary** | Contracted base pay amount in PKR before allowances or deductions. | Form input & table column formatted as currency `PKR X,XXX.00`. |
| **Allowances** | Flexible JSON map of earnings (Housing, Medical, Transport). | Summed into `Total Allowances`. |
| **Gross Salary** | `Basic Salary + Allowances + Overtime Pay + Bonus`. | Total earnings figure. |
| **Net Payable Salary** | `Gross Salary - (Tax Deducted + 5% Security Deduction + Other Deductions)`. | Large prominent green banner on payslips and payroll table. |
| **Employee Code** | Unique identifier formatted as `EMP-001`, `EMP-002`. | Monospace font (`font-mono`), teal badge. |
| **CNIC** | Computerized National Identity Card number formatted as `42101-XXXXXXX-X`. | Monospace input with format validation. |
| **Department Scoping** | **Department Managers** can only view employees, attendance, and leave requests for their own assigned department. | Filter applied automatically by API layer & indicated by UI scoping pills. |
| **RBAC Roles** | 4 system roles: `Super Admin`, `HR Manager`, `Department Manager`, `Employee`. | Role badge next to user profile. |
| **Biometric Ingestion** | Hardware clock-in event stream from network devices (`BIOMETRIC-01`). | Simulated via API button `POST /attendance/biometric-ingest`. |
| **Late Arrival Minutes** | Calculated if Check-In time occurs after standard 09:00 AM work start. | Displayed as `+Xm` in amber font. |
| **Overtime Hours** | Calculated if Check-Out occurs after 06:00 PM standard shift (min 30 mins). | Displayed as `X.Xh` in cyan font. |
| **Leave Entitlement Balance** | Real-time balance allocated per year (Casual: 10d, Sick: 10d, Annual: 14d). Balance is deducted immediately on approval and restored on rejection. | Progress bar / counter cards showing `Used / Total`. |
| **Activity Log (Audit Trail)** | Immutable log of administrative actions (`salary.updated`, `leave.approved`, `payroll.run_triggered`). | Admin-only filterable data table with JSON payload inspector. |

---

## 3. Complete REST API Specifications

**Base URL:** `http://localhost:5000/api/v1`  
**Authentication Header:** `Authorization: Bearer <access_token>`

### 3.1 Authentication
- `POST /auth/login`
  - **Body:** `{ "email": "admin@maxenius.com", "password": "Admin@123" }`
  - **Response:** `{ "access_token": "...", "user": { "id": "...", "email": "...", "role": "Super Admin", "permissions": [...], "employee": {...} } }`
- `GET /auth/me`
  - **Response:** `{ "user": { ... } }`

### 3.2 Employee Management
- `GET /employees?search={query}&department_id={id}&status={active}`
  - **Response:** `{ "employees": [ { "id": "...", "employee_code": "EMP-001", "first_name": "Ali", "last_name": "Khan", "cnic": "...", "department_name": "Software Engineering", "designation": "Developer", "status": "active" } ], "total": 1 }`
- `POST /employees`
  - **Body:** `{ "email": "...", "password": "...", "first_name": "...", "last_name": "...", "cnic": "...", "employee_code": "EMP-006", "designation": "...", "department_id": 1, "basic_salary": 180000, "security_deduction_rate": 5.0, "tax_bracket_rate": 2.5, "joining_date": "2026-08-01" }`

### 3.3 Attendance & Biometrics
- `GET /attendance?employee_id={id}&from={date}&to={date}`
  - **Response:** `{ "attendance": [ { "id": 1, "employee_name": "Ali Khan", "date": "2026-08-13", "check_in": "08:55:00", "check_out": "18:15:00", "status": "present", "late_minutes": 0, "overtime_hours": 0.25, "device_id": "BIOMETRIC-01" } ] }`
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `POST /attendance/biometric-ingest`
  - **Body:** `{ "employee_code": "EMP-004", "timestamp": "2026-08-13 09:05:00", "device_id": "GATE-01", "event_type": "check_in" }`

### 3.4 Leave Management
- `GET /leave/types`
- `GET /leave/balances/{employee_id}`
  - **Response:** `{ "year": 2026, "balances": [ { "leave_type_name": "Casual Leave", "allocated_days": 10.0, "used_days": 2.0, "remaining_days": 8.0 } ] }`
- `GET /leave/requests`
- `POST /leave/requests`
  - **Body:** `{ "leave_type_id": 1, "start_date": "2026-08-20", "end_date": "2026-08-22", "reason": "Family function" }`
- `PUT /leave/requests/{id}/approve`
- `PUT /leave/requests/{id}/reject`
  - **Body:** `{ "rejection_reason": "Project deadline" }`

### 3.5 Payroll Engine & 5% Security Holdback
- `GET /payroll/runs`
  - **Response:** `{ "payroll_runs": [ { "id": "...", "employee_name": "Ali Khan", "employee_code": "EMP-004", "month_year": "2026-08", "basic_salary": 180000.0, "total_allowances": 50000.0, "overtime_pay": 0.0, "tax_deducted": 5750.0, "security_deduction": 9000.0, "net_salary": 215250.0, "status": "processed" } ] }`
- `POST /payroll/runs`
  - **Body:** `{ "year": 2026, "month": 8 }`
- `GET /payroll/runs/{id}/payslip-pdf`
  - Returns binary PDF file for download.

### 3.6 Assets, Expenses, Performance, Notices, Audit
- `GET /assets` | `POST /assets` | `POST /assets/{id}/assign` | `POST /assets/{id}/return`
- `GET /expenses` | `POST /expenses` | `PUT /expenses/{id}/approve`
- `GET /performance/goals` | `GET /performance/reviews`
- `GET /holidays` | `GET /holidays/announcements`
- `GET /audit-logs`

---

## 4. UI Page Routes & Navigation Structure

```
/login                 -> Glassmorphic Login card with preset role buttons
/dashboard             -> Executive Overview, KPI cards, Announcements Feed
/employees             -> Employee Directory Table, Search/Filter, Add Drawer
/attendance            -> Punch Logs, Late Arrival Mins, Biometric Test Button
/leave                 -> Entitlement Balance Cards, Leave Request Form, Approval Queue
/payroll               -> Batch Payroll Runner, 5% Security Holdback Table, Payslip PDF
/assets                -> Laptop/Mobile/SIM Registry & Assignment Drawer
/expenses              -> Expense Claim Submissions & Reimbursement Queue
/performance           -> Quarterly Goals & Manager Review Scores
/notices               -> Company Bulletins & Public Holiday Calendar
/audit                 -> Immutable Activity Logs (Admin Only)
```

---

- **Glassmorphism Class Utility:**
  ```css
  .glass-card {
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  ```
- **Font Typography:** `Plus Jakarta Sans` or `Inter`. Monospace for codes (`EMP-001`, CNICs, Amounts).
