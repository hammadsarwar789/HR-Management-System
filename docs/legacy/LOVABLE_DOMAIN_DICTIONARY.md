# Maxenius HRMS — Domain Dictionary & Business Terms Guide

This document defines all business domain concepts, operational rules, calculation formulas, database schemas, and terminology used in **Maxenius HRMS**.

---

## 1. Domain Concepts & Terminology

### 1.1 Auth & RBAC (Role-Based Access Control)
- **User Account**: System credential record storing `email`, `password_hash`, and assigned `role_id`.
- **System Roles**:
  - `Super Admin`: Full system access across all modules and configuration settings.
  - `HR Manager`: Access to employee directory, leave approval, payroll runs, assets, and announcements.
  - `Department Manager`: Scoped manager view for employees belonging to their department.
  - `Employee`: Self-service portal access for viewing personal profile, payslips, requesting leave, and punching attendance.
- **Permission Catalog**: Fine-grained access strings (e.g. `employee:write`, `payroll:approve`, `leave:approve`, `audit:read`).

### 1.2 Employee Lifecycle
- **Employee Code**: Unique sequential identifier assigned to each staff member (e.g., `EMP-001`).
- **CNIC**: Pakistani Computerized National Identity Card number formatted `XXXXX-XXXXXXX-X`.
- **Employment Type**: Contract designation (`full_time`, `part_time`, `contract`).
- **Department**: Organizational division (`Software Engineering`, `Human Resources`, `Quality Assurance`, `Operations`).

### 1.3 Payroll & Financial Engine
- **Basic Salary**: Base contractual pay before allowances or deductions.
- **Allowances**: Additional pay categories stored as JSON (e.g., `{"Housing": 50000, "Medical": 35000, "Transport": 15000}`).
- **5% Security Holdback**:
  $$\text{Security Deduction} = \text{Basic Salary} \times 0.05$$
  - Policy rule: 5.0% of basic salary is held back in security escrow each month.
- **Tax Bracket Rate**: Configurable percentage tax deduction applied against gross salary.
- **Gross Salary Calculation**:
  $$\text{Gross Pay} = \text{Basic Salary} + \sum \text{Allowances} + \text{Overtime Pay} + \text{Bonus}$$
- **Net Payable Salary Calculation**:
  $$\text{Net Pay} = \text{Gross Pay} - (\text{Tax Deducted} + \text{Security Deduction} + \text{Other Deductions})$$
- **Payslip PDF**: Formal PDF document generated via ReportLab detailing line-item breakdown of earnings, tax, security holdback, and net salary.

### 1.4 Attendance & Biometrics
- **Standard Work Shift**: 09:00 AM to 06:00 PM (9 hours).
- **Late Arrival Minutes**: Minutes elapsed past 09:00 AM upon Check-In.
- **Early Leaving Minutes**: Minutes remaining before 06:00 PM upon Check-Out.
- **Overtime Hours**: Time worked past 06:00 PM (minimum threshold 30 minutes).
- **Biometric Device Ingestion**: Token-authenticated REST payload sent from biometric hardware scanners (`BIOMETRIC-GATE-01`).

### 1.5 Leave Management
- **Leave Types**: Categorized allowances per calendar year:
  - `Casual Leave`: 10 days/year.
  - `Sick Leave`: 10 days/year.
  - `Annual Paid Leave`: 14 days/year (requires HR approval).
- **Realtime Balance Deduction**: Deducted from allocated balance upon approval; restored if rejected or cancelled.

### 1.6 Assets & Expenses
- **Asset Tag**: Unique hardware asset label (e.g., `MX-LAP-101`).
- **Asset Categories**: `laptop`, `mobile`, `sim`, `equipment`.
- **Reimbursement Claim**: Expense request submitted by employee with category, amount, description, and receipt image.

### 1.7 Audit Trail
- **Activity Log**: Immutable audit record storing `user_id`, `action` string (e.g., `payroll.run_triggered`), `entity_type`, `entity_id`, and `metadata` JSON.

---

## 2. PostgreSQL Database Schema Map

```sql
users (id UUID, email, password_hash, role_id, is_active, last_login_at)
roles (id, name, is_system_role)
permissions (id, code, description)
role_permissions (role_id, permission_id)

departments (id, name, manager_id)
employees (id UUID, employee_code, first_name, last_name, cnic, phone, department_id, designation, location, employment_type, joining_date, status)

attendance (id, employee_id, date, check_in, check_out, status, late_minutes, early_leaving_minutes, overtime_hours, device_id)

leave_types (id, name, allowed_days_per_year, requires_hr_approval)
leave_balances (id, employee_id, leave_type_id, year, allocated_days, used_days)
leave_requests (id UUID, employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by)

salary_structures (id, employee_id, basic_salary, allowances JSON, security_deduction_rate, tax_bracket_rate, effective_from)
payroll_runs (id UUID, employee_id, month_year, basic_salary, total_allowances, overtime_pay, bonus, tax_deducted, security_deduction, other_deductions, net_salary, status)

assets (id UUID, asset_tag, category, model, serial_number, status)
asset_assignments (id, asset_id, employee_id, assigned_date, returned_date, notes)

expense_requests (id UUID, employee_id, category, amount, description, status, approved_by)
performance_goals (id UUID, employee_id, cycle, title, description, status)
performance_reviews (id UUID, employee_id, reviewer_id, cycle, kpi_score, feedback)
holidays (id, name, date, type)
announcements (id UUID, title, body, category, created_by)
activity_logs (id, user_id, action, entity_type, entity_id, metadata_info)
```
