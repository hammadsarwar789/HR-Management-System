from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.audit import ActivityLog
from app.core.security import role_required

audit_bp = Blueprint("audit", __name__, url_prefix="/audit-logs")

@audit_bp.route("", methods=["GET"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def get_audit_logs():
    action = request.args.get("action")
    entity_type = request.args.get("entity_type")
    user_id = request.args.get("user_id")

    query = db_session.query(ActivityLog)

    if action:
        query = query.filter(ActivityLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.filter(ActivityLog.entity_type == entity_type)
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)

    logs = query.order_by(ActivityLog.created_at.desc()).limit(200).all()
    res = []
    for l in logs:
        user_email = l.user.email if l.user else "System"
        res.append({
            "id": l.id,
            "user_id": l.user_id,
            "user_email": user_email,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "metadata": l.metadata_info,
            "created_at": l.created_at.isoformat()
        })
    return jsonify({"audit_logs": res, "total": len(res)})
