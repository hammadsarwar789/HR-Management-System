import sys
import os
from datetime import datetime, time
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.db.session import db_session
from app.models.employee import Employee
from app.services.attendance_service import record_check_in, get_shift_config

def test_get_shift_config():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    config = get_shift_config(db_session, emp.id)
    assert "earliest_check_in" in config
    assert "end_time" in config
    assert config["earliest_check_in"] < config["start_time"]

from app.models.attendance import Attendance

def test_check_in_within_shift_hours():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    today = datetime.now().date()
    db_session.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == today).delete()
    db_session.commit()

    config = get_shift_config(db_session, emp.id)
    
    # Check-in at 12:00 PM (valid window)
    valid_dt = datetime.combine(today, time(12, 0))
    rec = record_check_in(db_session, emp.id, check_in_dt=valid_dt)
    assert rec is not None
    assert rec.check_in == valid_dt


def test_check_in_outside_shift_hours_too_early():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    today = datetime.now().date()
    # Check-in at 05:00 AM (too early before shift start)
    too_early_dt = datetime.combine(today, time(5, 0))
    
    with pytest.raises(ValueError) as exc_info:
        record_check_in(db_session, emp.id, check_in_dt=too_early_dt)
    
    assert "Check-in outside shift hours" in str(exc_info.value)

def test_check_in_outside_shift_hours_too_late():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    today = datetime.now().date()
    # Check-in at 11:30 PM (after shift end time)
    too_late_dt = datetime.combine(today, time(23, 30))
    
    with pytest.raises(ValueError) as exc_info:
        record_check_in(db_session, emp.id, check_in_dt=too_late_dt)
    
    assert "Check-in outside shift hours" in str(exc_info.value)
