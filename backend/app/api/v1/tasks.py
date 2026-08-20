import uuid
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.project import Project, Task, TaskAssignee, ProjectMember
from app.models.employee import Department, Employee
from app.models.auth import User
from app.core.sockets import socketio

tasks_bp = Blueprint("tasks", __name__, url_prefix="/tasks")

@tasks_bp.route("/my-tasks", methods=["GET"])
@jwt_required()
def get_my_tasks():
    """Fetch tasks assigned to the authenticated user ordered by due_date ASC."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    assignee_records = db_session.query(TaskAssignee).filter(TaskAssignee.user_id == current_user.id).all()
    task_ids = [a.task_id for a in assignee_records]

    if not task_ids:
        return jsonify({"tasks": []}), 200

    tasks = db_session.query(Task).filter(Task.id.in_(task_ids)).order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).all()
    res = []
    for t in tasks:
        creator_name = "Department Manager"
        if t.created_by_manager:
            c_emp = t.created_by_manager.employee
            creator_name = f"{c_emp.first_name} {c_emp.last_name}" if c_emp else t.created_by_manager.email

        res.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "project_id": t.project_id,
            "project_name": t.project.name if t.project else "General Project",
            "department_id": t.department_id,
            "priority": t.priority,
            "status": t.status,
            "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "created_by_manager": creator_name,
            "created_at": t.created_at.isoformat() if t.created_at else None
        })

    return jsonify({"tasks": res}), 200

@tasks_bp.route("/department", methods=["GET"])
@jwt_required()
def get_department_tasks():
    """Fetch all tasks in manager's department with assignee details, workload metrics, and status grouping."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    user_dept_id = current_user.employee.department_id if current_user.employee else None
    managed_dept = db_session.query(Department).filter(Department.manager_id == current_user.id).first()

    target_dept_id = managed_dept.id if managed_dept else user_dept_id
    if not target_dept_id and role_name in ("Super Admin", "HR Manager"):
        first_dept = db_session.query(Department).first()
        target_dept_id = first_dept.id if first_dept else 1

    if not target_dept_id:
        return jsonify({"tasks": [], "workload": []}), 200

    dept = db_session.query(Department).filter(Department.id == target_dept_id).first()

    # Query all tasks for department
    tasks = db_session.query(Task).filter(Task.department_id == target_dept_id).order_by(Task.created_at.desc()).all()
    tasks_res = []

    # Calculate employee workload metrics for department
    dept_employees = db_session.query(Employee).filter(Employee.department_id == target_dept_id, Employee.status == "active").all()
    workload_map = {e.id: {"user_id": e.id, "name": f"{e.first_name} {e.last_name}", "code": e.employee_code, "active_task_count": 0} for e in dept_employees}

    for t in tasks:
        assignees_data = []
        for a in t.assignees:
            a_emp = a.user.employee if a.user else None
            a_name = f"{a_emp.first_name} {a_emp.last_name}" if a_emp else (a.user.email if a.user else "Employee")
            assignees_data.append({
                "user_id": a.user_id,
                "name": a_name,
                "email": a.user.email if a.user else ""
            })
            if t.status in ("TODO", "IN_PROGRESS", "IN_REVIEW") and a.user_id in workload_map:
                workload_map[a.user_id]["active_task_count"] += 1

        tasks_res.append({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "project_id": t.project_id,
            "project_name": t.project.name if t.project else "General Project",
            "department_id": t.department_id,
            "priority": t.priority,
            "status": t.status,
            "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "assignees": assignees_data,
            "created_at": t.created_at.isoformat() if t.created_at else None
        })

    workload_res = list(workload_map.values())

    return jsonify({
        "department_id": target_dept_id,
        "department_name": dept.name if dept else "Department",
        "tasks": tasks_res,
        "workload": workload_res
    }), 200

@tasks_bp.route("", methods=["POST"])
@jwt_required()
def create_task():
    """Create & allocate task with security validation and real-time assignee notifications."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    data = request.get_json() or {}

    project_id = data.get("project_id")
    title = data.get("title")
    description = data.get("description")
    priority = data.get("priority", "MEDIUM").upper()
    estimated_hours = data.get("estimated_hours")
    due_date_str = data.get("due_date")
    assignee_user_ids = data.get("assignee_user_ids", [])

    if not project_id or not title:
        return jsonify({"error": {"message": "Project ID and Task title are required"}}), 400

    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        return jsonify({"error": {"message": "Specified project not found"}}), 404

    dept = db_session.query(Department).filter(Department.id == project.department_id).first()

    # Security Validation 1: Verify caller is designated department manager or Super Admin / HR Manager
    if role_name not in ("Super Admin", "HR Manager") and (not dept or dept.manager_id != current_user.id):
        return jsonify({"error": {"message": "Security Error: Only the designated Department Manager can allocate tasks"}}), 403

    # Security Validation 2: Verify assigned user IDs belong to the same department
    if assignee_user_ids:
        assigned_employees = db_session.query(Employee).filter(Employee.id.in_(assignee_user_ids)).all()
        for emp in assigned_employees:
            if emp.department_id != project.department_id and role_name not in ("Super Admin", "HR Manager"):
                return jsonify({"error": {"message": f"Security Error: Employee {emp.first_name} {emp.last_name} belongs to a different department"}}), 400

    from datetime import datetime
    due_date = datetime.fromisoformat(due_date_str) if due_date_str else None

    task = Task(
        project_id=project.id,
        department_id=project.department_id,
        created_by_manager_id=current_user.id,
        title=title,
        description=description,
        priority=priority if priority in ("LOW", "MEDIUM", "HIGH", "CRITICAL") else "MEDIUM",
        status="TODO",
        estimated_hours=estimated_hours,
        due_date=due_date
    )
    db_session.add(task)
    db_session.commit()

    # Add task assignees and ensure project membership
    mgr_emp = current_user.employee
    mgr_name = f"{mgr_emp.first_name} {mgr_emp.last_name}" if mgr_emp else current_user.email

    for uid in assignee_user_ids:
        ta = TaskAssignee(task_id=task.id, user_id=uid)
        db_session.add(ta)

        # Auto-ensure project member
        pm_exists = db_session.query(ProjectMember).filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == uid
        ).first()
        if not pm_exists:
            db_session.add(ProjectMember(project_id=project.id, user_id=uid, role_in_project="Developer"))

        # Dispatch real-time Socket.IO and in-app notification
        notif_payload = {
            "id": f"task-assign-{task.id}-{uid}",
            "type": "task_assignment",
            "title": "📋 New Task Assigned",
            "message": f"{mgr_name} assigned you task: '{task.title}' under project '{project.name}'",
            "url": "/tasks/my-tasks",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
            "unread": True,
            "badge_color": "amber" if priority in ("HIGH", "CRITICAL") else "teal"
        }
        socketio.emit("notification:new", notif_payload, room=f"user_{uid}")

    db_session.commit()

    return jsonify({
        "success": True,
        "message": f"Task '{task.title}' allocated successfully",
        "task_id": task.id
    }), 201

@tasks_bp.route("/<task_id>/status", methods=["PATCH"])
@jwt_required()
def update_task_status(task_id):
    """Update task status (TODO -> IN_PROGRESS -> IN_REVIEW -> DONE)."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    task = db_session.query(Task).filter(Task.id == task_id).first()
    if not task:
        return jsonify({"error": {"message": "Task not found"}}), 404

    data = request.get_json() or {}
    new_status = data.get("status", "").upper()

    if new_status not in ("BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "QA", "BLOCKED", "DONE"):
        return jsonify({"error": {"message": "Invalid status value"}}), 400

    task.status = new_status
    db_session.commit()

    return jsonify({
        "success": True,
        "message": f"Task status updated to {new_status}",
        "task_id": task.id,
        "status": task.status
    }), 200

@tasks_bp.route("/<task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    """Remove task (Department Manager / Admin only)."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    role_name = current_user.role.name if current_user.role else "Employee"
    task = db_session.query(Task).filter(Task.id == task_id).first()
    if not task:
        return jsonify({"error": {"message": "Task not found"}}), 404

    dept = db_session.query(Department).filter(Department.id == task.department_id).first()
    if role_name not in ("Super Admin", "HR Manager") and (not dept or dept.manager_id != current_user.id):
        return jsonify({"error": {"message": "Only the Department Manager can delete tasks"}}), 403

    db_session.delete(task)
    db_session.commit()

    return jsonify({"success": True, "message": "Task deleted", "task_id": task_id}), 200
