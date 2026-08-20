# Maxenius HRMS - System Limitations & Constraints

## 1. System Constraints & Operating Limits

### 1.1 Document & Media Upload Limits
- **Max File Size**: 25 MB per individual file upload.
- **Allowed Document Formats**: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.docx`, `.xlsx`.
- **Allowed Avatar Formats**: `.jpg`, `.jpeg`, `.png`, `.webp` (Max 5 MB).
- **Storage Location**: Local filesystem directory `backend/app/uploads/`.

### 1.2 Security & Authentication Boundaries
- **JWT Expiration**: Access tokens expire after 24 hours.
- **2FA TOTP Challenge Expiry**: Temporary 2FA tokens expire after 5 minutes (300 seconds).
- **Password Strength**: Minimum 8 characters with at least one uppercase letter, one lowercase letter, and one number.

### 1.3 Environmental Dependencies
- **Backend Environment**: Python 3.10+ with Flask, SQLAlchemy, Werkzeug, PyOTP, and PyJWT.
- **Frontend Environment**: Node.js 18+ with React 18, Vite, and TailwindCSS.
- **Operating Systems Supported**: Windows 10/11, Ubuntu 20.04/22.04 LTS, macOS 12+.
