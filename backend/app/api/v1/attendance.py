from datetime import datetime, date, time as dt_time, timezone
from decimal import Decimal
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import or_, and_, desc
from app.db.session import db_session
from app.models.attendance import (
    Attendance,
    AttendancePolicy,
    Shift,
    EmployeeShift,
    AttendanceBreak,
    AttendanceEvent,
    OvertimeClaim,
    PunchCorrectionRequest
)
from app.models.employee import Department, Employee
from app.models.auth import User
from app.models.project import Project
from app.services.attendance_service import (
    record_check_in,
    record_check_out,
    record_break_start,
    record_break_end,
    get_shift_config,
    get_employee_active_shift_and_policy,
    log_attendance_event
)
from app.core.security import get_current_user, log_activity
from app.core.sockets import socketio

attendance_bp = Blueprint("attendance", __name__, url_prefix="/attendance")


# ==============================================================================
# HELPER FUNCTIONS & SERIALIZERS
# ==============================================================================
def is_admin_or_hr(user: User) -> bool:
    if not user or not user.role:
        return False
    return user.role.name in ("Super Admin", "HR Manager", "Admin")


def get_managed_department(user: User):
    if not user:
        return None
    return db_session.query(Department).filter(Department.manager_id == user.id).first()


def broadcast_presence_change(user_id: str, status: str, work_mode: str = "OFFICE", extra: dict = None):
    """Emits real-time Socket.IO presence update to department and company channels."""
    payload = {
        "user_id": user_id,
        "status": status,
        "work_mode": work_mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **(extra or {})
    }
    socketio.emit("attendance:presence_changed", payload)


def compute_working_hours(attendance_rec: Attendance) -> float:
    if not attendance_rec.check_in:
        return 0.0

    today = date.today()
    if not attendance_rec.check_out:
        # Prevent Zombie timer: If date is in the past, do not compute datetime.now() across days!
        if attendance_rec.date < today:
            return float(attendance_rec.regular_hours or 0.0)
        end_time = datetime.now()
    else:
        end_time = attendance_rec.check_out

    raw_secs = max(0.0, (end_time - attendance_rec.check_in).total_seconds())

    # Total break seconds
    total_break_mins = sum(b.duration_minutes or 0 for b in attendance_rec.breaks)
    break_secs = total_break_mins * 60.0

    # Friday Jumma exemption
    jumma_secs = 0.0
    if attendance_rec.check_in.weekday() == 4:
        jumma_start = datetime.combine(attendance_rec.date, dt_time(13, 0))
        jumma_end = datetime.combine(attendance_rec.date, dt_time(14, 30))
        ov_start = max(attendance_rec.check_in, jumma_start)
        ov_end = min(end_time, jumma_end)
        if ov_end > ov_start:
            jumma_secs = (ov_end - ov_start).total_seconds()

    net_secs = max(0.0, raw_secs - max(break_secs, jumma_secs))
    return round(net_secs / 3600.0, 2)


def serialize_break(b: AttendanceBreak):
    return {
        "id": b.id,
        "attendance_id": b.attendance_id,
        "break_type": b.break_type,
        "started_at": b.started_at.isoformat() if b.started_at else None,
        "ended_at": b.ended_at.isoformat() if b.ended_at else None,
        "duration_minutes": b.duration_minutes or 0,
        "is_active": b.ended_at is None
    }


def serialize_attendance(r: Attendance):
    emp = r.employee
    dept = emp.department if emp else None
    gender = (emp.emergency_contact or {}).get("gender", "Male") if emp else "Male"
    working_hrs = compute_working_hours(r)

    # Active break if any
    active_break = next((b for b in r.breaks if b.ended_at is None), None)

    # Latest overtime claim
    latest_claim = next(iter(sorted(r.overtime_claims, key=lambda c: c.created_at or datetime.min, reverse=True)), None)

    # Latest punch correction
    latest_correction = next(iter(sorted(r.punch_corrections, key=lambda p: p.created_at or datetime.min, reverse=True)), None)

    # Accurate status & live calculated status classification
    is_today = (r.date == date.today())
    final_status = r.status

    if not r.check_in:
        live_status = "NOT_STARTED"
    elif r.check_in and not r.check_out:
        if is_today:
            live_status = "ON_BREAK" if active_break else "IN_SHIFT"
        else:
            live_status = "MISSED_PUNCH_OUT"
            final_status = "incomplete_absent"
    else:
        # Completed shift threshold classification
        if working_hrs < 4.0:
            final_status = "half_day"
            live_status = "HALF_DAY"
        elif working_hrs < 7.5:
            final_status = "half_day"
            live_status = "HALF_DAY"
        elif (r.unapproved_ot_hours or 0) > 0:
            live_status = "OVERTIME"
        elif (r.late_minutes or 0) > 0:
            final_status = "late_present"
            live_status = "LATE"
        else:
            final_status = "present"
            live_status = "PRESENT"

    return {
        "id": r.id,
        "employee_id": r.employee_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
        "employee_code": emp.employee_code if emp else "",
        "department_id": dept.id if dept else None,
        "department_name": dept.name if dept else "General",
        "designation": emp.designation if emp else "",
        "gender": gender,
        "shift_id": r.shift_id,
        "shift_name": r.shift.name if r.shift else "Standard Shift",
        "date": r.date.strftime("%Y-%m-%d"),
        "check_in": r.check_in.strftime("%H:%M:%S") if r.check_in else None,
        "check_out": r.check_out.strftime("%H:%M:%S") if r.check_out else None,
        "status": final_status,
        "calculated_status": live_status,
        "work_mode": r.work_mode or "OFFICE",
        "late_minutes": r.late_minutes or 0,
        "early_leaving_minutes": r.early_leaving_minutes or 0,
        "working_hours": working_hrs,
        "regular_hours": float(r.regular_hours or 0.0),
        "break_duration_hours": float(r.break_duration_hours or 0.0),
        "unapproved_ot_hours": float(r.unapproved_ot_hours or 0.0),
        "approved_ot_hours": float(r.overtime_hours or r.approved_ot_hours or 0.0),
        "overtime_hours": float(r.overtime_hours or 0.0),
        "ot_category": r.ot_category or "NORMAL_OT",
        "is_resumed": bool(r.is_resumed),
        "device_id": r.device_id or "WEB-ESS",
        "source_type": "BIOMETRIC" if (r.device_id and r.device_id.startswith("BIOMETRIC")) else "WEB-ESS",
        "active_break": serialize_break(active_break) if active_break else None,
        "breaks": [serialize_break(b) for b in r.breaks],
        "claim": {
            "id": latest_claim.id,
            "status": latest_claim.status,
            "claimed_hours": float(latest_claim.claimed_hours),
            "task_summary": latest_claim.task_summary
        } if latest_claim else None,
        "punch_correction": {
            "id": latest_correction.id,
            "correction_type": latest_correction.correction_type,
            "status": latest_correction.status,
            "reason": latest_correction.reason,
            "requested_in_time": latest_correction.requested_in_time.isoformat() if latest_correction.requested_in_time else None,
            "requested_out_time": latest_correction.requested_out_time.isoformat() if latest_correction.requested_out_time else None
        } if latest_correction else None
    }


def serialize_audit_event(ev: AttendanceEvent):
    emp = ev.employee.employee if ev.employee and ev.employee.employee else None
    emp_name = f"{emp.first_name} {emp.last_name}" if emp else (ev.employee.email if ev.employee else "System")

    actor = ev.actor.employee if ev.actor and ev.actor.employee else None
    actor_name = f"{actor.first_name} {actor.last_name}" if actor else (ev.actor.email if ev.actor else "System")

    return {
        "id": ev.id,
        "attendance_id": ev.attendance_id,
        "employee_id": ev.employee_id,
        "employee_name": emp_name,
        "actor_id": ev.actor_id,
        "actor_name": actor_name,
        "event_type": ev.event_type,
        "source": ev.source,
        "ip_address": ev.ip_address,
        "previous_state": ev.previous_state,
        "new_state": ev.new_state,
        "created_at": ev.created_at.isoformat() if ev.created_at else None
    }


def serialize_overtime_claim(claim: OvertimeClaim):
    user = claim.user
    emp = user.employee if user else None
    dept = emp.department if emp else None

    mgr_name = None
    if claim.manager:
        m_emp = claim.manager.employee
        mgr_name = f"{m_emp.first_name} {m_emp.last_name}" if m_emp else claim.manager.email

    hr_name = None
    if claim.hr:
        h_emp = claim.hr.employee
        hr_name = f"{h_emp.first_name} {h_emp.last_name}" if h_emp else claim.hr.email

    return {
        "id": claim.id,
        "attendance_id": claim.attendance_id,
        "attendance_date": claim.attendance.date.strftime("%Y-%m-%d") if claim.attendance else None,
        "user_id": claim.user_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else (user.email if user else "Employee"),
        "employee_code": emp.employee_code if emp else "",
        "department_name": dept.name if dept else "General",
        "project_id": claim.project_id,
        "project_name": claim.project.name if claim.project else "General / Non-Project",
        "claimed_hours": float(claim.claimed_hours),
        "unapproved_ot_hours": float(claim.attendance.unapproved_ot_hours or 0.0) if claim.attendance else 0.0,
        "task_summary": claim.task_summary,
        "status": claim.status,
        "manager_id": claim.manager_id,
        "manager_name": mgr_name,
        "manager_remarks": claim.manager_remarks,
        "hr_id": claim.hr_id,
        "hr_name": hr_name,
        "hr_remarks": claim.hr_remarks,
        "created_at": claim.created_at.isoformat() if claim.created_at else None
    }


def serialize_punch_correction(req: PunchCorrectionRequest):
    user = req.user
    emp = user.employee if user else None
    dept = emp.department if emp else None
    att = req.attendance

    reviewer_name = None
    if req.reviewed_by:
        r_emp = req.reviewed_by.employee
        reviewer_name = f"{r_emp.first_name} {r_emp.last_name}" if r_emp else req.reviewed_by.email

    return {
        "id": req.id,
        "attendance_id": req.attendance_id,
        "attendance_date": att.date.strftime("%Y-%m-%d") if att else None,
        "check_in": att.check_in.strftime("%H:%M:%S") if att and att.check_in else None,
        "check_out": att.check_out.strftime("%H:%M:%S") if att and att.check_out else None,
        "user_id": req.user_id,
        "employee_name": f"{emp.first_name} {emp.last_name}" if emp else (user.email if user else "Employee"),
        "employee_code": emp.employee_code if emp else "",
        "department_name": dept.name if dept else "General",
        "correction_type": req.correction_type or "ACCIDENTAL_PUNCH_OUT",
        "requested_in_time": req.requested_in_time.strftime("%H:%M:%S") if req.requested_in_time else None,
        "requested_out_time": req.requested_out_time.strftime("%H:%M:%S") if req.requested_out_time else None,
        "reason": req.reason,
        "audit_note": req.audit_note,
        "status": req.status,
        "reviewed_by_id": req.reviewed_by_id,
        "reviewed_by_name": reviewer_name,
        "created_at": req.created_at.isoformat() if req.created_at else None
    }


# ==============================================================================
# 1. CORE PERSONAL & TEAM ATTENDANCE ENDPOINTS
# ==============================================================================
@attendance_bp.route("/today", methods=["GET"])
@jwt_required()
def get_today_attendance():
    """Returns today's active shift session, active break, and shift details."""
    user = get_current_user()
    if not user or not user.employee:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    today = date.today()
    record = db_session.query(Attendance).filter(
        Attendance.employee_id == user.employee.id,
        Attendance.date == today
    ).first()

    config = get_shift_config(db_session, user.employee.id)

    if not record or not record.check_in:
        return jsonify({
            "is_checked_in": False,
            "is_checked_out": False,
            "is_on_break": False,
            "active_break": None,
            "check_in": None,
            "check_out": None,
            "status": "not_checked_in",
            "calculated_status": "NOT_STARTED",
            "work_mode": "OFFICE",
            "shift_name": config["shift_name"],
            "shift_type": config.get("shift_type", "FIXED"),
            "gender": config["gender"]
        })

    is_checked_in = bool(record.check_in and not record.check_out)
    is_checked_out = bool(record.check_out)
    working_hours = compute_working_hours(record)

    # Check active break
    active_break = next((b for b in record.breaks if b.ended_at is None), None)

    # Check for pending punch correction/resume
    pending_correction = db_session.query(PunchCorrectionRequest).filter(
        PunchCorrectionRequest.attendance_id == record.id,
        PunchCorrectionRequest.status == "PENDING"
    ).first()

    live_status = "ON_BREAK" if active_break else ("IN_SHIFT" if is_checked_in else ("OVERTIME" if (record.unapproved_ot_hours or 0) > 0 else "PUNCHED_OUT"))

    return jsonify({
        "id": record.id,
        "is_checked_in": is_checked_in,
        "is_checked_out": is_checked_out,
        "is_on_break": bool(active_break),
        "active_break": serialize_break(active_break) if active_break else None,
        "check_in": record.check_in.strftime("%H:%M:%S") if record.check_in else None,
        "check_out": record.check_out.strftime("%H:%M:%S") if record.check_out else None,
        "status": record.status,
        "calculated_status": live_status,
        "work_mode": record.work_mode or "OFFICE",
        "late_minutes": record.late_minutes or 0,
        "early_leaving_minutes": record.early_leaving_minutes or 0,
        "working_hours": working_hours,
        "regular_hours": float(record.regular_hours or 0.0),
        "break_duration_hours": float(record.break_duration_hours or 0.0),
        "unapproved_ot_hours": float(record.unapproved_ot_hours or 0.0),
        "overtime_hours": float(record.overtime_hours or 0.0),
        "is_resumed": bool(record.is_resumed),
        "shift_name": config["shift_name"],
        "shift_type": config.get("shift_type", "FIXED"),
        "gender": config["gender"],
        "device_id": record.device_id or "WEB-ESS",
        "source_type": "BIOMETRIC" if (record.device_id and record.device_id.startswith("BIOMETRIC")) else "WEB-ESS",
        "has_pending_resume": bool(pending_correction),
        "breaks": [serialize_break(b) for b in record.breaks]
    })


@attendance_bp.route("/my-logs", methods=["GET"])
@jwt_required()
def get_my_attendance_logs():
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"attendance": []}), 200

    from_date = request.args.get("from")
    to_date = request.args.get("to")
    month = request.args.get("month")
    year = request.args.get("year")

    query = db_session.query(Attendance).filter(Attendance.employee_id == current_user.employee.id)

    if from_date:
        query = query.filter(Attendance.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
    if to_date:
        query = query.filter(Attendance.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
    if month and year:
        try:
            m, y = int(month), int(year)
            start_d = date(y, m, 1)
            next_m = 1 if m == 12 else m + 1
            next_y = y + 1 if m == 12 else y
            end_d = date(next_y, next_m, 1)
            query = query.filter(Attendance.date >= start_d, Attendance.date < end_d)
        except (ValueError, TypeError):
            pass

    records = query.order_by(Attendance.date.desc()).all()
    return jsonify({"attendance": [serialize_attendance(r) for r in records]}), 200


@attendance_bp.route("/team-logs", methods=["GET"])
@jwt_required()
def get_team_attendance_logs():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    if not admin_or_hr and not managed_dept:
        return jsonify({"error": {"message": "Forbidden: Manager or HR role required"}}), 403

    query = db_session.query(Attendance).join(Employee, Attendance.employee_id == Employee.id)

    dept_id = request.args.get("department_id")
    if not admin_or_hr:
        query = query.filter(Employee.department_id == managed_dept.id)
    elif dept_id:
        try:
            query = query.filter(Employee.department_id == int(dept_id))
        except ValueError:
            pass

    emp_id = request.args.get("employee_id")
    if emp_id:
        query = query.filter(Attendance.employee_id == emp_id)

    search = request.args.get("search", "").strip()
    if search:
        query = query.filter(
            or_(
                Employee.first_name.ilike(f"%{search}%"),
                Employee.last_name.ilike(f"%{search}%"),
                Employee.employee_code.ilike(f"%{search}%")
            )
        )

    from_date = request.args.get("from")
    to_date = request.args.get("to")
    if from_date:
        try:
            query = query.filter(Attendance.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except ValueError:
            pass
    if to_date:
        try:
            query = query.filter(Attendance.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except ValueError:
            pass

    status = request.args.get("status")
    if status:
        query = query.filter(Attendance.status == status)

    records = query.order_by(Attendance.date.desc(), Employee.first_name.asc()).limit(300).all()
    return jsonify({
        "attendance": [serialize_attendance(r) for r in records],
        "scope": "COMPANY" if admin_or_hr else f"DEPT_{managed_dept.id}",
        "managed_dept_id": managed_dept.id if managed_dept else None
    }), 200


@attendance_bp.route("", methods=["GET"])
@jwt_required()
def get_attendance():
    current_user = get_current_user()
    emp_id = request.args.get("employee_id")
    from_date = request.args.get("from")
    to_date = request.args.get("to")

    query = db_session.query(Attendance)
    if current_user.role and current_user.role.name == "Employee":
        query = query.filter(Attendance.employee_id == current_user.id)
    elif emp_id:
        query = query.filter(Attendance.employee_id == emp_id)

    if from_date:
        query = query.filter(Attendance.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
    if to_date:
        query = query.filter(Attendance.date <= datetime.strptime(to_date, "%Y-%m-%d").date())

    records = query.order_by(Attendance.date.desc()).all()
    return jsonify({"attendance": [serialize_attendance(r) for r in records]}), 200


# ==============================================================================
# 2. PUNCH IN, PUNCH OUT, AND BREAK LIFECYCLE
# ==============================================================================
@attendance_bp.route("/check-in", methods=["POST"])
@jwt_required()
def check_in():
    user = get_current_user()
    if not user.employee:
        return jsonify({"error": {"code": "bad_request", "message": "User has no associated employee record"}}), 400

    data = request.get_json() or {}
    work_mode = data.get("work_mode", "OFFICE").upper()

    try:
        record = record_check_in(
            db=db_session,
            employee_id=user.employee.id,
            work_mode=work_mode,
            actor_id=user.id,
            source="WEB-ESS",
            ip_address=request.remote_addr
        )
    except ValueError as e:
        return jsonify({"error": {"code": "outside_shift_hours", "message": str(e)}}), 400

    log_activity("attendance.check_in", entity_type="Attendance", entity_id=record.id, user_id=user.id)
    broadcast_presence_change(user.id, "IN_SHIFT", work_mode=work_mode)

    return jsonify({
        "message": "Checked in successfully",
        "check_in": record.check_in.strftime("%H:%M:%S") if record.check_in else None,
        "late_minutes": record.late_minutes,
        "status": record.status,
        "calculated_status": record.calculated_status,
        "work_mode": record.work_mode
    })


@attendance_bp.route("/check-out", methods=["POST"])
@jwt_required()
def check_out():
    user = get_current_user()
    if not user.employee:
        return jsonify({"error": {"code": "bad_request", "message": "User has no associated employee record"}}), 400

    try:
        record = record_check_out(
            db=db_session,
            employee_id=user.employee.id,
            actor_id=user.id,
            source="WEB-ESS",
            ip_address=request.remote_addr
        )
    except ValueError as e:
        return jsonify({"error": {"code": "check_out_error", "message": str(e)}}), 400

    log_activity("attendance.check_out", entity_type="Attendance", entity_id=record.id, user_id=user.id)
    broadcast_presence_change(user.id, "PUNCHED_OUT")

    return jsonify({
        "message": "Checked out successfully",
        "check_out": record.check_out.strftime("%H:%M:%S") if record.check_out else None,
        "early_leaving_minutes": record.early_leaving_minutes,
        "regular_hours": float(record.regular_hours or 0.0),
        "break_duration_hours": float(record.break_duration_hours or 0.0),
        "unapproved_ot_hours": float(record.unapproved_ot_hours or 0.0),
        "overtime_hours": float(record.overtime_hours or 0.0),
        "status": record.status,
        "calculated_status": record.calculated_status
    })


@attendance_bp.route("/break/start", methods=["POST"])
@jwt_required()
def start_break():
    """Starts an official break session (LUNCH, TEA, PRAYER, PERSONAL)."""
    user = get_current_user()
    if not user or not user.employee:
        return jsonify({"error": {"message": "Employee profile required"}}), 400

    data = request.get_json() or {}
    break_type = data.get("break_type", "LUNCH").upper()

    try:
        att_break = record_break_start(
            db=db_session,
            employee_id=user.employee.id,
            break_type=break_type,
            actor_id=user.id,
            source="WEB-ESS",
            ip_address=request.remote_addr
        )
    except ValueError as e:
        return jsonify({"error": {"message": str(e)}}), 400

    broadcast_presence_change(user.id, "ON_BREAK", extra={"break_type": break_type})

    return jsonify({
        "success": True,
        "message": f"{break_type} break started",
        "break": serialize_break(att_break)
    }), 201


@attendance_bp.route("/break/end", methods=["POST"])
@jwt_required()
def end_break():
    """Ends current active break and resumes shift."""
    user = get_current_user()
    if not user or not user.employee:
        return jsonify({"error": {"message": "Employee profile required"}}), 400

    try:
        att_break = record_break_end(
            db=db_session,
            employee_id=user.employee.id,
            actor_id=user.id,
            source="WEB-ESS",
            ip_address=request.remote_addr
        )
    except ValueError as e:
        return jsonify({"error": {"message": str(e)}}), 400

    broadcast_presence_change(user.id, "IN_SHIFT")

    return jsonify({
        "success": True,
        "message": f"{att_break.break_type} break ended ({att_break.duration_minutes}m)",
        "break": serialize_break(att_break)
    }), 200


# ==============================================================================
# 3. REAL-TIME PRESENCE STREAM & AUDIT TRAIL
# ==============================================================================
@attendance_bp.route("/presence/stream", methods=["GET"])
@jwt_required()
def get_live_presence_stream():
    """Returns real-time status list of employees (IN_SHIFT, ON_BREAK, PUNCHED_OUT, NOT_STARTED)."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    query = db_session.query(Employee).filter(Employee.status == "active")
    if not admin_or_hr:
        if managed_dept:
            query = query.filter(Employee.department_id == managed_dept.id)
        elif current_user.employee and current_user.employee.department_id:
            query = query.filter(Employee.department_id == current_user.employee.department_id)

    dept_id = request.args.get("department_id")
    if admin_or_hr and dept_id:
        try:
            query = query.filter(Employee.department_id == int(dept_id))
        except ValueError:
            pass

    employees = query.order_by(Employee.first_name.asc()).all()
    today = date.today()

    presence_list = []
    for emp in employees:
        att = db_session.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).first()
        active_break = next((b for b in att.breaks if b.ended_at is None), None) if att else None

        if not att or not att.check_in:
            live_status = "NOT_STARTED"
        elif att.check_in and not att.check_out:
            live_status = "ON_BREAK" if active_break else "IN_SHIFT"
        else:
            live_status = "PUNCHED_OUT"

        work_hrs = compute_working_hours(att) if att else 0.0

        presence_list.append({
            "employee_id": emp.id,
            "employee_name": f"{emp.first_name} {emp.last_name}",
            "employee_code": emp.employee_code,
            "department_name": emp.department.name if emp.department else "General",
            "designation": emp.designation,
            "presence_status": live_status,
            "work_mode": att.work_mode if att else "OFFICE",
            "check_in": att.check_in.strftime("%H:%M:%S") if att and att.check_in else None,
            "check_out": att.check_out.strftime("%H:%M:%S") if att and att.check_out else None,
            "working_hours": work_hrs,
            "active_break": serialize_break(active_break) if active_break else None
        })

    return jsonify({"presence": presence_list}), 200


@attendance_bp.route("/audit-events", methods=["GET"])
@jwt_required()
def get_attendance_audit_events():
    """Retrieves immutable attendance event logs for compliance and audit trail."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    query = db_session.query(AttendanceEvent)

    att_id = request.args.get("attendance_id")
    if att_id:
        try:
            query = query.filter(AttendanceEvent.attendance_id == int(att_id))
        except ValueError:
            pass

    emp_id = request.args.get("employee_id")
    if emp_id:
        query = query.filter(AttendanceEvent.employee_id == emp_id)
    elif not admin_or_hr and not managed_dept:
        # Regular employees only view their own events
        query = query.filter(AttendanceEvent.employee_id == current_user.id)

    event_type = request.args.get("event_type")
    if event_type:
        query = query.filter(AttendanceEvent.event_type == event_type.upper())

    events = query.order_by(AttendanceEvent.created_at.desc()).limit(150).all()
    return jsonify({"events": [serialize_audit_event(e) for e in events]}), 200


# ==============================================================================
# 4. REGULARIZATION & RESUMPTION WORKFLOWS
# ==============================================================================
@attendance_bp.route("/regularization/request", methods=["POST"])
@jwt_required()
def submit_regularization_request():
    """Submits a punch regularization request (Missing Punch In/Out, Accidental Punch-Out, Wrong Time)."""
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"message": "Employee profile required"}}), 400

    data = request.get_json() or {}
    attendance_id = data.get("attendance_id")
    correction_type = data.get("correction_type", "ACCIDENTAL_PUNCH_OUT").upper()
    reason = data.get("reason", "").strip()
    req_in_str = data.get("requested_in_time")
    req_out_str = data.get("requested_out_time")

    if not reason:
        return jsonify({"error": {"message": "Reason for regularization is required"}}), 400

    if attendance_id:
        attendance = db_session.query(Attendance).filter(
            Attendance.id == attendance_id,
            Attendance.employee_id == current_user.employee.id
        ).first()
    else:
        attendance = db_session.query(Attendance).filter(
            Attendance.employee_id == current_user.employee.id,
            Attendance.date == date.today()
        ).first()

    if not attendance:
        return jsonify({"error": {"message": "Target attendance record not found"}}), 404

    req_in_dt = None
    req_out_dt = None
    if req_in_str:
        try:
            req_in_dt = datetime.fromisoformat(req_in_str)
        except ValueError:
            pass
    if req_out_str:
        try:
            req_out_dt = datetime.fromisoformat(req_out_str)
        except ValueError:
            pass

    req = PunchCorrectionRequest(
        attendance_id=attendance.id,
        user_id=current_user.id,
        correction_type=correction_type,
        requested_in_time=req_in_dt,
        requested_out_time=req_out_dt,
        reason=reason,
        status="PENDING"
    )
    db_session.add(req)
    db_session.commit()

    log_attendance_event(
        db=db_session,
        attendance_id=attendance.id,
        employee_id=current_user.id,
        actor_id=current_user.id,
        event_type="CORRECTION_REQUESTED",
        source="WEB-ESS",
        ip_address=request.remote_addr,
        new_state={"request_id": req.id, "correction_type": correction_type, "reason": reason}
    )

    # Notify Manager
    emp_dept = current_user.employee.department
    if emp_dept and emp_dept.manager_id:
        notif_payload = {
            "id": f"reg-req-{req.id}",
            "type": "regularization_request",
            "title": f"📋 Regularization Request ({correction_type.replace('_', ' ')})",
            "message": f"{current_user.employee.first_name} requested correction: '{reason[:50]}'",
            "url": "/attendance",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
            "unread": True,
            "badge_color": "amber"
        }
        socketio.emit("notification:new", notif_payload, room=f"user_{emp_dept.manager_id}")

    return jsonify({
        "success": True,
        "message": "Regularization request submitted successfully",
        "request": serialize_punch_correction(req)
    }), 201


@attendance_bp.route("/regularization/pending", methods=["GET"])
@jwt_required()
def get_pending_regularization_requests():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    if not admin_or_hr and not managed_dept:
        return jsonify({"error": {"message": "Forbidden"}}), 403

    query = db_session.query(PunchCorrectionRequest).join(
        User, PunchCorrectionRequest.user_id == User.id
    ).join(Employee, User.id == Employee.id)

    if not admin_or_hr:
        query = query.filter(Employee.department_id == managed_dept.id)

    requests = query.order_by(
        PunchCorrectionRequest.status == "PENDING",
        PunchCorrectionRequest.created_at.desc()
    ).all()

    return jsonify({"requests": [serialize_punch_correction(r) for r in requests]}), 200


@attendance_bp.route("/regularization/<req_id>/review", methods=["PATCH", "POST"])
@jwt_required()
def review_regularization_request(req_id):
    """Approves or rejects regularization, safely restoring active shift sessions."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "Unauthenticated"}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    if not admin_or_hr and not managed_dept:
        return jsonify({"error": "Forbidden"}), 403

    try:
        req = db_session.query(PunchCorrectionRequest).filter(PunchCorrectionRequest.id == req_id).first()
        if not req:
            return jsonify({"error": f"Regularization request {req_id} not found"}), 404

        data = request.get_json(silent=True) or {}
        action = data.get("action", "APPROVE").upper()
        audit_note = data.get("audit_note", "").strip()

        if action not in ("APPROVE", "REJECT"):
            return jsonify({"error": "Action must be APPROVE or REJECT"}), 400

        attendance = req.attendance
        if not attendance and req.attendance_id:
            attendance = db_session.query(Attendance).filter(Attendance.id == req.attendance_id).first()

        prev_state = {
            "check_in": attendance.check_in.isoformat() if attendance and attendance.check_in else None,
            "check_out": attendance.check_out.isoformat() if attendance and attendance.check_out else None,
            "status": attendance.status if attendance else None
        }

        if action == "APPROVE":
            req.status = "APPROVED"
            req.reviewed_by_id = current_user.id
            req.audit_note = audit_note or "Approved by Manager/HR"

            if attendance:
                # Handle accidental punch out restoration vs punch corrections
                if req.correction_type == "ACCIDENTAL_PUNCH_OUT":
                    attendance.check_out = None
                    attendance.is_resumed = True
                    # Preserve late deviation indicator if employee arrived late
                    attendance.status = "late_present" if (attendance.late_minutes or 0) > 0 else "present"
                    attendance.calculated_status = "IN_SHIFT"
                    broadcast_presence_change(req.user_id, "IN_SHIFT")
                else:
                    if req.requested_in_time:
                        attendance.check_in = req.requested_in_time
                    if req.requested_out_time:
                        attendance.check_out = req.requested_out_time
                    attendance.is_resumed = True
                    attendance.status = "late_present" if (attendance.late_minutes or 0) > 0 else "present"
                    attendance.calculated_status = "REGULARIZED"

            msg = "Shift session restored successfully" if req.correction_type == "ACCIDENTAL_PUNCH_OUT" else "Regularization request approved successfully"

        else:
            req.status = "REJECTED"
            req.reviewed_by_id = current_user.id
            req.audit_note = audit_note or "Rejected by reviewer"
            msg = "Regularization request rejected."

        db_session.commit()

        # Log immutable audit event
        log_attendance_event(
            db=db_session,
            attendance_id=attendance.id if attendance else None,
            employee_id=req.user_id,
            actor_id=current_user.id,
            event_type="CORRECTION_APPROVED" if action == "APPROVE" else "CORRECTION_REJECTED",
            source="ADMIN",
            ip_address=request.remote_addr,
            previous_state=prev_state,
            new_state={
                "status": req.status,
                "check_in": attendance.check_in.isoformat() if attendance and attendance.check_in else None,
                "check_out": attendance.check_out.isoformat() if attendance and attendance.check_out else None,
                "audit_note": audit_note
            }
        )

        # Notify employee
        notif_payload = {
            "id": f"reg-res-{req.id}",
            "type": "regularization_status",
            "title": f"📋 Regularization {req.status}",
            "message": f"Your request for {req.correction_type.replace('_', ' ')} has been {req.status.lower()}.",
            "url": "/attendance",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
            "unread": True,
            "badge_color": "teal" if req.status == "APPROVED" else "rose"
        }
        socketio.emit("notification:new", notif_payload, room=f"user_{req.user_id}")

        return jsonify({"success": True, "message": msg, "request": serialize_punch_correction(req)}), 200

    except Exception as e:
        db_session.rollback()
        import logging
        logging.getLogger(__name__).error(f"Error restoring shift for request {req_id}: {str(e)}")
        return jsonify({"error": f"Failed to restore shift: {str(e)}"}), 500


# Backward compatibility aliases
@attendance_bp.route("/restore-shift/<req_id>", methods=["POST", "PATCH"])
@jwt_required()
def restore_shift_endpoint(req_id):
    return review_regularization_request(req_id)

@attendance_bp.route("/request-resume", methods=["POST"])
@jwt_required()
def request_punch_resume():
    return submit_regularization_request()

@attendance_bp.route("/punch-corrections/pending", methods=["GET"])
@jwt_required()
def get_pending_punch_corrections():
    return get_pending_regularization_requests()

@attendance_bp.route("/punch-corrections/<req_id>/approve", methods=["PATCH", "POST"])
@jwt_required()
def approve_punch_correction(req_id):
    return review_regularization_request(req_id)

@attendance_bp.route("/punch-corrections/<req_id>/reject", methods=["PATCH", "POST"])
@jwt_required()
def reject_punch_correction(req_id):
    return review_regularization_request(req_id)

@attendance_bp.route("/punch-corrections/my-requests", methods=["GET"])
@jwt_required()
def get_my_punch_corrections():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"requests": []}), 200
    requests = db_session.query(PunchCorrectionRequest).filter(
        PunchCorrectionRequest.user_id == current_user.id
    ).order_by(PunchCorrectionRequest.created_at.desc()).all()
    return jsonify({"requests": [serialize_punch_correction(r) for r in requests]}), 200


# ==============================================================================
# 5. OVERTIME CLAIMS WORKFLOW
# ==============================================================================
@attendance_bp.route("/overtime/claim", methods=["POST"])
@jwt_required()
def submit_overtime_claim():
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"message": "Employee profile required"}}), 400

    data = request.get_json() or {}
    attendance_id = data.get("attendance_id")
    project_id = data.get("project_id")
    claimed_hours = data.get("claimed_hours")
    task_summary = data.get("task_summary")

    if not attendance_id or claimed_hours is None or not task_summary:
        return jsonify({"error": {"message": "Attendance ID, claimed hours, and task summary are required"}}), 400

    try:
        claimed_h = Decimal(str(claimed_hours))
        if claimed_h <= 0:
            return jsonify({"error": {"message": "Claimed hours must be greater than 0"}}), 400
    except Exception:
        return jsonify({"error": {"message": "Invalid claimed hours format"}}), 400

    attendance = db_session.query(Attendance).filter(
        Attendance.id == attendance_id,
        Attendance.employee_id == current_user.employee.id
    ).first()

    if not attendance:
        return jsonify({"error": {"message": "Attendance record not found"}}), 404

    max_ot = attendance.unapproved_ot_hours or Decimal('0.00')
    if claimed_h > max_ot:
        return jsonify({
            "error": {
                "message": f"Claimed hours ({claimed_h}h) exceeds available unapproved overtime ({max_ot}h)."
            }
        }), 400

    existing_claim = db_session.query(OvertimeClaim).filter(
        OvertimeClaim.attendance_id == attendance.id,
        OvertimeClaim.status.in_(["PENDING_MANAGER", "PENDING_HR", "APPROVED"])
    ).first()
    if existing_claim:
        return jsonify({
            "error": {
                "message": f"An active overtime claim already exists for this date (Status: {existing_claim.status})."
            }
        }), 400

    claim = OvertimeClaim(
        attendance_id=attendance.id,
        user_id=current_user.id,
        project_id=project_id if project_id else None,
        claimed_hours=claimed_h,
        task_summary=task_summary,
        status="PENDING_MANAGER"
    )
    attendance.claimed_ot_hours = claimed_h
    db_session.add(claim)
    db_session.commit()

    log_attendance_event(
        db=db_session,
        attendance_id=attendance.id,
        employee_id=current_user.id,
        actor_id=current_user.id,
        event_type="OT_CLAIMED",
        source="WEB-ESS",
        ip_address=request.remote_addr,
        new_state={"claim_id": claim.id, "claimed_hours": float(claimed_h), "task_summary": task_summary}
    )

    emp_dept = current_user.employee.department
    if emp_dept and emp_dept.manager_id:
        notif_payload = {
            "id": f"ot-claim-{claim.id}",
            "type": "overtime_claim",
            "title": "⏱️ New Overtime Claim",
            "message": f"{current_user.employee.first_name} {current_user.employee.last_name} claimed {claimed_h}h OT for {attendance.date}",
            "url": "/attendance",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
            "unread": True,
            "badge_color": "amber"
        }
        socketio.emit("notification:new", notif_payload, room=f"user_{emp_dept.manager_id}")

    return jsonify({
        "success": True,
        "message": f"Overtime claim for {claimed_h} hours submitted successfully",
        "claim": serialize_overtime_claim(claim)
    }), 201


@attendance_bp.route("/overtime/pending", methods=["GET"])
@jwt_required()
def get_pending_overtime_claims():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    if not admin_or_hr and not managed_dept:
        return jsonify({"error": {"message": "Forbidden: Manager or HR role required"}}), 403

    query = db_session.query(OvertimeClaim).join(User, OvertimeClaim.user_id == User.id).join(Employee, User.id == Employee.id)

    status_filter = request.args.get("status")
    if not admin_or_hr:
        query = query.filter(Employee.department_id == managed_dept.id)
        if status_filter:
            query = query.filter(OvertimeClaim.status == status_filter.upper())
    elif status_filter:
        query = query.filter(OvertimeClaim.status == status_filter.upper())

    claims = query.order_by(
        OvertimeClaim.status == "PENDING_MANAGER",
        OvertimeClaim.status == "PENDING_HR",
        OvertimeClaim.created_at.desc()
    ).all()

    return jsonify({
        "claims": [serialize_overtime_claim(c) for c in claims],
        "is_hr_view": admin_or_hr
    }), 200


@attendance_bp.route("/overtime/my-claims", methods=["GET"])
@jwt_required()
def get_my_overtime_claims():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"claims": []}), 200
    claims = db_session.query(OvertimeClaim).filter(
        OvertimeClaim.user_id == current_user.id
    ).order_by(OvertimeClaim.created_at.desc()).all()
    return jsonify({"claims": [serialize_overtime_claim(c) for c in claims]}), 200


@attendance_bp.route("/overtime/<claim_id>/review", methods=["PATCH"])
@jwt_required()
def review_overtime_claim(claim_id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    admin_or_hr = is_admin_or_hr(current_user)
    managed_dept = get_managed_department(current_user)

    if not admin_or_hr and not managed_dept:
        return jsonify({"error": {"message": "Forbidden"}}), 403

    claim = db_session.query(OvertimeClaim).filter(OvertimeClaim.id == claim_id).first()
    if not claim:
        return jsonify({"error": {"message": "Overtime claim not found"}}), 404

    data = request.get_json() or {}
    action = data.get("action", "").upper()
    remarks = data.get("remarks", "").strip()

    if action not in ("APPROVE", "REJECT"):
        return jsonify({"error": {"message": "Action must be 'APPROVE' or 'REJECT'"}}), 400

    attendance = claim.attendance

    if not admin_or_hr:
        if claim.status != "PENDING_MANAGER":
            return jsonify({"error": {"message": f"Claim cannot be reviewed in status '{claim.status}'"}}), 400
        claim.manager_id = current_user.id
        claim.manager_remarks = remarks
        claim.status = "PENDING_HR" if action == "APPROVE" else "REJECTED"
        msg = f"Claim {'recommended to HR' if action == 'APPROVE' else 'rejected by Manager'}"
    else:
        claim.hr_id = current_user.id
        claim.hr_remarks = remarks
        if action == "APPROVE":
            claim.status = "APPROVED"
            if attendance:
                attendance.overtime_hours = claim.claimed_hours
                attendance.approved_ot_hours = claim.claimed_hours
            msg = f"Overtime claim approved ({claim.claimed_hours}h credited)"
        else:
            claim.status = "REJECTED"
            if attendance:
                attendance.rejected_ot_hours = claim.claimed_hours
            msg = "Overtime claim rejected by HR"

    db_session.commit()

    log_attendance_event(
        db=db_session,
        attendance_id=attendance.id if attendance else None,
        employee_id=claim.user_id,
        actor_id=current_user.id,
        event_type="OT_APPROVED" if claim.status == "APPROVED" else "OT_CLAIMED",
        source="ADMIN",
        ip_address=request.remote_addr,
        new_state={"claim_id": claim.id, "status": claim.status, "remarks": remarks}
    )

    notif_payload = {
        "id": f"ot-review-{claim.id}",
        "type": "overtime_status",
        "title": f"⏱️ Overtime Claim {claim.status.replace('_', ' ')}",
        "message": f"Your claim for {claim.claimed_hours}h is {claim.status.lower()}. {remarks}",
        "url": "/attendance",
        "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
        "unread": True,
        "badge_color": "teal" if claim.status == "APPROVED" else ("amber" if claim.status == "PENDING_HR" else "rose")
    }
    socketio.emit("notification:new", notif_payload, room=f"user_{claim.user_id}")

    return jsonify({"success": True, "message": msg, "claim": serialize_overtime_claim(claim)}), 200


# ==============================================================================
# 6. POLICIES & SHIFTS MANAGEMENT
# ==============================================================================
@attendance_bp.route("/policies", methods=["GET"])
@jwt_required()
def get_attendance_policies():
    policies = db_session.query(AttendancePolicy).order_by(AttendancePolicy.created_at.asc()).all()
    res = []
    for p in policies:
        res.append({
            "id": p.id,
            "name": p.name,
            "standard_hours": float(p.standard_hours or 8.0),
            "min_full_day_hours": float(p.min_full_day_hours or 7.5),
            "half_day_threshold": float(p.half_day_threshold or 4.0),
            "grace_minutes": p.grace_minutes or 15,
            "late_after_minutes": p.late_after_minutes or 15,
            "overtime_after_hours": float(p.overtime_after_hours or 8.0),
            "max_daily_overtime": float(p.max_daily_overtime or 4.0),
            "break_duration_mins": p.break_duration_mins or 60,
            "auto_deduct_break": p.auto_deduct_break,
            "shift_count": len(p.shifts)
        })
    return jsonify({"policies": res}), 200


@attendance_bp.route("/shifts", methods=["GET"])
@jwt_required()
def get_attendance_shifts():
    shifts = db_session.query(Shift).filter(Shift.is_active == True).order_by(Shift.start_time.asc()).all()
    res = []
    for s in shifts:
        res.append({
            "id": s.id,
            "name": s.name,
            "shift_type": s.shift_type,
            "start_time": s.start_time.strftime("%H:%M:%S") if s.start_time else "",
            "end_time": s.end_time.strftime("%H:%M:%S") if s.end_time else "",
            "is_overnight": s.is_overnight,
            "policy_id": s.policy_id,
            "policy_name": s.policy.name if s.policy else "Default Policy"
        })
    return jsonify({"shifts": res}), 200


@attendance_bp.route("/shifts/assign", methods=["POST"])
@jwt_required()
def assign_employee_shift():
    """Assigns an active shift schedule to an employee."""
    current_user = get_current_user()
    if not is_admin_or_hr(current_user) and not get_managed_department(current_user):
        return jsonify({"error": {"message": "Forbidden"}}), 403

    data = request.get_json() or {}
    user_id = data.get("user_id")
    shift_id = data.get("shift_id")
    effective_from_str = data.get("effective_from")

    if not user_id or not shift_id:
        return jsonify({"error": {"message": "user_id and shift_id are required"}}), 400

    effective_from = datetime.strptime(effective_from_str, "%Y-%m-%d").date() if effective_from_str else date.today()

    # Expire previous shift if open
    db_session.query(EmployeeShift).filter(
        EmployeeShift.user_id == user_id,
        EmployeeShift.effective_to == None
    ).update({"effective_to": effective_from - __import__('datetime').timedelta(days=1)}, synchronize_session=False)

    emp_shift = EmployeeShift(
        user_id=user_id,
        shift_id=shift_id,
        effective_from=effective_from
    )
    db_session.add(emp_shift)
    db_session.commit()

    return jsonify({"success": True, "message": "Shift schedule assigned successfully"}), 201


@attendance_bp.route("/biometric-ingest", methods=["POST"])
@jwt_required()
def biometric_ingest():
    data = request.get_json() or {}
    employee_code = data.get("employee_code")
    timestamp_str = data.get("timestamp")
    device_id = data.get("device_id", "BIOMETRIC-01")
    event_type = data.get("event_type", "check_in")

    if not employee_code or not timestamp_str:
        return jsonify({"error": {"code": "bad_request", "message": "Missing employee_code or timestamp"}}), 400

    emp = db_session.query(Employee).filter(Employee.employee_code == employee_code).first()
    if not emp:
        return jsonify({"error": {"code": "not_found", "message": f"Employee code {employee_code} not found"}}), 404

    try:
        dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return jsonify({"error": {"code": "bad_request", "message": "timestamp must be YYYY-MM-DD HH:MM:SS"}}), 400

    try:
        if event_type == "check_in":
            rec = record_check_in(db_session, emp.id, check_in_dt=dt, device_id=device_id, source="BIOMETRIC")
        else:
            rec = record_check_out(db_session, emp.id, check_out_dt=dt, source="BIOMETRIC")
    except ValueError as e:
        return jsonify({"error": {"code": "validation_error", "message": str(e)}}), 400

    return jsonify({"status": "success", "attendance_id": rec.id})
