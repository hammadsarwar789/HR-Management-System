from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request, decode_token
from werkzeug.security import generate_password_hash, check_password_hash
from app.db.session import db_session
from app.models.auth import User, Role, Permission
from app.models.audit import ActivityLog

def hash_password(password: str) -> str:
    return generate_password_hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)

def get_current_user() -> User:
    user_id = None
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
    except Exception:
        # Fallback to URL query parameter ?token= for direct file views/downloads
        token = request.args.get("token")
        if token:
            try:
                decoded = decode_token(token)
                user_id = decoded.get("sub")
            except Exception:
                pass

    if not user_id:
        return None

    user = db_session.query(User).filter(User.id == str(user_id)).first()
    return user

def permission_required(permission_code: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or not user.is_active:
                return jsonify({"error": {"code": "unauthorized", "message": "User inactive or unauthenticated"}}), 401
            
            # Super admin override
            if user.role and user.role.name == "Super Admin":
                return fn(*args, **kwargs)
            
            # Check permissions catalog
            user_permissions = []
            if user.role and user.role.permissions:
                user_permissions = [p.code for p in user.role.permissions]
            
            if permission_code not in user_permissions:
                return jsonify({"error": {"code": "forbidden", "message": f"Missing required permission: {permission_code}"}}), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or not user.is_active:
                return jsonify({"error": {"code": "unauthorized", "message": "User inactive or unauthenticated"}}), 401
            
            if user.role and (user.role.name in roles or user.role.name == "Super Admin"):
                return fn(*args, **kwargs)
            
            return jsonify({"error": {"code": "forbidden", "message": "Insufficient role privileges"}}), 403
        return wrapper
    return decorator

def log_activity(action: str, entity_type: str = None, entity_id: str = None, extra_metadata: dict = None, user_id: str = None):
    """Log an auditable activity. Use extra_metadata for additional context (stored as metadata_info)."""
    try:
        log = ActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            metadata_info=extra_metadata or {}
        )
        db_session.add(log)
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"Error logging activity: {e}")
