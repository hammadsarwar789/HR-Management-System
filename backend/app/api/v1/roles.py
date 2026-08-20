from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.auth import Role, Permission, RolePermission
from app.core.security import role_required, log_activity, get_current_user

roles_bp = Blueprint("roles", __name__, url_prefix="/roles")

@roles_bp.route("", methods=["GET"])
@jwt_required()
def list_roles():
    roles = db_session.query(Role).all()
    res = []
    for r in roles:
        perms = [p.code for p in r.permissions]
        res.append({
            "id": r.id,
            "name": r.name,
            "is_system_role": r.is_system_role,
            "permissions": perms
        })
    return jsonify({"roles": res})

@roles_bp.route("/permissions", methods=["GET"])
@jwt_required()
def list_permissions():
    perms = db_session.query(Permission).all()
    res = [{"id": p.id, "code": p.code, "description": p.description} for p in perms]
    return jsonify({"permissions": res})
