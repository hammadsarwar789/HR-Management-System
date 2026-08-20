import sys
import os
from datetime import date
from decimal import Decimal
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.db.session import db_session
from app.models.employee import Employee
from app.models.payroll import SalaryStructure, PayrollRun
from app.services.payroll_service import calculate_payroll_for_employee

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_login_super_admin(client):
    rv = client.post("/api/v1/auth/login", json={
        "email": "admin@maxenius.com",
        "password": "Admin@123"
    })
    assert rv.status_code == 200
    data = rv.get_json()
    assert "access_token" in data or data.get("requires_2fa") is True
    assert data.get("email") == "admin@maxenius.com" or data.get("user", {}).get("email") == "admin@maxenius.com"

def test_payroll_security_holdback_calculation():
    emp = db_session.query(Employee).filter(Employee.employee_code == "EMP-004").first()
    assert emp is not None

    month_year = date(2026, 8, 1)
    run = calculate_payroll_for_employee(db_session, emp.id, month_year)

    # Basic: 180,000, Allowances: 50,000 -> Gross: 230,000
    # Security holdback = 5% of basic (180,000 * 0.05 = 9,000)
    # Tax = 2.5% of gross (230,000 * 0.025 = 5,750)
    # Net = 230,000 - 9,000 - 5,750 = 215,250
    assert float(run.security_deduction) == 9000.0
    assert float(run.basic_salary) == 180000.0
    assert float(run.net_salary) == 215250.0
