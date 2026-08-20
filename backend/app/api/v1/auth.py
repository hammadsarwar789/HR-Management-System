from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity, decode_token
from app.db.session import db_session
from app.models.auth import User, LoginHistory
from app.core.security import verify_password, log_activity, get_current_user, hash_password
from app.services.totp_service import (
    generate_totp_secret,
    get_totp_uri,
    generate_qr_code_base64,
    verify_totp_code,
    generate_backup_codes
)

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

def serialize_user_dto(user):
    """Serialize User object with role, permissions, 2FA status, and employee details."""
    role_name = user.role.name if user.role else "Employee"
    permissions = [p.code for p in user.role.permissions] if user.role and user.role.permissions else []

    emp_data = None
    if user.employee:
        em_info = user.employee.emergency_contact or {}
        emp_data = {
            "id": user.employee.id,
            "employee_code": user.employee.employee_code,
            "first_name": user.employee.first_name,
            "last_name": user.employee.last_name,
            "designation": user.employee.designation,
            "department": user.employee.department.name if user.employee.department else None,
            "profile_picture_url": em_info.get("profile_picture_url", ""),
            "gender": em_info.get("gender", "Unspecified")
        }

    return {
        "id": user.id,
        "email": user.email,
        "role": role_name,
        "permissions": permissions,
        "two_factor_enabled": bool(user.two_factor_enabled),
        "employee": emp_data
    }

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": {"code": "bad_request", "message": "Email and password required"}}), 400

    user = db_session.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        if user:
            history = LoginHistory(user_id=user.id, ip_address=request.remote_addr, user_agent=request.user_agent.string, success=False)
            db_session.add(history)
            db_session.commit()
        return jsonify({"error": {"code": "invalid_credentials", "message": "Invalid email or password"}}), 401

    if not user.is_active:
        return jsonify({"error": {"code": "user_inactive", "message": "Account is deactivated"}}), 403

    user.last_login_at = datetime.now(timezone.utc)
    history = LoginHistory(user_id=user.id, ip_address=request.remote_addr, user_agent=request.user_agent.string, success=True)
    db_session.add(history)
    db_session.commit()

    # Step 1 Check: If 2FA is enabled, require second step
    if user.two_factor_enabled:
        temp_token = create_access_token(
            identity=user.id,
            additional_claims={"type": "2fa_pending"},
            expires_delta=timedelta(minutes=10)
        )
        return jsonify({
            "requires_2fa": True,
            "temp_token": temp_token,
            "email": user.email
        }), 200

    # Direct login if 2FA is inactive
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    log_activity("user.login", entity_type="User", entity_id=user.id, user_id=user.id)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": serialize_user_dto(user)
    })

@auth_bp.route("/2fa/verify-login", methods=["POST"])
def verify_2fa_login():
    """Verify 6-digit TOTP code or backup recovery code during two-step login."""
    data = request.get_json() or {}
    temp_token = data.get("temp_token")
    code = data.get("code") or data.get("backup_code")

    if not temp_token or not code:
        return jsonify({"error": {"code": "bad_request", "message": "temp_token and 6-digit TOTP code (or recovery code) required"}}), 400

    try:
        decoded = decode_token(temp_token)
        if decoded.get("type") != "2fa_pending":
            return jsonify({"error": {"code": "invalid_token", "message": "Invalid session state for 2FA verification"}}), 401
        user_id = decoded.get("sub")
    except Exception:
        return jsonify({"error": {"code": "invalid_token", "message": "Expired or invalid temporary session token"}}), 401

    user = db_session.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active or not user.two_factor_enabled:
        return jsonify({"error": {"code": "invalid_state", "message": "User 2FA setup not active"}}), 400

    code_clean = str(code).strip().upper()
    totp_valid = verify_totp_code(user.two_factor_secret, code_clean)
    backup_valid = False

    # Check Backup Recovery Codes if TOTP code fails
    if not totp_valid and user.backup_codes and isinstance(user.backup_codes, list):
        if code_clean in user.backup_codes:
            backup_valid = True
            # Consume and remove the used backup code
            user.backup_codes.remove(code_clean)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(user, "backup_codes")
            db_session.commit()

    if not totp_valid and not backup_valid:
        return jsonify({"error": {"code": "invalid_2fa", "message": "Invalid 2FA code or backup recovery code"}}), 400

    # Issue Full Tokens upon successful verification
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    log_activity("user.2fa_login", entity_type="User", entity_id=user.id, user_id=user.id)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": serialize_user_dto(user)
    })

@auth_bp.route("/2fa/generate", methods=["POST"])
@jwt_required()
def generate_2fa_setup():
    """Generate TOTP Base32 secret and Base64 QR code image for initial setup."""
    user = get_current_user()
    if not user:
        return jsonify({"error": {"code": "not_found", "message": "User not found"}}), 404

    secret = generate_totp_secret()
    otp_uri = get_totp_uri(user.email, secret)
    qr_code_base64 = generate_qr_code_base64(otp_uri)

    return jsonify({
        "secret": secret,
        "otp_uri": otp_uri,
        "qr_code_base64": qr_code_base64
    })

@auth_bp.route("/2fa/enable", methods=["POST"])
@jwt_required()
def enable_2fa():
    """Verify submitted 6-digit TOTP code and activate 2FA with generated backup recovery codes."""
    user = get_current_user()
    if not user:
        return jsonify({"error": {"code": "not_found", "message": "User not found"}}), 404

    data = request.get_json() or {}
    secret = data.get("secret")
    code = data.get("code")

    if not secret or not code:
        return jsonify({"error": {"code": "bad_request", "message": "Secret and 6-digit TOTP code required"}}), 400

    if not verify_totp_code(secret, str(code)):
        return jsonify({"error": {"code": "invalid_code", "message": "Invalid TOTP verification code. Ensure your authenticator app time is synced."}}), 400

    backup_codes = generate_backup_codes(8)

    user.two_factor_enabled = True
    user.two_factor_secret = secret
    user.backup_codes = backup_codes
    db_session.commit()

    log_activity("user.2fa_enabled", entity_type="User", entity_id=user.id, user_id=user.id)

    return jsonify({
        "message": "Two-Factor Authentication (2FA) successfully enabled",
        "backup_codes": backup_codes
    })

@auth_bp.route("/2fa/disable", methods=["POST"])
@jwt_required()
def disable_2fa():
    """Disable 2FA after password and code verification."""
    user = get_current_user()
    if not user:
        return jsonify({"error": {"code": "not_found", "message": "User not found"}}), 404

    data = request.get_json() or {}
    password = data.get("current_password")
    code = data.get("code")

    if not password:
        return jsonify({"error": {"code": "bad_request", "message": "Current password is required to disable 2FA"}}), 400

    if not verify_password(password, user.password_hash):
        return jsonify({"error": {"code": "invalid_credentials", "message": "Incorrect current password"}}), 400

    if code:
        code_clean = str(code).strip().upper()
        totp_valid = verify_totp_code(user.two_factor_secret, code_clean)
        backup_valid = user.backup_codes and code_clean in user.backup_codes if isinstance(user.backup_codes, list) else False
        if not totp_valid and not backup_valid:
            return jsonify({"error": {"code": "invalid_code", "message": "Invalid 2FA verification code"}}), 400

    user.two_factor_enabled = False
    user.two_factor_secret = None
    user.backup_codes = None
    db_session.commit()

    log_activity("user.2fa_disabled", entity_type="User", entity_id=user.id, user_id=user.id)

    return jsonify({"message": "Two-Factor Authentication (2FA) has been disabled"})

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_me():
    user = get_current_user()
    if not user:
        return jsonify({"error": {"code": "not_found", "message": "User not found"}}), 404

    return jsonify({
        "user": serialize_user_dto(user)
    })

@auth_bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    user = get_current_user()
    if not user:
        return jsonify({"error": {"code": "not_found", "message": "User not found"}}), 404

    data = request.get_json() or {}
    current_pw = data.get("current_password")
    new_pw = data.get("new_password")

    if not current_pw or not new_pw:
        return jsonify({"error": {"code": "bad_request", "message": "Current password and new password are required"}}), 400

    if len(new_pw) < 6:
        return jsonify({"error": {"code": "bad_request", "message": "New password must be at least 6 characters long"}}), 400

    if not verify_password(current_pw, user.password_hash):
        return jsonify({"error": {"code": "invalid_credentials", "message": "Current password is incorrect"}}), 400

    user.password_hash = hash_password(new_pw)
    db_session.commit()
    log_activity("auth.password_changed", entity_type="User", entity_id=user.id, user_id=user.id)

    return jsonify({"message": "Password updated successfully"})

@auth_bp.route("/reset-employee-password/<string:emp_id>", methods=["POST"])
@jwt_required()
def reset_employee_password(emp_id):
    current_user = get_current_user()
    if not current_user or not current_user.role or current_user.role.name not in ["Super Admin", "HR Manager"]:
        return jsonify({"error": {"code": "forbidden", "message": "Insufficient role privileges"}}), 403

    data = request.get_json() or {}
    new_pw = data.get("new_password", "Employee@123")

    if len(new_pw) < 6:
        return jsonify({"error": {"code": "bad_request", "message": "New password must be at least 6 characters long"}}), 400

    target_user = db_session.query(User).filter(User.id == emp_id).first()
    if not target_user:
        return jsonify({"error": {"code": "not_found", "message": "Employee account not found"}}), 404

    target_user.password_hash = hash_password(new_pw)
    db_session.commit()
    log_activity("auth.employee_password_reset", entity_type="User", entity_id=target_user.id, user_id=current_user.id)

    return jsonify({"message": f"Password for employee successfully updated to: {new_pw}"})
