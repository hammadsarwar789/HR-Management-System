# Maxenius HRMS - Concurrency, Workers & Background Processing

## 1. Concurrency Architecture
Maxenius HRMS is designed to support concurrent user sessions across enterprise departments:
- **WSGI / Application Server**: Python WSGI server (e.g. Waitress / Gunicorn) running thread worker pools.
- **Database Connection Pooling**: SQLAlchemy scoped sessions (`db_session`) managing transaction pools with explicit rollback handlers (`db_session.rollback()`) on exceptions.

---

## 2. File Upload & Binary Processing Pipeline
When files are submitted via `POST /api/v1/documents/share` or `POST /api/v1/employees/<id>/avatar`:
1. **Stream Buffer**: Flask buffers multipart stream into temp storage.
2. **Sanitization**: Standardized filename generation using `uuid.uuid4()` preventing directory traversal attacks (`../`).
3. **FS Storage**: Stream written directly to disk under `backend/app/uploads/documents/` or `uploads/avatars/`.
4. **Non-Blocking Execution**: Small to medium file writes complete within standard HTTP request cycles (< 100ms).

---

## 3. Asynchronous Task Scaling Roadmap
For high-volume enterprise deployments processing bulk payroll PDFs or sending thousands of email notifications:
- **Task Queue**: Celery / Redis worker integration.
- **Background Mailer**: Asynchronous email delivery for 2FA reset links and document share alerts.
- **Scheduled Cron Jobs**: Automated midnight attendance lock and leave entitlement accrual jobs.
