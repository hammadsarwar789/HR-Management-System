import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.session import db_session, engine
from app.db.base import Base
import app.models  # load models
from app.models.auth import Permission, Role, User, RolePermission
from app.models.employee import Department, Employee
from app.models.leave import LeaveType, LeaveBalance
from app.models.payroll import SalaryStructure
from app.models.asset import Asset
from app.models.holiday import Holiday, Announcement
from app.models.audit import ActivityLog
from app.core.security import hash_password, log_activity

def seed():
    print("Initializing Database Schemas...")
    Base.metadata.create_all(bind=engine)

    print("Seeding Permissions Catalog...")
    permissions_list = [
        ("employee:read", "Read employee details"),
        ("employee:write", "Create/Edit employee records"),
        ("payroll:read", "View payroll runs & payslips"),
        ("payroll:approve", "Trigger and approve payroll runs"),
        ("leave:request", "Apply for leave"),
        ("leave:approve", "Approve or reject leave requests"),
        ("attendance:read", "View attendance records"),
        ("attendance:write", "Check-in/out and biometric ingest"),
        ("asset:manage", "Manage and assign company assets"),
        ("expense:manage", "Approve and manage expense claims"),
        ("audit:read", "View system activity audit logs"),
    ]

    perm_map = {}
    for code, desc in permissions_list:
        p = db_session.query(Permission).filter(Permission.code == code).first()
        if not p:
            p = Permission(code=code, description=desc)
            db_session.add(p)
            db_session.flush()
        perm_map[code] = p

    print("Seeding Base Roles...")
    roles_def = [
        ("Super Admin", True, list(perm_map.keys())),
        ("HR Manager", True, ["employee:read", "employee:write", "payroll:read", "payroll:approve", "leave:request", "leave:approve", "attendance:read", "attendance:write", "asset:manage", "expense:manage", "audit:read"]),
        ("Department Manager", True, ["employee:read", "leave:request", "leave:approve", "attendance:read", "expense:manage"]),
        ("Employee", True, ["leave:request", "attendance:read", "payroll:read"])
    ]

    role_map = {}
    for r_name, is_sys, r_perms in roles_def:
        role = db_session.query(Role).filter(Role.name == r_name).first()
        if not role:
            role = Role(name=r_name, is_system_role=is_sys)
            db_session.add(role)
            db_session.flush()
            for p_code in r_perms:
                if p_code in perm_map:
                    role.permissions.append(perm_map[p_code])
        role_map[r_name] = role

    print("Seeding Departments...")
    depts = ["Software Engineering", "Human Resources", "Quality Assurance", "Operations"]
    dept_map = {}
    for d_name in depts:
        d = db_session.query(Department).filter(Department.name == d_name).first()
        if not d:
            d = Department(name=d_name)
            db_session.add(d)
            db_session.flush()
        dept_map[d_name] = d

    print("Seeding Base Users & Employee Profiles...")
    users_to_create = [
        {
            "email": "admin@maxenius.com",
            "password": "Admin@123",
            "role": "Super Admin",
            "code": "EMP-001",
            "first_name": "Super",
            "last_name": "Admin",
            "cnic": "42101-1111111-1",
            "dept": "Software Engineering",
            "designation": "CTO / Admin",
            "joining_date": date(2023, 1, 1),
            "salary": Decimal("350000.00"),
            "allowances": {"Housing": 50000, "Medical": 35000, "Transport": 15000}
        },
        {
            "email": "hr@maxenius.com",
            "password": "Hr@12345",
            "role": "HR Manager",
            "code": "EMP-002",
            "first_name": "Fatima",
            "last_name": "Zahra",
            "cnic": "42101-2222222-2",
            "dept": "Human Resources",
            "designation": "HR Manager",
            "joining_date": date(2023, 3, 15),
            "salary": Decimal("220000.00"),
            "allowances": {"Housing": 30000, "Medical": 20000, "Transport": 10000}
        },
        {
            "email": "manager@maxenius.com",
            "password": "Manager@123",
            "role": "Department Manager",
            "code": "EMP-003",
            "first_name": "Tariq",
            "last_name": "Mahmood",
            "cnic": "42101-3333333-3",
            "dept": "Software Engineering",
            "designation": "Engineering Manager",
            "joining_date": date(2023, 5, 1),
            "salary": Decimal("280000.00"),
            "allowances": {"Housing": 40000, "Medical": 25000, "Transport": 15000}
        },
        {
            "email": "employee@maxenius.com",
            "password": "Employee@123",
            "role": "Employee",
            "code": "EMP-004",
            "first_name": "Ali",
            "last_name": "Khan",
            "cnic": "42101-4444444-4",
            "dept": "Software Engineering",
            "designation": "Senior Fullstack Developer",
            "joining_date": date(2024, 1, 10),
            "salary": Decimal("180000.00"),
            "allowances": {"Housing": 25000, "Medical": 15000, "Transport": 10000}
        },
        {
            "email": "employee2@maxenius.com",
            "password": "Employee@123",
            "role": "Employee",
            "code": "EMP-005",
            "first_name": "Sara",
            "last_name": "Ahmed",
            "cnic": "42101-5555555-5",
            "dept": "Quality Assurance",
            "designation": "QA Automation Lead",
            "joining_date": date(2024, 2, 1),
            "salary": Decimal("150000.00"),
            "allowances": {"Housing": 20000, "Medical": 12000, "Transport": 8000}
        }
    ]

    for u_info in users_to_create:
        u = db_session.query(User).filter(User.email == u_info["email"]).first()
        if not u:
            u = User(
                email=u_info["email"],
                password_hash=hash_password(u_info["password"]),
                role_id=role_map[u_info["role"]].id,
                is_active=True
            )
            db_session.add(u)
            db_session.flush()

            emp = Employee(
                id=u.id,
                employee_code=u_info["code"],
                first_name=u_info["first_name"],
                last_name=u_info["last_name"],
                cnic=u_info["cnic"],
                department_id=dept_map[u_info["dept"]].id,
                designation=u_info["designation"],
                location="Lahore Office",
                employment_type="full_time",
                joining_date=u_info["joining_date"],
                status="active"
            )
            db_session.add(emp)

            # Salary structure with 5% security holdback
            sal = SalaryStructure(
                employee_id=u.id,
                basic_salary=u_info["salary"],
                allowances=u_info["allowances"],
                security_deduction_rate=Decimal("5.00"),
                tax_bracket_rate=Decimal("2.50"),
                effective_from=u_info["joining_date"]
            )
            db_session.add(sal)

    # Set Engineering Dept Manager
    mgr_user = db_session.query(User).filter(User.email == "manager@maxenius.com").first()
    if mgr_user:
        dept_map["Software Engineering"].manager_id = mgr_user.id

    print("Seeding Leave Types & Allocations...")
    leave_types_data = [
        ("Casual Leave", 10, False),
        ("Sick Leave", 10, False),
        ("Annual Paid Leave", 14, True)
    ]
    lt_map = {}
    for name, days, hr_app in leave_types_data:
        lt = db_session.query(LeaveType).filter(LeaveType.name == name).first()
        if not lt:
            lt = LeaveType(name=name, allowed_days_per_year=days, requires_hr_approval=hr_app)
            db_session.add(lt)
            db_session.flush()
        lt_map[name] = lt

    current_year = date.today().year
    all_employees = db_session.query(Employee).all()
    for emp in all_employees:
        for lt_name, lt_obj in lt_map.items():
            b = db_session.query(LeaveBalance).filter(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.leave_type_id == lt_obj.id,
                LeaveBalance.year == current_year
            ).first()
            if not b:
                b = LeaveBalance(
                    employee_id=emp.id,
                    leave_type_id=lt_obj.id,
                    year=current_year,
                    allocated_days=Decimal(str(lt_obj.allowed_days_per_year)),
                    used_days=Decimal("0.0")
                )
                db_session.add(b)

    print("Seeding Sample Assets...")
    assets_data = [
        ("MX-LAP-101", "laptop", "MacBook Pro M2 16-inch", "SN-APPLE-9921"),
        ("MX-LAP-102", "laptop", "Dell XPS 15 9530", "SN-DELL-8832"),
        ("MX-MOB-201", "mobile", "Samsung Galaxy S23", "SN-SAMS-1102"),
        ("MX-SIM-301", "sim", "Jazz Corporate SIM", "899201992019")
    ]
    for tag, cat, model, sn in assets_data:
        a = db_session.query(Asset).filter(Asset.asset_tag == tag).first()
        if not a:
            a = Asset(asset_tag=tag, category=cat, model=model, serial_number=sn, status="available")
            db_session.add(a)

    print("Seeding Holidays & Announcements...")
    holidays_data = [
        ("Pakistan Day", date(2026, 3, 23), "public"),
        ("Labor Day", date(2026, 5, 1), "public"),
        ("Independence Day", date(2026, 8, 14), "public"),
        ("Maxenius Annual Hackathon", date(2026, 11, 15), "company"),
    ]
    for h_name, h_date, h_type in holidays_data:
        h = db_session.query(Holiday).filter(Holiday.name == h_name).first()
        if not h:
            h = Holiday(name=h_name, date=h_date, type=h_type)
            db_session.add(h)

    ann_check = db_session.query(Announcement).first()
    if not ann_check:
        ann = Announcement(
            title="Welcome to Maxenius HRMS 1.0!",
            body="We are thrilled to launch our new internal HR management portal for streamlined employee lifecycle, attendance, leave, asset management, and automated payroll runs.",
            category="general"
        )
        db_session.add(ann)

    print("Seeding Audit Log...")
    log_activity("system.initialized", entity_type="System", metadata={"version": "1.0"})

    db_session.commit()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed()
