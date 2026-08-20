import sys
import os
from datetime import date
from decimal import Decimal
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.db.session import db_session
from app.models.employee import Employee
from app.models.leave import LeaveType, LeaveBalance, LeaveRequest
from app.services.leave_service import create_leave_request, approve_leave_request

def test_half_day_leave_request_creation():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    leave_type = db_session.query(LeaveType).first()
    assert leave_type is not None

    today = date(2026, 8, 20)

    # Ensure leave balance exists for year
    balance = db_session.query(LeaveBalance).filter(
        LeaveBalance.employee_id == emp.id,
        LeaveBalance.leave_type_id == leave_type.id,
        LeaveBalance.year == today.year
    ).first()

    if not balance:
        balance = LeaveBalance(
            employee_id=emp.id,
            leave_type_id=leave_type.id,
            year=today.year,
            allocated_days=Decimal("20.0"),
            used_days=Decimal("0.0")
        )
        db_session.add(balance)
    else:
        balance.allocated_days = Decimal("20.0")
        balance.used_days = Decimal("0.0")
    db_session.commit()

    initial_used = float(balance.used_days)

    # Submit Half Day Leave Request
    req = create_leave_request(
        db=db_session,
        employee_id=emp.id,
        leave_type_id=leave_type.id,
        start_date=today,
        end_date=today,
        reason="Personal half-day off",
        is_half_day=True
    )

    assert req.is_half_day is True
    assert float(req.total_days) == 0.5

    # Approve Half Day Leave Request
    admin_user_id = emp.id
    approved_req = approve_leave_request(db_session, req.id, admin_user_id)
    assert approved_req.status == "approved"

    db_session.refresh(balance)
    assert float(balance.used_days) == initial_used + 0.5

def test_half_day_leave_date_mismatch_error():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    leave_type = db_session.query(LeaveType).first()

    start = date(2026, 8, 21)
    end = date(2026, 8, 22)

    with pytest.raises(ValueError) as exc_info:
        create_leave_request(
            db=db_session,
            employee_id=emp.id,
            leave_type_id=leave_type.id,
            start_date=start,
            end_date=end,
            reason="Invalid multi-day half-day request",
            is_half_day=True
        )

    assert "Half-day leave request must have matching start and end dates" in str(exc_info.value)
