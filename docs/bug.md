# Maxenius HRMS - Resolved Bugs & Troubleshooting Guide

## 1. Resolved System Issues & Root-Cause Fixes

### Bug #001: Header Avatar Photo Cache Mismatch
- **Symptom**: Updating profile picture in ESS Profile page updated the card image but top navigation header avatar remained unchanged or blank.
- **Root Cause**: Top header in `DashboardLayout.tsx` cached user state from `authStore` without re-fetching or broadcasting avatar updates.
- **Fix**: Added global avatar sync event trigger and updated `authStore` user object on avatar POST completion.

### Bug #002: FormData Key Mismatch on File Upload
- **Symptom**: Submitting file upload triggered `"No document file attached"` error response from backend.
- **Root Cause**: Frontend appended key `'document'` while backend endpoint expected `'file'` (or vice versa).
- **Fix**: Standardized frontend payload to append both `'file'` and `'document'` keys to `FormData` and removed manual `Content-Type` header overrides, allowing browser multi-part boundaries to format naturally.

### Bug #003: "Untitled Document" Display Name Defect
- **Symptom**: Document vault listed files as `"Untitled Document"` instead of user-entered custom title.
- **Root Cause**: Backend storage key JSON payload property alias mismatch (`document_title` vs `title`).
- **Fix**: Standardized backend title serialization to check `payload.get('title') || payload.get('document_title') || payload.get('document_name')`.

### Bug #004: Direct File Link `401 Missing Authorization Header` Error
- **Symptom**: Clicking "VIEW & DOWNLOAD" opened `http://localhost:5000/api/v1/documents/<id>/download` in a browser tab displaying `{"msg": "Missing Authorization Header"}`.
- **Root Cause**: Browser tab navigation (`<a href="..." target="_blank">`) does not send custom HTTP `Authorization` headers.
- **Fix**: Updated `get_current_user()` to decode JWT from URL parameter `?token=<access_token>` when HTTP header is absent, and set `@jwt_required(optional=True)` on download route.

### Bug #005: Unread Notification & Document Status Sync Defect
- **Symptom**: Clicking "VIEW & DOWNLOAD" opened file but left the document status stuck on `"UNREAD / PENDING RECEIPT"`.
- **Root Cause**: Download route streamed file bytes but did not trigger an explicit client state update.
- **Fix**: Created `PATCH /api/v1/documents/shares/<share_id>/view` endpoint and attached `handleMarkViewed` to download button, updating local state to `"ACKNOWLEDGED / VIEWED"` and decrementing unread counts.

---

## 2. Troubleshooting Steps
1. **TypeScript Errors**: Run `npx tsc --noEmit` inside `frontend/` directory.
2. **Database Reset / Migration**: Re-run `py wsgi.py` to auto-initialize SQLite/SQLAlchemy schema tables.
3. **2FA Lockout Reset**: Super Admin can clear user TOTP secret via database query `UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE email='...'`.
