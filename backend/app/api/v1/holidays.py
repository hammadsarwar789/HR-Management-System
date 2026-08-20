from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.holiday import Holiday, Announcement
from app.core.security import get_current_user, role_required, log_activity

holidays_bp = Blueprint("holidays", __name__, url_prefix="/holidays")

@holidays_bp.route("", methods=["GET"])
@jwt_required()
def list_holidays():
    holidays = db_session.query(Holiday).order_by(Holiday.date.asc()).all()
    res = [{
        "id": h.id,
        "name": h.name,
        "date": h.date.strftime("%Y-%m-%d"),
        "type": h.type or "public",
        "description": getattr(h, "description", "") or "Official company holiday"
    } for h in holidays]
    return jsonify({"holidays": res})

@holidays_bp.route("", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_holiday():
    data = request.get_json() or {}
    name = data.get("name")
    date_str = data.get("date")

    if not name or not date_str:
        return jsonify({"error": {"code": "bad_request", "message": "Name and date required"}}), 400

    h_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    holiday = Holiday(name=name, date=h_date, type=data.get("type", "public"))
    db_session.add(holiday)
    db_session.commit()
    log_activity("holiday.created", entity_type="Holiday", entity_id=holiday.id, user_id=get_current_user().id)
    return jsonify({"message": "Holiday created", "id": holiday.id}), 201

@holidays_bp.route("/<string:holiday_id>", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def update_holiday(holiday_id):
    holiday = db_session.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        return jsonify({"error": {"code": "not_found", "message": "Holiday not found"}}), 404

    data = request.get_json() or {}
    if data.get("name"):
        holiday.name = data.get("name")
    if data.get("date"):
        holiday.date = datetime.strptime(data.get("date"), "%Y-%m-%d").date()
    if data.get("type"):
        holiday.type = data.get("type")

    db_session.commit()
    log_activity("holiday.updated", entity_type="Holiday", entity_id=holiday_id, user_id=get_current_user().id)
    return jsonify({"message": "Holiday updated successfully"})

@holidays_bp.route("/<string:holiday_id>", methods=["DELETE"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def delete_holiday(holiday_id):
    holiday = db_session.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        return jsonify({"error": {"code": "not_found", "message": "Holiday not found"}}), 404

    db_session.delete(holiday)
    db_session.commit()
    log_activity("holiday.deleted", entity_type="Holiday", entity_id=holiday_id, user_id=get_current_user().id)
    return jsonify({"message": "Holiday deleted successfully"})

@holidays_bp.route("/announcements", methods=["GET"])
@jwt_required()
def list_announcements():
    announcements = db_session.query(Announcement).order_by(Announcement.created_at.desc()).all()
    res = []
    for a in announcements:
        res.append({
            "id": a.id,
            "title": a.title,
            "body": a.body or getattr(a, "content", ""),
            "content": a.body or getattr(a, "content", ""),
            "category": a.category or "general",
            "priority": getattr(a, "priority", "GENERAL") or "GENERAL",
            "pinned": getattr(a, "pinned", False) or False,
            "target_dept": getattr(a, "target_dept", "All") or "All",
            "expiry_date": getattr(a, "expiry_date", None),
            "attachment_name": getattr(a, "attachment_name", None),
            "created_at": a.created_at.isoformat()
        })
    return jsonify({"announcements": res})

@holidays_bp.route("/announcements", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_announcement():
    user = get_current_user()
    data = request.get_json() or {}
    title = data.get("title")
    body = data.get("body") or data.get("content")

    if not title or not body:
        return jsonify({"error": {"code": "bad_request", "message": "Title and body required"}}), 400

    ann = Announcement(
        title=title,
        body=body,
        category=data.get("priority", "GENERAL").lower(),
        created_by=user.id
    )
    db_session.add(ann)
    db_session.commit()
    log_activity("announcement.created", entity_type="Announcement", entity_id=ann.id, user_id=user.id)
    return jsonify({"message": "Announcement published", "id": ann.id}), 201

@holidays_bp.route("/announcements/<string:ann_id>", methods=["DELETE"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def delete_announcement(ann_id):
    ann = db_session.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        return jsonify({"error": {"code": "not_found", "message": "Announcement not found"}}), 404

    db_session.delete(ann)
    db_session.commit()
    log_activity("announcement.deleted", entity_type="Announcement", entity_id=ann_id, user_id=get_current_user().id)
    return jsonify({"message": "Announcement deleted successfully"})

