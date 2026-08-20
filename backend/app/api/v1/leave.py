from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.models.leave import LeaveType, LeaveBalance, LeaveRequest
from app.services.leave_service import create_leave_request, approve_leave_request, reject_leave_request
from app.core.security import get_current_user, role_required, log_activity

leave_bp = Blueprint("leave", __name__, url_prefix="/leave")

@leave_bp.route("/types", methods=["GET"])
@jwt_required()
def list_leave_types():
    types = db_session.query(LeaveType).all()
    res = [{"id": t.id, "name": t.name, "allowed_days_per_year": t.allowed_days_per_year, "requires_hr_approval": t.requires_hr_approval} for t in types]
    return jsonify({"leave_types": res})

@leave_bp.route("/balances/<string:emp_id>", methods=["GET"])
@jwt_required()
def get_leave_balances(emp_id):
    current_user = get_current_user()
    if current_user.role and current_user.role.name == "Employee" and current_user.id != emp_id:
        return jsonify({"error": {"code": "forbidden", "message": "Access restricted"}}), 403

    current_year = datetime.now().year
    balances = db_session.query(LeaveBalance).filter(
        LeaveBalance.employee_id == emp_id,
        LeaveBalance.year == current_year
    ).all()

    res = []
    for b in balances:
        res.append({
            "id": b.id,
            "leave_type_id": b.leave_type_id,
            "leave_type_name": b.leave_type.name if b.leave_type else None,
            "year": b.year,
            "allocated_days": float(b.allocated_days),
            "used_days": float(b.used_days),
            "remaining_days": float(b.allocated_days - b.used_days)
        })

    return jsonify({"year": current_year, "balances": res})

@leave_bp.route("/requests", methods=["GET"])
@jwt_required()
def list_leave_requests():
    current_user = get_current_user()
    query = db_session.query(LeaveRequest)

    if current_user.role and current_user.role.name == "Employee":
        query = query.filter(LeaveRequest.employee_id == current_user.id)
    elif current_user.role and current_user.role.name == "Department Manager":
        # Can see requests from their department
        from app.models.employee import Employee, Department
        dept = db_session.query(Department).filter(Department.manager_id == current_user.id).first()
        if dept:
            emp_ids = [e.id for e in dept.employees]
            query = query.filter(LeaveRequest.employee_id.in_(emp_ids))

    status = request.args.get("status")
    if status:
        query = query.filter(LeaveRequest.status == status)

    reqs = query.order_by(LeaveRequest.created_at.desc()).all()
    res = []
    for r in reqs:
        res.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}" if r.employee else "Unknown",
            "leave_type_id": r.leave_type_id,
            "leave_type_name": r.leave_type.name if r.leave_type else None,
            "start_date": r.start_date.strftime("%Y-%m-%d"),
            "end_date": r.end_date.strftime("%Y-%m-%d"),
            "total_days": float(r.total_days),
            "is_half_day": bool(r.is_half_day),
            "reason": r.reason,
            "status": r.status,
            "approved_by": r.approved_by,
            "rejection_reason": r.rejection_reason,
            "created_at": r.created_at.isoformat()
        })

    return jsonify({"leave_requests": res})

@leave_bp.route("/requests", methods=["POST"])
@jwt_required()
def submit_leave_request():
    user = get_current_user()
    if not user.employee:
        return jsonify({"error": {"code": "bad_request", "message": "User has no employee profile"}}), 400

    data = request.get_json() or {}
    leave_type_id = data.get("leave_type_id")
    start_date_str = data.get("start_date")
    end_date_str = data.get("end_date")
    reason = data.get("reason")
    is_half_day = bool(data.get("is_half_day", False))

    if not leave_type_id or not start_date_str or not end_date_str:
        return jsonify({"error": {"code": "bad_request", "message": "Missing leave parameters"}}), 400

    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()

    try:
        req = create_leave_request(db_session, user.employee.id, leave_type_id, start_date, end_date, reason, is_half_day=is_half_day)
        log_activity("leave.requested", entity_type="LeaveRequest", entity_id=req.id, user_id=user.id)
        
        # Real-time socket notification to managers
        from app.core.sockets import send_role_notification
        emp_name = f"{user.employee.first_name} {user.employee.last_name}"
        send_role_notification("HR Manager", {
            "id": f"leave-{req.id}",
            "type": "leave_approval",
            "title": "Leave Request Pending Approval",
            "message": f"{emp_name} submitted a {req.total_days} day(s) leave request.",
            "url": "/leave",
            "badge_color": "amber",
            "unread": True
        })
        send_role_notification("Super Admin", {
            "id": f"leave-{req.id}",
            "type": "leave_approval",
            "title": "Leave Request Pending Approval",
            "message": f"{emp_name} submitted a {req.total_days} day(s) leave request.",
            "url": "/leave",
            "badge_color": "amber",
            "unread": True
        })

        return jsonify({"message": "Leave request submitted", "id": req.id, "total_days": float(req.total_days)}), 201
    except ValueError as e:
        return jsonify({"error": {"code": "validation_error", "message": str(e)}}), 400

@leave_bp.route("/requests/<string:req_id>/approve", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Department Manager")
def approve_leave(req_id):
    user = get_current_user()
    try:
        req = approve_leave_request(db_session, req_id, user.id)
        log_activity("leave.approved", entity_type="LeaveRequest", entity_id=req.id, user_id=user.id)

        # Real-time socket notification to applicant
        from app.core.sockets import send_user_notification
        if req.employee and req.employee.user:
            send_user_notification(req.employee.user.id, {
                "id": f"leave-status-{req.id}",
                "type": "leave_status",
                "title": "Leave Request APPROVED",
                "message": f"Your leave request for {req.total_days} day(s) has been approved.",
                "url": "/leave",
                "badge_color": "teal",
                "unread": True
            })

        return jsonify({"message": "Leave request approved successfully"})
    except ValueError as e:
        return jsonify({"error": {"code": "validation_error", "message": str(e)}}), 400

@leave_bp.route("/requests/<string:req_id>/reject", methods=["PUT"])
@jwt_required()
@role_required("Super Admin", "HR Manager", "Department Manager")
def reject_leave(req_id):
    user = get_current_user()
    data = request.get_json() or {}
    reason = data.get("rejection_reason")
    try:
        req = reject_leave_request(db_session, req_id, user.id, rejection_reason=reason)
        log_activity("leave.rejected", entity_type="LeaveRequest", entity_id=req.id, user_id=user.id)

        # Real-time socket notification to applicant
        from app.core.sockets import send_user_notification
        if req.employee and req.employee.user:
            send_user_notification(req.employee.user.id, {
                "id": f"leave-status-{req.id}",
                "type": "leave_status",
                "title": "Leave Request REJECTED",
                "message": f"Your leave request for {req.total_days} day(s) was rejected.",
                "url": "/leave",
                "badge_color": "rose",
                "unread": True
            })

        return jsonify({"message": "Leave request rejected"})
    except ValueError as e:
        return jsonify({"error": {"code": "validation_error", "message": str(e)}}), 400

