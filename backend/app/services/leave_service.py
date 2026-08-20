from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session
from app.models.leave import LeaveRequest, LeaveBalance, LeaveType

def create_leave_request(db: Session, employee_id: str, leave_type_id: int, start_date: date, end_date: date, reason: str = None, is_half_day: bool = False) -> LeaveRequest:
    if is_half_day:
        if start_date != end_date:
            raise ValueError("Half-day leave request must have matching start and end dates")
        total_days = Decimal("0.5")
    else:
        total_days = Decimal(str((end_date - start_date).days + 1))
        if total_days <= 0:
            raise ValueError("End date must be greater than or equal to start date")

    # BUG-013 FIX: Warn on cross-year requests (spans two calendar years)
    if start_date.year != end_date.year:
        raise ValueError(
            f"Leave request spans two calendar years ({start_date.year}/{end_date.year}). "
            "Please submit separate requests for each year."
        )

    # Check leave balance
    current_year = start_date.year
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == employee_id,
        LeaveBalance.leave_type_id == leave_type_id,
        LeaveBalance.year == current_year
    ).first()

    if not balance:
        raise ValueError(f"No leave balance allocated for year {current_year}")

    remaining = balance.allocated_days - balance.used_days
    if remaining < total_days:
        raise ValueError(f"Insufficient leave balance. Available: {remaining} days, requested: {total_days} days")

    request = LeaveRequest(
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        start_date=start_date,
        end_date=end_date,
        total_days=total_days,
        is_half_day=is_half_day,
        reason=reason,
        status="pending"
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request

def approve_leave_request(db: Session, request_id: str, approver_user_id: str) -> LeaveRequest:
    # BUG-007 FIX: Use SELECT FOR UPDATE to prevent concurrent double-approval race condition
    req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).with_for_update().first()
    if not req:
        raise ValueError("Leave request not found")
    if req.status != "pending":
        raise ValueError(f"Cannot approve request with status: {req.status}")

    current_year = req.start_date.year
    balance = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == req.employee_id,
        LeaveBalance.leave_type_id == req.leave_type_id,
        LeaveBalance.year == current_year
    ).first()

    if balance:
        balance.used_days += req.total_days

    req.status = "approved"
    req.approved_by = approver_user_id
    db.commit()
    db.refresh(req)
    return req

def reject_leave_request(db: Session, request_id: str, approver_user_id: str, rejection_reason: str = None) -> LeaveRequest:
    req = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not req:
        raise ValueError("Leave request not found")

    if req.status == "approved":
        # Restore balance if previously approved
        current_year = req.start_date.year
        balance = db.query(LeaveBalance).filter(
            LeaveBalance.employee_id == req.employee_id,
            LeaveBalance.leave_type_id == req.leave_type_id,
            LeaveBalance.year == current_year
        ).first()
        if balance:
            balance.used_days = max(Decimal('0.0'), balance.used_days - req.total_days)

    req.status = "rejected"
    req.approved_by = approver_user_id
    req.rejection_reason = rejection_reason
    db.commit()
    db.refresh(req)
    return req
