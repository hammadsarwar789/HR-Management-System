import uuid
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.project import Project, ProjectMember, Task
from app.models.employee import Department, Employee
from app.models.auth import User

projects_bp = Blueprint("projects", __name__, url_prefix="/projects")

@projects_bp.route("", methods=["GET"])
@jwt_required()
def get_projects():
    """List projects for user's department or all projects if Admin/HR."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    user_dept_id = current_user.employee.department_id if current_user.employee else None
    managed_dept = db_session.query(Department).filter(Department.manager_id == current_user.id).first()

    target_dept_id = managed_dept.id if managed_dept else user_dept_id

    query = db_session.query(Project)
    if role_name not in ("Super Admin", "HR Manager") and target_dept_id:
        query = query.filter(Project.department_id == target_dept_id)

    projects = query.order_by(Project.created_at.desc()).all()
    res = []
    for p in projects:
        member_count = db_session.query(ProjectMember).filter(ProjectMember.project_id == p.id).count()
        task_count = db_session.query(Task).filter(Task.project_id == p.id).count()
        completed_task_count = db_session.query(Task).filter(Task.project_id == p.id, Task.status == "DONE").count()

        mgr_name = "Department Manager"
        if p.manager:
            m_emp = p.manager.employee
            mgr_name = f"{m_emp.first_name} {m_emp.last_name}" if m_emp else p.manager.email

        res.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "department_id": p.department_id,
            "department_name": p.department.name if p.department else "General",
            "manager_id": p.manager_id,
            "manager_name": mgr_name,
            "status": p.status,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "member_count": member_count,
            "task_count": task_count,
            "completed_task_count": completed_task_count,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })

    return jsonify({"projects": res}), 200

@projects_bp.route("", methods=["POST"])
@jwt_required()
def create_project():
    """Create project. Validate creator is Department Manager for department_id or Admin."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    data = request.get_json() or {}

    name = data.get("name")
    description = data.get("description")
    department_id = data.get("department_id")
    start_date_str = data.get("start_date")
    end_date_str = data.get("end_date")

    if not name:
        return jsonify({"error": {"message": "Project name is required"}}), 400

    # Determine department
    if not department_id:
        if current_user.employee and current_user.employee.department_id:
            department_id = current_user.employee.department_id
        else:
            first_dept = db_session.query(Department).first()
            department_id = first_dept.id if first_dept else 1

    dept = db_session.query(Department).filter(Department.id == department_id).first()
    if not dept:
        return jsonify({"error": {"message": "Department not found"}}), 404

    # Security check: creator must be department manager or Super Admin / HR Manager
    if role_name not in ("Super Admin", "HR Manager") and dept.manager_id != current_user.id:
        return jsonify({"error": {"message": "Only the designated Department Manager can create projects for this department"}}), 403

    from datetime import datetime
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date() if start_date_str else None
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date() if end_date_str else None

    project = Project(
        name=name,
        description=description,
        department_id=dept.id,
        manager_id=current_user.id,
        status="ACTIVE",
        start_date=start_date,
        end_date=end_date
    )
    db_session.add(project)
    db_session.commit()

    # Automatically add creator as ProjectMember
    pm = ProjectMember(project_id=project.id, user_id=current_user.id, role_in_project="Manager")
    db_session.add(pm)
    db_session.commit()

    return jsonify({
        "success": True,
        "message": f"Project '{project.name}' created successfully",
        "project": {
            "id": project.id,
            "name": project.name,
            "department_id": project.department_id,
            "status": project.status
        }
    }), 201

@projects_bp.route("/<project_id>/members", methods=["POST"])
@jwt_required()
def add_project_members(project_id):
    """Assign employees to project team."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        return jsonify({"error": {"message": "Project not found"}}), 404

    data = request.get_json() or {}
    user_ids = data.get("user_ids", [])
    role_in_project = data.get("role_in_project", "Developer")

    added_count = 0
    for uid in user_ids:
        existing = db_session.query(ProjectMember).filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == uid
        ).first()
        if not existing:
            pm = ProjectMember(project_id=project.id, user_id=uid, role_in_project=role_in_project)
            db_session.add(pm)
            added_count += 1

    db_session.commit()

    return jsonify({
        "success": True,
        "message": f"Added {added_count} member(s) to project",
        "project_id": project.id
    }), 200
