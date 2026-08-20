import os
import uuid
import base64
import re
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from flask_jwt_extended import jwt_required
from sqlalchemy.orm.attributes import flag_modified
from app.db.session import db_session
from app.models.employee import Employee, Department, EmployeeDocument
from app.models.auth import User, Role
from app.models.payroll import SalaryStructure
from app.core.security import get_current_user, permission_required, role_required, hash_password, log_activity

employees_bp = Blueprint("employees", __name__, url_prefix="/employees")

def has_financial_clearance(user, target_emp_id=None):
    """Check if user has FINANCIAL_DATA_READ clearance (Super Admin, HR Manager, Finance Admin, or self)."""
    if not user or not user.is_active:
        return False
    if user.role and user.role.name in ["Super Admin", "HR Manager", "Finance Admin"]:
        return True
    if target_emp_id and user.employee and str(user.employee.id) == str(target_emp_id):
        return True
    return False

@employees_bp.route("", methods=["GET"])
@jwt_required()
def list_employees():
    current_user = get_current_user()
    query = db_session.query(Employee)

    # Scoped row-level access: Department Managers see only their department
    if current_user.role and current_user.role.name == "Department Manager":
        dept = db_session.query(Department).filter(Department.manager_id == current_user.id).first()
        if dept:
            query = query.filter(Employee.department_id == dept.id)
        else:
            return jsonify({"employees": [], "total": 0})
    elif current_user.role and current_user.role.name == "Employee":
        query = query.filter(Employee.id == current_user.id)

    dept_id = request.args.get("department_id")
    status = request.args.get("status")
    search = request.args.get("search")

    if dept_id:
        query = query.filter(Employee.department_id == int(dept_id))
    if status:
        query = query.filter(Employee.status == status)
    if search:
        query = query.filter((Employee.first_name.ilike(f"%{search}%")) | (Employee.last_name.ilike(f"%{search}%")) | (Employee.employee_code.ilike(f"%{search}%")))

    employees = query.all()
    res = []
    for emp in employees:
        has_clearance = has_financial_clearance(current_user, emp.id)

        if has_clearance:
            sal_struct = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id == emp.id).order_by(SalaryStructure.effective_from.desc()).first()
            basic_sal = float(sal_struct.basic_salary) if sal_struct else 0.0
            sec_holdback = float(basic_sal * 0.05) if sal_struct else 0.0
        else:
            basic_sal = None
            sec_holdback = None

        res.append({
            "id": emp.id,
            "employee_code": emp.employee_code,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "email": emp.user.email if emp.user else None,
            "cnic": emp.cnic,
            "phone": emp.phone,
            "department_id": emp.department_id,
            "department_name": emp.department.name if emp.department else None,
            "designation": emp.designation,
            "location": emp.location,
            "employment_type": emp.employment_type,
            "joining_date": emp.joining_date.strftime("%Y-%m-%d") if emp.joining_date else None,
            "status": emp.status,
            "basic_salary": basic_sal,
            "security_holdback": sec_holdback
        })

    return jsonify({"employees": res, "total": len(res)})


@employees_bp.route("/<string:emp_id>", methods=["GET"])
@jwt_required()
def get_employee(emp_id):
    current_user = get_current_user()
    emp = db_session.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        return jsonify({"error": {"code": "not_found", "message": "Employee not found"}}), 404

    if current_user.role and current_user.role.name == "Employee":
        if not current_user.employee or str(current_user.employee.id) != str(emp_id):
            return jsonify({"error": {"code": "forbidden", "message": "Access restricted"}}), 403

    has_clearance = has_financial_clearance(current_user, emp_id)

    sal_struct = None
    if has_clearance:
        sal_struct = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id == emp_id).order_by(SalaryStructure.effective_from.desc()).first()

    # Query assigned assets
    from app.models.asset import AssetAssignment, Asset
    assignments = db_session.query(AssetAssignment).filter(AssetAssignment.employee_id == emp_id).all()
    assigned_assets = []
    for a in assignments:
        if a.asset:
            assigned_assets.append({
                "id": a.asset.id,
                "asset_tag": a.asset.asset_tag,
                "category": a.asset.category,
                "model": a.asset.model,
                "serial_number": a.asset.serial_number,
                "assigned_date": a.assigned_date.strftime("%Y-%m-%d") if a.assigned_date else None,
                "notes": a.notes
            })

    # Query expense claims
    from app.models.expense import ExpenseRequest
    claims = db_session.query(ExpenseRequest).filter(ExpenseRequest.employee_id == emp_id).order_by(ExpenseRequest.created_at.desc()).all()
    expense_claims = [{
        "id": c.id,
        "category": c.category,
        "amount": float(c.amount) if has_clearance else None,
        "description": c.description,
        "claim_date": c.claim_date.strftime("%Y-%m-%d") if c.claim_date else c.created_at.strftime("%Y-%m-%d"),
        "status": c.status,
        "rejection_reason": c.rejection_reason
    } for c in claims]

    # Query performance reviews & goals
    from app.models.performance import PerformanceReview, PerformanceGoal
    reviews = db_session.query(PerformanceReview).filter(PerformanceReview.employee_id == emp_id).order_by(PerformanceReview.created_at.desc()).all()
    perf_reviews = [{
        "id": r.id,
        "cycle": r.cycle,
        "kpi_score": float(r.kpi_score) if r.kpi_score else 4.5,
        "feedback": r.feedback,
        "reviewer_name": f"{r.reviewer.employee.first_name} {r.reviewer.employee.last_name}" if r.reviewer and r.reviewer.employee else "HR Manager",
        "created_at": r.created_at.strftime("%Y-%m-%d") if r.created_at else None
    } for r in reviews]

    goals = db_session.query(PerformanceGoal).filter(PerformanceGoal.employee_id == emp_id).all()
    perf_goals = [{
        "id": g.id,
        "cycle": g.cycle,
        "title": g.title,
        "description": g.description,
        "status": g.status or "in_progress"
    } for g in goals]

    # Query documents
    docs = db_session.query(EmployeeDocument).filter(EmployeeDocument.employee_id == emp_id).all()
    documents = []
    for d in docs:
        raw_key = d.storage_key or "Document"
        title = "Document"
        file_url = f"/uploads/documents/doc_{d.employee_id}_{d.id[:8]}.pdf"

        if raw_key.startswith("{") and ("file_url" in raw_key or "title" in raw_key):
            try:
                payload = json.loads(raw_key)
                title = payload.get("title") or payload.get("document_title") or payload.get("document_name") or payload.get("name") or (d.doc_type or "DOCUMENT").replace("_", " ").title()
                file_url = payload.get("file_url") or file_url
            except Exception:
                title = raw_key
        elif raw_key.startswith("/uploads/") or raw_key.startswith("http"):
            file_url = raw_key
            title = (d.doc_type or "EMPLOYEE").replace("_", " ").title() + " Document"
        elif raw_key:
            title = raw_key

        doc_type_clean = (d.doc_type or "cv").upper()
        documents.append({
            "id": d.id,
            "title": title,
            "document_title": title,
            "document_name": title,
            "name": title,
            "original_filename": title,
            "file_name": title,
            "doc_type": d.doc_type or "cv",
            "document_type": doc_type_clean,
            "category": doc_type_clean,
            "file_url": file_url,
            "uploaded_at": d.uploaded_at.strftime("%Y-%m-%d %H:%M") if d.uploaded_at else ""
        })

    if has_clearance and sal_struct:
        basic_sal = float(sal_struct.basic_salary) if sal_struct else 0.0
        sec_holdback = basic_sal * 0.05
        salary_structure_dto = {
            "basic_salary": basic_sal,
            "allowances": sal_struct.allowances if sal_struct else {},
            "total_allowances": sum(float(v) for v in (sal_struct.allowances or {}).values()) if sal_struct else 0.0,
            "security_deduction_rate": float(sal_struct.security_deduction_rate) if sal_struct else 5.0,
            "security_holdback": sec_holdback,
            "tax_bracket_rate": float(sal_struct.tax_bracket_rate) if sal_struct else 0.0
        }
    else:
        salary_structure_dto = None

    return jsonify({
        "id": emp.id,
        "employee_code": emp.employee_code,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "email": emp.user.email if emp.user else None,
        "role": emp.user.role.name if emp.user and emp.user.role else "Employee",
        "cnic": emp.cnic,
        "phone": emp.phone,
        "department_id": emp.department_id,
        "department_name": emp.department.name if emp.department else None,
        "designation": emp.designation,
        "location": emp.location,
        "employment_type": emp.employment_type,
        "joining_date": emp.joining_date.strftime("%Y-%m-%d") if emp.joining_date else None,
        "emergency_contact": emp.emergency_contact or {},
        "status": emp.status,
        "salary_structure": salary_structure_dto,
        "assigned_assets": assigned_assets,
        "expense_claims": expense_claims,
        "performance_reviews": perf_reviews,
        "performance_goals": perf_goals,
        "documents": documents
    })


@employees_bp.route("/<string:emp_id>/compensation", methods=["GET"])
@jwt_required()
def get_employee_compensation(emp_id):
    """Dedicated financial compensation endpoint guarded by RBAC or self-ownership check."""
    current_user = get_current_user()
    if not has_financial_clearance(current_user, emp_id):
        return jsonify({"error": {"code": "forbidden", "message": "Access restricted: Sensitive financial data clearance required"}}), 403

    emp = db_session.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        return jsonify({"error": {"code": "not_found", "message": "Employee not found"}}), 404

    sal_struct = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id == emp_id).order_by(SalaryStructure.effective_from.desc()).first()
    basic_sal = float(sal_struct.basic_salary) if sal_struct else 0.0
    sec_holdback = basic_sal * 0.05

    return jsonify({
        "employee_id": emp.id,
        "employee_code": emp.employee_code,
        "basic_salary": basic_sal,
        "allowances": sal_struct.allowances if sal_struct else {},
        "total_allowances": sum(float(v) for v in (sal_struct.allowances or {}).values()) if sal_struct else 0.0,
        "security_deduction_rate": float(sal_struct.security_deduction_rate) if sal_struct else 5.0,
        "security_holdback": sec_holdback,
        "tax_bracket_rate": float(sal_struct.tax_bracket_rate) if sal_struct else 0.0,
        "effective_from": sal_struct.effective_from.strftime("%Y-%m-%d") if sal_struct and sal_struct.effective_from else None
    })

def generate_next_employee_code():
    codes = [e.employee_code for e in db_session.query(Employee.employee_code).all() if e.employee_code]
    numbers = []
    for c in codes:
        m = re.search(r"EMP-(\d+)", c, re.IGNORECASE)
        if m:
            numbers.append(int(m.group(1)))
        else:
            m2 = re.search(r"^(\d+)$", c)
            if m2 and int(m2.group(1)) < 1000:
                numbers.append(int(m2.group(1)))
    next_num = max(numbers) + 1 if numbers else 1
    return f"EMP-{next_num:03d}"

@employees_bp.route("/next-code", methods=["GET"])
@jwt_required()
def get_next_employee_code():
    return jsonify({"next_code": generate_next_employee_code()})

@employees_bp.route("", methods=["POST"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def create_employee():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "Employee@123")
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    cnic = (data.get("cnic") or "").strip()
    employee_code = (data.get("employee_code") or "").strip()
    designation = (data.get("designation") or "").strip()
    joining_date_str = data.get("joining_date") or datetime.utcnow().strftime("%Y-%m-%d")
    try:
        joining_date = datetime.strptime(joining_date_str, "%Y-%m-%d").date()
    except ValueError:
        joining_date = datetime.utcnow().date()

    # Auto-generate employee_code if not provided or set to AUTO
    if not employee_code or employee_code.upper() == "AUTO":
        employee_code = generate_next_employee_code()

    if not all([email, first_name, last_name, cnic, designation]):
        return jsonify({"error": {"code": "bad_request", "message": "Missing required fields: email, first_name, last_name, cnic, designation"}}), 400

    # 1. Strict Email Format Verification
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
        return jsonify({"error": {"code": "bad_request", "message": "Invalid email address format (e.g. employee@maxenius.com)"}}), 400

    # 2. Email Uniqueness Verification
    if db_session.query(User).filter(User.email == email).first():
        return jsonify({"error": {"code": "duplicate", "message": "Email address already registered"}}), 400

    # 3. Strict CNIC Format Verification (13 digits: XXXXX-XXXXXXX-X)
    if not re.match(r"^\d{5}-\d{7}-\d{1}$", cnic):
        return jsonify({"error": {"code": "bad_request", "message": "Invalid CNIC format. CNIC must be 13 digits formatted as XXXXX-XXXXXXX-X (e.g. 42101-1234567-1)"}}), 400

    # 4. CNIC Uniqueness Verification
    if db_session.query(Employee).filter(Employee.cnic == cnic).first():
        return jsonify({"error": {"code": "duplicate", "message": "CNIC number already registered to another employee profile"}}), 400

    # 5. Employee Code Uniqueness Safety
    if db_session.query(Employee).filter(Employee.employee_code == employee_code).first():
        employee_code = generate_next_employee_code()

    emp_role = db_session.query(Role).filter(Role.name == "Employee").first()

    # Department ID Resolution
    dept_id = int(data.get("department_id") or data.get("department") or 1)

    # Basic Salary and Compensation Validation
    try:
        basic_sal = float(data.get("basic_salary", 150000.0))
        sec_rate = float(data.get("security_deduction_rate", 5.0))
        tax_rate = float(data.get("tax_bracket_rate", 2.5))
    except (ValueError, TypeError):
        return jsonify({"error": {"code": "bad_request", "message": "Invalid numeric input for basic_salary, security_deduction_rate, or tax_bracket_rate"}}), 400

    if basic_sal < 0:
        return jsonify({"error": {"code": "bad_request", "message": "Basic salary cannot be negative"}}), 400

    # Atomic DB Transaction: Step 1 - Provision Auth User
    new_user = User(
        email=email,
        password_hash=hash_password(password),
        role_id=emp_role.id if emp_role else None,
        is_active=True,
        two_factor_enabled=False
    )
    db_session.add(new_user)
    db_session.flush()

    # Step 2 - Create Employee Profile
    new_emp = Employee(
        id=new_user.id,
        employee_code=employee_code,
        first_name=first_name,
        last_name=last_name,
        cnic=cnic,
        phone=data.get("phone"),
        department_id=dept_id,
        designation=designation,
        location=data.get("location") or data.get("work_location") or "Main Office / HQ",
        employment_type=(data.get("employment_type") or "full_time").lower(),
        joining_date=joining_date,
        emergency_contact=data.get("emergency_contact", {}),
        status="active"
    )
    db_session.add(new_emp)

    # Step 3 - Create Salary Structure Record
    sal = SalaryStructure(
        employee_id=new_user.id,
        basic_salary=basic_sal,
        allowances=data.get("allowances", {}),
        security_deduction_rate=sec_rate,
        tax_bracket_rate=tax_rate,
        effective_from=joining_date
    )
    db_session.add(sal)

    # Step 4 - Commit Transaction
    db_session.commit()
    log_activity("employee.created", entity_type="Employee", entity_id=new_user.id, user_id=get_current_user().id)

    dept_obj = db_session.query(Department).filter(Department.id == dept_id).first()

    return jsonify({
        "message": "Employee profile & auth user created successfully",
        "employee": {
            "id": new_user.id,
            "employee_code": employee_code,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "cnic": cnic,
            "designation": designation,
            "department_id": dept_id,
            "department_name": dept_obj.name if dept_obj else "Engineering",
            "employment_type": new_emp.employment_type,
            "joining_date": joining_date.strftime("%Y-%m-%d"),
            "location": new_emp.location,
            "basic_salary": basic_sal,
            "security_holdback": basic_sal * (sec_rate / 100.0),
            "status": "active"
        }
    }), 201


@employees_bp.route("/<string:emp_id>", methods=["PUT", "PATCH"])
@jwt_required()
@role_required("Super Admin", "HR Manager")
def update_employee(emp_id):
    """Partial & full update of employee profile (Admin & HR Manager only)."""
    emp = db_session.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        return jsonify({"error": {"code": "not_found", "message": "Employee not found"}}), 404

    data = request.get_json() or {}

    current_user = get_current_user()
    is_super_admin = bool(current_user and current_user.role and current_user.role.name in ["Super Admin", "SUPER_ADMIN"])

    # 1. Validation & Sync for Email (Super Admin Only)
    if "email" in data and data["email"] and data["email"].strip().lower() != (emp.user.email if emp.user else ""):
        if not is_super_admin:
            return jsonify({"error": {"code": "forbidden", "message": "Only Super Admins can alter primary work email addresses"}}), 403

        new_email = data["email"].strip().lower()
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", new_email):
            return jsonify({"error": {"code": "bad_request", "message": "Invalid email address format (e.g. employee@maxenius.com)"}}), 400

        # Uniqueness check against other users
        existing_user = db_session.query(User).filter(User.email == new_email, User.id != emp.id).first()
        if existing_user:
            return jsonify({"error": {"code": "duplicate", "message": "Email address already registered to another user"}}), 400

        if emp.user:
            emp.user.email = new_email

    # 2. Validation & Sync for CNIC (Super Admin Only)
    if "cnic" in data and data["cnic"] and data["cnic"].strip() != emp.cnic:
        if not is_super_admin:
            return jsonify({"error": {"code": "forbidden", "message": "Only Super Admins can alter primary CNIC numbers"}}), 403

        new_cnic = data["cnic"].strip()
        if not re.match(r"^\d{5}-\d{7}-\d{1}$", new_cnic):
            return jsonify({"error": {"code": "bad_request", "message": "Invalid CNIC format. CNIC must be 13 digits formatted as XXXXX-XXXXXXX-X (e.g. 42101-1234567-1)"}}), 400

        # Uniqueness check against other employees
        existing_cnic = db_session.query(Employee).filter(Employee.cnic == new_cnic, Employee.id != emp.id).first()
        if existing_cnic:
            return jsonify({"error": {"code": "duplicate", "message": "CNIC number already registered to another employee"}}), 400

        emp.cnic = new_cnic

    # 3. Update standard employee fields
    updatable = ["first_name", "last_name", "phone", "designation", "location",
                 "employment_type", "department_id", "status"]
    for field in updatable:
        if field in data and data[field] is not None:
            setattr(emp, field, data[field])

    if "joining_date" in data and data["joining_date"]:
        try:
            emp.joining_date = datetime.strptime(data["joining_date"], "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": {"code": "bad_request", "message": "Invalid joining_date format. Expected YYYY-MM-DD"}}), 400

    if "resignation_date" in data:
        emp.resignation_date = datetime.strptime(data["resignation_date"], "%Y-%m-%d").date() if data["resignation_date"] else None

    # Update Emergency Contact & ESS details
    existing_em = dict(emp.emergency_contact or {})
    if "emergency_contact" in data and isinstance(data["emergency_contact"], dict):
        existing_em.update(data["emergency_contact"])
    if "dob" in data:
        existing_em["dob"] = data["dob"]
    if "gender" in data:
        existing_em["gender"] = data["gender"]
    if "profile_picture_url" in data:
        existing_em["profile_picture_url"] = data["profile_picture_url"]

    emp.emergency_contact = existing_em
    flag_modified(emp, "emergency_contact")

    # 4. Update Salary Structure if provided
    if "basic_salary" in data or "tax_bracket_rate" in data or "allowances" in data:
        sal_struct = db_session.query(SalaryStructure).filter(
            SalaryStructure.employee_id == emp_id
        ).order_by(SalaryStructure.effective_from.desc()).first()

        basic_sal = float(data.get("basic_salary", sal_struct.basic_salary if sal_struct else 0.0))
        tax_rate = float(data.get("tax_bracket_rate", sal_struct.tax_bracket_rate if sal_struct else 2.5))
        allowances = data.get("allowances", sal_struct.allowances if sal_struct else {})

        if sal_struct:
            sal_struct.basic_salary = basic_sal
            sal_struct.tax_bracket_rate = tax_rate
            sal_struct.allowances = allowances
        else:
            sal_struct = SalaryStructure(
                employee_id=emp_id,
                basic_salary=basic_sal,
                allowances=allowances,
                security_deduction_rate=5.0,
                tax_bracket_rate=tax_rate,
                effective_from=emp.joining_date or datetime.utcnow().date()
            )
            db_session.add(sal_struct)

    db_session.commit()
    log_activity("employee.updated", entity_type="Employee", entity_id=emp_id, user_id=get_current_user().id)
    return jsonify({"message": "Employee profile updated successfully", "id": emp.id})


@employees_bp.route("/me", methods=["GET"])
@jwt_required()
def get_my_profile():
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    emp = current_user.employee
    sal_struct = db_session.query(SalaryStructure).filter(SalaryStructure.employee_id == emp.id).order_by(SalaryStructure.effective_from.desc()).first()
    basic_sal = float(sal_struct.basic_salary) if sal_struct else 0.0
    sec_holdback = basic_sal * 0.05

    # Retrieve uploaded documents
    docs = db_session.query(EmployeeDocument).filter(EmployeeDocument.employee_id == emp.id).all()
    doc_list = [{
        "id": d.id,
        "doc_type": d.doc_type,
        "storage_key": d.storage_key,
        "uploaded_at": d.uploaded_at.strftime("%Y-%m-%d %H:%M") if d.uploaded_at else ""
    } for d in docs]

    doc_types_uploaded = [d.doc_type for d in docs]

    # Calculate Profile Completeness Score (%) & Missing Badges
    score = 0
    missing = []
    em_contact = emp.emergency_contact or {}

    # 1. Self-Managed Identity (50%)
    if emp.first_name and emp.last_name:
        score += 5

    if emp.cnic and len(emp.cnic) >= 10:
        score += 10
    else:
        missing.append("Add CNIC Number")

    if emp.phone:
        score += 5
    else:
        missing.append("Add Mobile Phone")

    user_gender = em_contact.get("gender")
    if user_gender and user_gender != "Unspecified":
        score += 10
    else:
        missing.append("Select Gender Identity")

    user_pic = em_contact.get("profile_picture_url")
    if user_pic:
        score += 10
    else:
        missing.append("Upload Profile Picture")

    if em_contact.get("name") and em_contact.get("phone"):
        score += 10
    else:
        missing.append("Add Emergency Contact Person & Phone")

    # 2. Uploaded Documents Vault (30%)
    if "cv" in doc_types_uploaded:
        score += 10
    else:
        missing.append("Upload CV / Resume (PDF)")

    if "cnic" in doc_types_uploaded:
        score += 10
    else:
        missing.append("Upload CNIC Front/Back Scan")

    if "certificate" in doc_types_uploaded or "degree" in doc_types_uploaded:
        score += 10
    else:
        missing.append("Upload Degree or Experience Certificate")

    # 3. Company & Compensation (20% - Auto assigned)
    if emp.designation and emp.joining_date:
        score += 20

    completeness_percentage = min(score, 100)

    return jsonify({
        "id": emp.id,
        "employee_id": emp.id,
        "employee_code": emp.employee_code,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "email": current_user.email,
        "cnic": emp.cnic,
        "phone": emp.phone or "",
        "designation": emp.designation,
        "department_id": emp.department_id,
        "department_name": emp.department.name if emp.department else "Engineering",
        "department": emp.department.name if emp.department else "Engineering",
        "location": emp.location,
        "employment_type": emp.employment_type,
        "joining_date": emp.joining_date.strftime("%Y-%m-%d") if emp.joining_date else "",
        "emergency_contact": emp.emergency_contact or {"name": "", "phone": "", "relationship": ""},
        "status": emp.status,
        "basic_salary": basic_sal,
        "security_holdback": sec_holdback,
        "role": current_user.role.name if current_user.role else "Employee",
        "completeness": {
            "percentage": completeness_percentage,
            "missing_fields": missing,
            "is_complete": completeness_percentage >= 90
        },
        "self_managed": {
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "cnic": emp.cnic,
            "phone": emp.phone or "",
            "emergency_contact": emp.emergency_contact or {"name": "", "phone": "", "relationship": ""},
            "dob": em_contact.get("dob", ""),
            "gender": em_contact.get("gender", "Unspecified"),
            "profile_picture_url": em_contact.get("profile_picture_url", "")
        },
        "company_managed": {
            "employee_code": emp.employee_code,
            "department_id": emp.department_id,
            "department_name": emp.department.name if emp.department else "Engineering",
            "designation": emp.designation,
            "location": emp.location,
            "employment_type": emp.employment_type,
            "joining_date": emp.joining_date.strftime("%Y-%m-%d") if emp.joining_date else "",
            "status": emp.status,
            "basic_salary": basic_sal,
            "security_holdback": sec_holdback
        },
        "documents": doc_list
    })


@employees_bp.route("/me", methods=["PUT"])
@jwt_required()
def update_my_profile():
    """ESS Self-Service Update with Strict RBAC Strategy."""
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    emp = current_user.employee
    data = request.get_json() or {}

    # Strict RBAC Guard: Inspect Super Admin status for identity alterations
    role_name = current_user.role.name if current_user.role else "Employee"
    is_super_admin = role_name in ["Super Admin", "SUPER_ADMIN"]

    if role_name == "Employee":
        restricted = ["designation", "department_id", "employment_type", "joining_date", "basic_salary", "status", "employee_code"]
        for field in restricted:
            if field in data:
                return jsonify({"error": {
                    "code": "forbidden",
                    "message": f"Field '{field}' is company-managed. Only HR Managers & Super Admins can alter compensation or organization governance data."
                }}), 403

    # 1. Identity Email Mutation & Sync (Super Admin Clearance)
    new_email = (data.get("email") or data.get("work_email") or "").strip().lower()
    if new_email and new_email != current_user.email.lower():
        if not is_super_admin:
            return jsonify({"error": {"code": "forbidden", "message": "Only Super Admins can alter primary work email addresses"}}), 403

        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", new_email):
            return jsonify({"error": {"code": "bad_request", "message": "Invalid email address format (e.g. employee@maxenius.com)"}}), 400

        existing_user = db_session.query(User).filter(User.email == new_email, User.id != current_user.id).first()
        if existing_user:
            return jsonify({"error": {"code": "duplicate", "message": "Email address already registered to another user"}}), 400

        current_user.email = new_email

    # 2. Identity CNIC Mutation (Super Admin Clearance)
    new_cnic = (data.get("cnic") or "").strip()
    if new_cnic and new_cnic != (emp.cnic or ""):
        if not is_super_admin:
            return jsonify({"error": {"code": "forbidden", "message": "Only Super Admins can alter primary CNIC numbers"}}), 403

        if not re.match(r"^\d{5}-\d{7}-\d{1}$", new_cnic):
            return jsonify({"error": {"code": "bad_request", "message": "Invalid CNIC format. CNIC must be 13 digits formatted as XXXXX-XXXXXXX-X (e.g. 42101-1234567-1)"}}), 400

        existing_cnic = db_session.query(Employee).filter(Employee.cnic == new_cnic, Employee.id != emp.id).first()
        if existing_cnic:
            return jsonify({"error": {"code": "duplicate", "message": "CNIC number already registered to another employee"}}), 400

        emp.cnic = new_cnic

    # Update Self-managed identity fields
    if "first_name" in data:
        emp.first_name = data["first_name"]
    if "last_name" in data:
        emp.last_name = data["last_name"]
    if "phone" in data:
        emp.phone = data["phone"]

    # Company-managed fields update (Allowed for Super Admin & HR Manager)
    if role_name != "Employee":
        if "designation" in data and data["designation"]:
            emp.designation = data["designation"]
        if "employment_type" in data and data["employment_type"]:
            emp.employment_type = data["employment_type"]
        if "status" in data and data["status"]:
            emp.status = data["status"]
        if "department_id" in data and data["department_id"]:
            emp.department_id = int(data["department_id"])
        if "basic_salary" in data:
            sal_struct = db_session.query(SalaryStructure).filter(
                SalaryStructure.employee_id == emp.id
            ).order_by(SalaryStructure.effective_from.desc()).first()
            if sal_struct:
                sal_struct.basic_salary = float(data["basic_salary"])
            else:
                sal_struct = SalaryStructure(
                    employee_id=emp.id,
                    basic_salary=float(data["basic_salary"]),
                    effective_from=emp.joining_date or datetime.utcnow().date()
                )
                db_session.add(sal_struct)

    # Update Emergency contact & extra info in JSON column
    existing_em = dict(emp.emergency_contact or {})
    if "emergency_contact" and isinstance(data.get("emergency_contact"), dict):
        existing_em.update(data["emergency_contact"])
    if "dob" in data:
        existing_em["dob"] = data["dob"]
    if "gender" in data:
        existing_em["gender"] = data["gender"]
    if "profile_picture_url" in data:
        existing_em["profile_picture_url"] = data["profile_picture_url"]

    emp.emergency_contact = existing_em
    flag_modified(emp, "emergency_contact")

    db_session.commit()
    log_activity("employee.self_updated", entity_type="Employee", entity_id=emp.id, user_id=current_user.id)
    return jsonify({"message": "Profile updated successfully"})


@employees_bp.route("/me/documents", methods=["POST"])
@employees_bp.route("/<string:emp_id>/documents", methods=["POST"])
@jwt_required()
def upload_employee_document(emp_id=None):
    current_user = get_current_user()
    if emp_id and emp_id != "me":
        emp = db_session.query(Employee).filter(Employee.id == emp_id).first()
    else:
        emp = current_user.employee if current_user else None

    if not emp:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    print("Form data received:", request.form)

    uploaded_file = request.files.get("file") or request.files.get("document") or request.files.get("avatar")
    if not uploaded_file and request.files:
        uploaded_file = list(request.files.values())[0]

    title = request.form.get("title") or request.form.get("document_title") or request.form.get("document_name") or request.form.get("name") or request.form.get("filename")
    doc_type = request.form.get("category") or request.form.get("document_type") or request.form.get("doc_type") or "cv"
    file_url = None

    # Option 1: Binary File Upload via multipart/form-data
    if uploaded_file and uploaded_file.filename:
        filename = secure_filename(uploaded_file.filename)
        ext = filename.rsplit(".", 1)[1].lower() if "." in filename else "pdf"
        unique_name = f"doc_{emp.id}_{uuid.uuid4().hex[:8]}.{ext}"
        
        upload_folder = os.path.abspath(os.path.join(current_app.root_path, "uploads", "documents"))
        os.makedirs(upload_folder, exist_ok=True)
        file_path = os.path.join(upload_folder, unique_name)
        uploaded_file.save(file_path)
        
        file_url = f"/uploads/documents/{unique_name}"
        if not title:
            title = filename.rsplit(".", 1)[0].replace("_", " ").title()

    # Option 2: Base64 or JSON Payload
    elif request.is_json:
        data = request.get_json() or {}
        title = title or data.get("title") or data.get("filename")
        doc_type = data.get("document_type") or data.get("category") or data.get("doc_type") or doc_type
        base64_data = data.get("file_data") or data.get("document") or data.get("base64")
        
        if base64_data and "base64" in base64_data:
            try:
                header, encoded = base64_data.split(",", 1) if "," in base64_data else ("", base64_data)
                match = re.search(r"data:[\w/]+;base64", header)
                ext = "pdf"
                if "image/png" in header:
                    ext = "png"
                elif "image/jpeg" in header or "image/jpg" in header:
                    ext = "jpg"
                
                file_bytes = base64.b64decode(encoded)
                unique_name = f"doc_{emp.id}_{uuid.uuid4().hex[:8]}.{ext}"
                upload_folder = os.path.abspath(os.path.join(current_app.root_path, "uploads", "documents"))
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_name)
                with open(file_path, "wb") as f:
                    f.write(file_bytes)
                file_url = f"/uploads/documents/{unique_name}"
            except Exception as e:
                return jsonify({"error": {"code": "bad_request", "message": f"Failed to process document file: {str(e)}"}}), 400
        elif data.get("file_url"):
            file_url = data.get("file_url")

    if not uploaded_file and not file_url:
        return jsonify({"error": {"code": "bad_request", "message": "No document file attached"}}), 400

    storage_payload = json.dumps({
        "title": title,
        "document_title": title,
        "document_name": title,
        "name": title,
        "original_filename": title,
        "file_url": file_url
    })

    doc = EmployeeDocument(
        employee_id=emp.id,
        doc_type=doc_type,
        storage_key=storage_payload,
        uploaded_by=current_user.id
    )
    db_session.add(doc)
    db_session.commit()

    return jsonify({
        "message": "Document uploaded successfully",
        "document": {
            "id": doc.id,
            "title": title,
            "document_title": title,
            "document_name": title,
            "name": title,
            "original_filename": title,
            "doc_type": doc_type,
            "document_type": doc_type.upper(),
            "category": doc_type.upper(),
            "file_url": file_url,
            "uploaded_at": doc.uploaded_at.strftime("%Y-%m-%d") if doc.uploaded_at else None
        }
    }), 201


@employees_bp.route("/me/documents/<string:doc_id>", methods=["DELETE"])
@employees_bp.route("/<string:emp_id>/documents/<string:doc_id>", methods=["DELETE"])
@jwt_required()
def delete_employee_document(doc_id, emp_id=None):
    current_user = get_current_user()
    if emp_id and emp_id != "me":
        target_emp_id = emp_id
    else:
        target_emp_id = current_user.employee.id if (current_user and current_user.employee) else None

    doc = db_session.query(EmployeeDocument).filter(
        EmployeeDocument.id == doc_id,
        EmployeeDocument.employee_id == target_emp_id
    ).first()

    if not doc:
        return jsonify({"error": {"code": "not_found", "message": "Document not found"}}), 404

    db_session.delete(doc)
    db_session.commit()
    return jsonify({"message": "Document removed successfully"})


@employees_bp.route("/me/avatar", methods=["POST"])
@jwt_required()
def upload_my_avatar():
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    emp = current_user.employee
    existing_em = dict(emp.emergency_contact or {})
    url = None

    # Option 1: File Upload (multipart/form-data)
    uploaded_file = request.files.get("avatar") or request.files.get("file")
    if uploaded_file and uploaded_file.filename:
        filename = secure_filename(uploaded_file.filename)
        ext = filename.rsplit(".", 1)[1].lower() if "." in filename else "png"
        if ext not in ["jpg", "jpeg", "png", "webp", "gif", "svg"]:
            return jsonify({"error": {"code": "bad_request", "message": "Invalid image format. Allowed: JPG, PNG, WEBP, GIF, SVG"}}), 400

        unique_name = f"avatar_{emp.id}_{uuid.uuid4().hex[:8]}.{ext}"
        upload_folder = os.path.abspath(os.path.join(current_app.root_path, "uploads", "avatars"))
        os.makedirs(upload_folder, exist_ok=True)
        file_path = os.path.join(upload_folder, unique_name)
        uploaded_file.save(file_path)
        url = f"/uploads/avatars/{unique_name}"

    else:
        # Option 2: JSON or Form payload (Base64 or URL)
        data = request.get_json(silent=True) or request.form or {}
        avatar_data = data.get("avatar_data")
        profile_pic_url = data.get("profile_picture_url")

        if avatar_data and "base64" in avatar_data:
            try:
                header, encoded = avatar_data.split(",", 1) if "," in avatar_data else ("", avatar_data)
                match = re.search(r"data:image/(\w+);base64", header)
                ext = match.group(1) if match else "png"
                if ext == "jpeg":
                    ext = "jpg"
                img_bytes = base64.b64decode(encoded)
                unique_name = f"avatar_{emp.id}_{uuid.uuid4().hex[:8]}.{ext}"
                upload_folder = os.path.abspath(os.path.join(current_app.root_path, "uploads", "avatars"))
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_name)
                with open(file_path, "wb") as f:
                    f.write(img_bytes)
                url = f"/uploads/avatars/{unique_name}"
            except Exception as e:
                return jsonify({"error": {"code": "bad_request", "message": f"Failed to process base64 image: {str(e)}"}}), 400
        elif profile_pic_url:
            url = profile_pic_url

    if not url:
        return jsonify({"error": {"code": "bad_request", "message": "No file or image data provided"}}), 400

    existing_em["profile_picture_url"] = url
    emp.emergency_contact = existing_em
    flag_modified(emp, "emergency_contact")
    db_session.commit()
    log_activity("employee.avatar_updated", entity_type="Employee", entity_id=emp.id, user_id=current_user.id)

    return jsonify({"message": "Profile picture updated successfully", "profile_picture_url": url}), 200


@employees_bp.route("/me/avatar", methods=["DELETE"])
@jwt_required()
def delete_my_avatar():
    current_user = get_current_user()
    if not current_user or not current_user.employee:
        return jsonify({"error": {"code": "not_found", "message": "Employee profile not found"}}), 404

    emp = current_user.employee
    existing_em = dict(emp.emergency_contact or {})
    existing_em.pop("profile_picture_url", None)
    emp.emergency_contact = existing_em
    flag_modified(emp, "emergency_contact")
    db_session.commit()
    log_activity("employee.avatar_removed", entity_type="Employee", entity_id=emp.id, user_id=current_user.id)

    return jsonify({"message": "Profile picture removed successfully"}), 200


