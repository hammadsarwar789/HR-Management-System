# Maxenius HRMS - Implemented Feature Inventory

## 1. Authentication & Governance
- **Password Visibility Toggle**: Interactive `Eye` / `EyeOff` control for masking/unmasking passwords safely.
- **Remember Me & Enter Key Support**: Seamless form submission on `Enter` key with session email retention.
- **Two-Step TOTP Challenge**: 2FA challenge modal featuring a 5-minute countdown clock, 6-digit PIN input, and backup recovery code verification.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions across 4 primary roles: `Super Admin`, `HR Manager`, `Department Manager`, and `Employee`.

---

## 2. Dedicated Team Document Hub (`/documents`)
- **Clean ESS Separation**: Personal profile (`/profile`) retains `MY PRIVATE VAULT` (CNIC, Passport, Degrees) while all team file sharing, cross-user handovers, and policy announcements are housed in `/documents`.
- **Search & Multi-Filter Workspace**: Real-time title/uploader search, category tags (`PROJECT HANDOVER`, `MEDICAL PROOF`, `EXPENSE RECEIPT`, `CONTRACT / INCREMENT`, `COMPANY POLICY`, `GENERAL ATTACHMENT`), and sorting options.
- **Access Guarded Downloading**: Secure binary streaming via `/api/v1/documents/<doc_id>/download` using JWT header or `?token=<access_token>` query parameters.
- **Read Receipt & Revocation Control**: Real-time `UNREAD / PENDING RECEIPT` (amber) transition to `ACKNOWLEDGED / VIEWED` (green checkmark) upon file view, with one-click access revocation by uploaders.

---

## 3. Real-Time Notification Center
- **Top Navigation Bell Icon**: Dynamic unread counter badge.
- **Automated Dispatch**: System dispatches notifications for leave requests, expense submissions, asset review, and new document shares.
- **Document Notification Integration**: Sharing a document instantly generates an in-app notification linking directly to `/documents`.

---

## 4. Employee Self-Service (ESS) & Directory
- **Personal Avatar Manager**: Single-click image upload with automatic canvas crop and instant top-header avatar synchronization.
- **Employee Directory**: Departmental filtering, job title tags, contact cards, and manager reporting lines.
- **Financial Ledger & Expense Tracking**: Expense claim submission, receipt preview, multi-tier manager approval workflow, and financial ledger logging.
