from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.employee import Department, Employee
from app.models.auth import User

departments_bp = Blueprint("departments", __name__, url_prefix="/departments")

@departments_bp.route("", methods=["GET"])
@jwt_required()
def get_departments():
    """List all departments with manager details."""
    depts = db_session.query(Department).all()
    res = []
    for d in depts:
        manager_data = None
        if d.manager:
            emp = d.manager.employee
            manager_data = {
                "user_id": d.manager.id,
                "name": f"{emp.first_name} {emp.last_name}" if emp else d.manager.email,
                "email": d.manager.email
            }
        
        member_count = db_session.query(Employee).filter(Employee.department_id == d.id).count()
        res.append({
            "id": d.id,
            "name": d.name,
            "manager_id": d.manager_id,
            "manager": manager_data,
            "member_count": member_count
        })
    return jsonify({"departments": res}), 200

@departments_bp.route("/my-department", methods=["GET"])
@jwt_required()
def get_my_department():
    """Return authenticated user's department, manager details, and member list."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "User unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    user_dept_id = current_user.employee.department_id if current_user.employee else None

    # Check if user is manager of a department
    managed_dept = db_session.query(Department).filter(Department.manager_id == current_user.id).first()

    target_dept_id = managed_dept.id if managed_dept else user_dept_id
    if not target_dept_id and role_name in ("Super Admin", "HR Manager"):
        # Default to first department if admin has no assigned department
        first_dept = db_session.query(Department).first()
        target_dept_id = first_dept.id if first_dept else None

    if not target_dept_id:
        return jsonify({"department": None, "members": []}), 200

    dept = db_session.query(Department).filter(Department.id == target_dept_id).first()
    if not dept:
        return jsonify({"department": None, "members": []}), 200

    manager_data = None
    if dept.manager:
        m_emp = dept.manager.employee
        manager_data = {
            "user_id": dept.manager.id,
            "name": f"{m_emp.first_name} {m_emp.last_name}" if m_emp else dept.manager.email,
            "email": dept.manager.email
        }

    # Fetch all employees in this department
    employees = db_session.query(Employee).filter(Employee.department_id == dept.id, Employee.status == "active").all()
    members_data = []
    for emp in employees:
        members_data.append({
            "user_id": emp.id,
            "employee_code": emp.employee_code,
            "name": f"{emp.first_name} {emp.last_name}",
            "email": emp.user.email if emp.user else "",
            "designation": emp.designation,
            "is_manager": emp.id == dept.manager_id
        })

    return jsonify({
        "department": {
            "id": dept.id,
            "name": dept.name,
            "manager_id": dept.manager_id,
            "manager": manager_data
        },
        "is_manager": (dept.manager_id == current_user.id or role_name in ("Super Admin", "HR Manager")),
        "members": members_data
    }), 200

@departments_bp.route("/<int:dept_id>/manager", methods=["PATCH"])
@jwt_required()
def assign_department_manager(dept_id):
    """Assign or update designated Department Manager (Super Admin / HR Manager only)."""
    current_user = get_current_user()
    if not current_user or not current_user.is_active:
        return jsonify({"error": {"message": "Unauthorized"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    if role_name not in ("Super Admin", "HR Manager"):
        return jsonify({"error": {"message": "Only Admins & HR Managers can assign Department Heads"}}), 403

    dept = db_session.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        return jsonify({"error": {"message": "Department not found"}}), 404

    data = request.get_json() or {}
    new_manager_user_id = data.get("manager_id")

    if new_manager_user_id:
        mgr_user = db_session.query(User).filter(User.id == new_manager_user_id).first()
        if not mgr_user:
            return jsonify({"error": {"message": "Specified manager user not found"}}), 404
        dept.manager_id = new_manager_user_id
    else:
        dept.manager_id = None

    db_session.commit()

    return jsonify({
        "success": True,
        "message": f"Department manager updated for {dept.name}",
        "department_id": dept.id,
        "manager_id": dept.manager_id
    }), 200
