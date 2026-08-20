from datetime import datetime, date, time, timedelta, timezone
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from app.models.attendance import (
    Attendance,
    AttendancePolicy,
    Shift,
    EmployeeShift,
    AttendanceBreak,
    AttendanceEvent
)
from app.models.employee import Employee


def log_attendance_event(
    db: Session,
    attendance_id: Optional[int],
    employee_id: str,
    actor_id: str,
    event_type: str,
    source: str = "WEB-ESS",
    ip_address: Optional[str] = None,
    previous_state: Optional[dict] = None,
    new_state: Optional[dict] = None
) -> AttendanceEvent:
    """Logs an immutable attendance event for enterprise audit trail."""
    event = AttendanceEvent(
        attendance_id=attendance_id,
        employee_id=employee_id,
        actor_id=actor_id,
        event_type=event_type,
        source=source,
        ip_address=ip_address,
        previous_state=previous_state,
        new_state=new_state,
        created_at=datetime.now(timezone.utc)
    )
    db.add(event)
    db.commit()
    return event


def get_employee_active_shift_and_policy(db: Session, employee_id: str) -> Tuple[Shift, AttendancePolicy]:
    """Retrieves employee assigned active shift and policy or fallback standard."""
    today = date.today()
    emp_shift = db.query(EmployeeShift).filter(
        EmployeeShift.user_id == employee_id,
        EmployeeShift.effective_from <= today,
        (EmployeeShift.effective_to == None) | (EmployeeShift.effective_to >= today)
    ).order_by(EmployeeShift.effective_from.desc()).first()

    if emp_shift and emp_shift.shift:
        shift = emp_shift.shift
        policy = shift.policy or db.query(AttendancePolicy).first()
        return shift, policy

    # Fallback to gender-aware or first standard shift in DB
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    gender = "Male"
    if emp and emp.emergency_contact:
        gender = emp.emergency_contact.get("gender", "Male")

    if str(gender).lower() == "female":
        shift = db.query(Shift).filter(Shift.name.ilike("%Female%") | Shift.name.ilike("%Morning%")).first()
    else:
        shift = db.query(Shift).filter(Shift.name.ilike("%Male%") | Shift.name.ilike("%Day%")).first()

    if not shift:
        shift = db.query(Shift).first()

    if not shift:
        # Create fallback policy and shift on the fly
        policy = AttendancePolicy(
            name="Default Standard Policy",
            standard_hours=Decimal('8.00'),
            min_full_day_hours=Decimal('7.50'),
            half_day_threshold=Decimal('4.00'),
            grace_minutes=15,
            late_after_minutes=15,
            overtime_after_hours=Decimal('8.00'),
            max_daily_overtime=Decimal('4.00'),
            break_duration_mins=60
        )
        db.add(policy)
        db.commit()
        shift = Shift(
            policy_id=policy.id,
            name="Default Fixed Shift (09:00 - 17:00)",
            shift_type="FIXED",
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
        db.add(shift)
        db.commit()

    policy = shift.policy or db.query(AttendancePolicy).first()
    return shift, policy


def get_shift_config(db: Session, employee_id: str):
    """Backward-compatible shift config dictionary."""
    shift, policy = get_employee_active_shift_and_policy(db, employee_id)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    gender = "Male"
    if emp and emp.emergency_contact:
        gender = emp.emergency_contact.get("gender", "Male")

    grace_delta = timedelta(minutes=int(policy.grace_minutes or 15))
    start_dt = datetime.combine(date.today(), shift.start_time)
    grace_end_time = (start_dt + grace_delta).time()

    return {
        "gender": str(gender).lower(),
        "shift_id": shift.id,
        "shift_name": shift.name,
        "shift_type": shift.shift_type,
        "start_time": shift.start_time,
        "end_time": shift.end_time,
        "earliest_check_in": (start_dt - timedelta(hours=1)).time(),
        "grace_end": grace_end_time,
        "grace_minutes": policy.grace_minutes,
        "late_halfday": (start_dt + timedelta(hours=2, minutes=30)).time(),
        "standard_hours": float(policy.standard_hours or 8.0),
        "half_day_threshold": float(policy.half_day_threshold or 4.0),
        "break_duration_mins": policy.break_duration_mins or 60,
        "policy_name": policy.name
    }


def record_check_in(
    db: Session,
    employee_id: str,
    check_in_dt: Optional[datetime] = None,
    device_id: Optional[str] = None,
    work_mode: str = "OFFICE",
    actor_id: Optional[str] = None,
    source: str = "WEB-ESS",
    ip_address: Optional[str] = None
) -> Attendance:
    if not check_in_dt:
        check_in_dt = datetime.now()

    today = check_in_dt.date()
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == today
    ).first()

    shift, policy = get_employee_active_shift_and_policy(db, employee_id)
    check_in_time = check_in_dt.time()

    # Enforce Check-In Shift Hours Window Validation (unless flexible or remote)
    start_dt = datetime.combine(today, shift.start_time)
    earliest_check_in = (start_dt - timedelta(hours=1)).time()
    end_time = shift.end_time

    if shift.shift_type not in ("FLEXIBLE", "REMOTE") and not shift.is_overnight:
        if check_in_time < earliest_check_in or check_in_time > end_time:
            w_start = earliest_check_in.strftime("%I:%M %p")
            w_end = end_time.strftime("%I:%M %p")
            raise ValueError(
                f"Check-in outside shift hours. Check-in is only allowed between {w_start} and {w_end} for {shift.name}."
            )

    # Grace period & late calculation
    grace_end_dt = start_dt + timedelta(minutes=int(policy.grace_minutes or 15))
    halfday_cutoff_dt = start_dt + timedelta(hours=2, minutes=30)
    current_check_in_dt = datetime.combine(today, check_in_time)

    late_mins = 0
    if current_check_in_dt <= grace_end_dt:
        late_mins = 0
        status = "present"
        calculated_status = "IN_SHIFT"
    elif current_check_in_dt <= halfday_cutoff_dt:
        delta = current_check_in_dt - start_dt
        late_mins = max(0, int(delta.total_seconds() / 60))
        status = "late_present"
        calculated_status = "LATE"
    else:
        delta = current_check_in_dt - start_dt
        late_mins = max(0, int(delta.total_seconds() / 60))
        status = "half_day"
        calculated_status = "HALF_DAY"

    prev_state = None
    if attendance:
        prev_state = {
            "check_in": attendance.check_in.isoformat() if attendance.check_in else None,
            "status": attendance.status,
            "calculated_status": attendance.calculated_status
        }
        if not attendance.check_in:
            attendance.check_in = check_in_dt
            attendance.late_minutes = late_mins
            attendance.status = status
            attendance.calculated_status = calculated_status
            attendance.work_mode = work_mode
            attendance.shift_id = shift.id
            if device_id:
                attendance.device_id = device_id
    else:
        attendance = Attendance(
            employee_id=employee_id,
            shift_id=shift.id,
            date=today,
            check_in=check_in_dt,
            status=status,
            calculated_status=calculated_status,
            work_mode=work_mode,
            late_minutes=late_mins,
            device_id=device_id
        )
        db.add(attendance)

    db.commit()
    db.refresh(attendance)

    # Log immutable audit event
    log_attendance_event(
        db=db,
        attendance_id=attendance.id,
        employee_id=employee_id,
        actor_id=actor_id or employee_id,
        event_type="PUNCH_IN",
        source=source,
        ip_address=ip_address,
        previous_state=prev_state,
        new_state={
            "check_in": attendance.check_in.isoformat() if attendance.check_in else None,
            "status": attendance.status,
            "calculated_status": attendance.calculated_status,
            "work_mode": attendance.work_mode
        }
    )

    return attendance


def record_break_start(
    db: Session,
    employee_id: str,
    break_type: str = "LUNCH",
    actor_id: Optional[str] = None,
    source: str = "WEB-ESS",
    ip_address: Optional[str] = None
) -> AttendanceBreak:
    today = date.today()
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == today
    ).first()

    if not attendance or not attendance.check_in:
        raise ValueError("Cannot start a break: You must punch in first.")

    if attendance.check_out:
        raise ValueError("Cannot start a break: Shift is already punched out.")

    # Check if there is an active unended break
    active_break = db.query(AttendanceBreak).filter(
        AttendanceBreak.attendance_id == attendance.id,
        AttendanceBreak.ended_at == None
    ).first()
    if active_break:
        raise ValueError(f"You already have an active {active_break.break_type} break in progress.")

    now_dt = datetime.now(timezone.utc)
    att_break = AttendanceBreak(
        attendance_id=attendance.id,
        break_type=break_type,
        started_at=now_dt,
        is_paid=True
    )
    db.add(att_break)

    attendance.calculated_status = "ON_BREAK"
    db.commit()
    db.refresh(att_break)

    log_attendance_event(
        db=db,
        attendance_id=attendance.id,
        employee_id=employee_id,
        actor_id=actor_id or employee_id,
        event_type="BREAK_START",
        source=source,
        ip_address=ip_address,
        new_state={"break_id": att_break.id, "break_type": break_type, "started_at": now_dt.isoformat()}
    )

    return att_break


def record_break_end(
    db: Session,
    employee_id: str,
    actor_id: Optional[str] = None,
    source: str = "WEB-ESS",
    ip_address: Optional[str] = None
) -> AttendanceBreak:
    today = date.today()
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == today
    ).first()

    if not attendance:
        raise ValueError("No active attendance record found for today.")

    active_break = db.query(AttendanceBreak).filter(
        AttendanceBreak.attendance_id == attendance.id,
        AttendanceBreak.ended_at == None
    ).order_by(AttendanceBreak.started_at.desc()).first()

    if not active_break:
        raise ValueError("No active break found to end.")

    now_dt = datetime.now(timezone.utc)
    active_break.ended_at = now_dt
    delta_secs = max(0.0, (now_dt - active_break.started_at).total_seconds())
    active_break.duration_minutes = int(delta_secs / 60)

    # Re-sum all break durations for this attendance record
    all_breaks = db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == attendance.id).all()
    total_break_mins = sum(b.duration_minutes or 0 for b in all_breaks)
    attendance.break_duration_hours = Decimal(str(round(total_break_mins / 60.0, 2)))

    attendance.calculated_status = "IN_SHIFT"
    db.commit()
    db.refresh(active_break)

    log_attendance_event(
        db=db,
        attendance_id=attendance.id,
        employee_id=employee_id,
        actor_id=actor_id or employee_id,
        event_type="BREAK_END",
        source=source,
        ip_address=ip_address,
        new_state={
            "break_id": active_break.id,
            "duration_minutes": active_break.duration_minutes,
            "total_break_hours": float(attendance.break_duration_hours)
        }
    )

    return active_break


def record_check_out(
    db: Session,
    employee_id: str,
    check_out_dt: Optional[datetime] = None,
    actor_id: Optional[str] = None,
    source: str = "WEB-ESS",
    ip_address: Optional[str] = None
) -> Attendance:
    if not check_out_dt:
        check_out_dt = datetime.now()

    today = check_out_dt.date()
    attendance = db.query(Attendance).filter(
        Attendance.employee_id == employee_id,
        Attendance.date == today
    ).first()

    if not attendance or not attendance.check_in:
        raise ValueError("Cannot check out: no check-in record found for today. Please check in first.")

    # Automatically close any open break if user clicks punch out
    open_break = db.query(AttendanceBreak).filter(
        AttendanceBreak.attendance_id == attendance.id,
        AttendanceBreak.ended_at == None
    ).first()
    if open_break:
        open_break.ended_at = datetime.now(timezone.utc)
        delta_secs = max(0.0, (open_break.ended_at - open_break.started_at).total_seconds())
        open_break.duration_minutes = int(delta_secs / 60)

    attendance.check_out = check_out_dt

    # Get shift & policy
    shift, policy = get_employee_active_shift_and_policy(db, employee_id)

    # Compute raw seconds
    raw_seconds = max(0.0, (check_out_dt - attendance.check_in).total_seconds())

    # Deduct total break duration
    all_breaks = db.query(AttendanceBreak).filter(AttendanceBreak.attendance_id == attendance.id).all()
    total_break_mins = sum(b.duration_minutes or 0 for b in all_breaks)
    break_secs = total_break_mins * 60.0

    # Deduct Friday Jumma break if Friday
    jumma_seconds = 0.0
    if attendance.check_in.weekday() == 4:  # 4 = Friday
        jumma_start = datetime.combine(today, time(13, 0))
        jumma_end = datetime.combine(today, time(14, 30))
        overlap_start = max(attendance.check_in, jumma_start)
        overlap_end = min(check_out_dt, jumma_end)
        if overlap_end > overlap_start:
            jumma_seconds = (overlap_end - overlap_start).total_seconds()

    net_seconds = max(0.0, raw_seconds - max(break_secs, jumma_seconds))
    duration_hours = net_seconds / 3600.0
    attendance.regular_hours = Decimal(str(round(min(duration_hours, float(policy.standard_hours or 8.0)), 2)))
    attendance.break_duration_hours = Decimal(str(round(total_break_mins / 60.0, 2)))

    # Policy threshold evaluation
    half_day_thresh = float(policy.half_day_threshold or 4.0)
    if duration_hours < 1.0:
        attendance.status = "incomplete_absent"
        attendance.calculated_status = "ABSENT"
    elif duration_hours < half_day_thresh:
        attendance.status = "half_day"
        attendance.calculated_status = "HALF_DAY"
    else:
        attendance.calculated_status = "PUNCHED_OUT"

    # Overtime calculation based on policy
    ot_thresh = float(policy.overtime_after_hours or 8.0)
    max_ot = float(policy.max_daily_overtime or 4.0)
    unapproved_ot = 0.0
    if duration_hours > ot_thresh:
        raw_ot = duration_hours - ot_thresh
        unapproved_ot = round(min(raw_ot, max_ot), 2)
        if unapproved_ot > 0:
            attendance.calculated_status = "OVERTIME"

    attendance.unapproved_ot_hours = Decimal(str(unapproved_ot))
    if attendance.overtime_hours is None:
        attendance.overtime_hours = Decimal('0.00')

    db.commit()
    db.refresh(attendance)

    log_attendance_event(
        db=db,
        attendance_id=attendance.id,
        employee_id=employee_id,
        actor_id=actor_id or employee_id,
        event_type="PUNCH_OUT",
        source=source,
        ip_address=ip_address,
        new_state={
            "check_out": attendance.check_out.isoformat() if attendance.check_out else None,
            "status": attendance.status,
            "calculated_status": attendance.calculated_status,
            "regular_hours": float(attendance.regular_hours),
            "unapproved_ot_hours": float(attendance.unapproved_ot_hours)
        }
    )

    return attendance
