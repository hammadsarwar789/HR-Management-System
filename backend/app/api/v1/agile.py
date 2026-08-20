import uuid
from datetime import datetime, timezone, date, timedelta
from sqlalchemy import func
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from app.db.session import db_session
from app.core.security import get_current_user
from app.models.project import Project, Task, TaskAssignee, ProjectMember
from app.models.agile import Sprint, IssueComment
from app.models.employee import Employee
from app.models.auth import User
from app.core.sockets import socketio

agile_bp = Blueprint("agile", __name__, url_prefix="/agile")

def generate_issue_key(project: Project) -> str:
    """Generate monotonically increasing issue key like HRMS-101 based on project name."""
    clean_prefix = "".join(c for c in project.name if c.isalnum()).upper()[:4] or "PROJ"
    # Use MAX to avoid collisions from deletes or concurrent creates
    last_key = db_session.query(func.max(Task.issue_key)).filter(
        Task.project_id == project.id,
        Task.issue_key.like(f"{clean_prefix}-%")
    ).scalar()
    if last_key:
        try:
            last_num = int(last_key.split("-")[-1])
        except (ValueError, IndexError):
            last_num = 100
    else:
        last_num = 100
    return f"{clean_prefix}-{last_num + 1}"

def serialize_issue(t: Task):
    assignee_name = "Unassigned"
    assignee_user_id = t.assignee_id
    if t.assignee:
        a_emp = t.assignee.employee
        assignee_name = f"{a_emp.first_name} {a_emp.last_name}" if a_emp else t.assignee.email
    elif t.assignees and len(t.assignees) > 0:
        first_a = t.assignees[0].user
        assignee_user_id = first_a.id
        if first_a:
            a_emp = first_a.employee
            assignee_name = f"{a_emp.first_name} {a_emp.last_name}" if a_emp else first_a.email

    reporter_name = "Department Manager"
    if t.created_by_manager:
        c_emp = t.created_by_manager.employee
        reporter_name = f"{c_emp.first_name} {c_emp.last_name}" if c_emp else t.created_by_manager.email

    comment_count = db_session.query(IssueComment).filter(IssueComment.task_id == t.id).count()
    subtask_count = db_session.query(Task).filter(Task.parent_issue_id == t.id).count()

    return {
        "id": t.id,
        "issue_key": t.issue_key or f"TASK-{t.id[:4]}",
        "title": t.title,
        "description": t.description,
        "project_id": t.project_id,
        "project_name": t.project.name if t.project else "General Project",
        "department_id": t.department_id,
        "sprint_id": t.sprint_id,
        "parent_issue_id": t.parent_issue_id,
        "issue_type": t.issue_type or "TASK",
        "status": t.status or "TODO",
        "priority": t.priority or "MEDIUM",
        "story_points": t.story_points or 1,
        "order_index": t.order_index or 0,
        "estimated_hours": float(t.estimated_hours) if t.estimated_hours else 0,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "reporter_id": t.created_by_manager_id,
        "reporter_name": reporter_name,
        "assignee_id": assignee_user_id,
        "assignee_name": assignee_name,
        "comment_count": comment_count,
        "subtask_count": subtask_count,
        "created_at": t.created_at.isoformat() if t.created_at else None
    }

# 1. SPRINTS MANAGEMENT
@agile_bp.route("/projects/<project_id>/sprints", methods=["GET"])
@jwt_required()
def get_project_sprints(project_id):
    sprints = db_session.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.created_at.desc()).all()
    res = []
    for s in sprints:
        issue_count = db_session.query(Task).filter(Task.sprint_id == s.id).count()
        total_points = sum(t.story_points or 1 for t in db_session.query(Task).filter(Task.sprint_id == s.id).all())
        res.append({
            "id": s.id,
            "project_id": s.project_id,
            "name": s.name,
            "goal": s.goal,
            "status": s.status,
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
            "issue_count": issue_count,
            "total_points": total_points
        })
    return jsonify({"sprints": res}), 200

@agile_bp.route("/projects/<project_id>/sprints", methods=["POST"])
@jwt_required()
def create_sprint(project_id):
    data = request.get_json() or {}
    name = data.get("name")
    goal = data.get("goal")

    if not name:
        return jsonify({"error": {"message": "Sprint name is required"}}), 400

    sprint = Sprint(
        project_id=project_id,
        name=name,
        goal=goal,
        status="PLANNED"
    )
    db_session.add(sprint)
    db_session.commit()

    return jsonify({"success": True, "message": f"Sprint '{sprint.name}' created", "sprint_id": sprint.id}), 201

@agile_bp.route("/sprints/<sprint_id>/status", methods=["PATCH"])
@jwt_required()
def update_sprint_status(sprint_id):
    sprint = db_session.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        return jsonify({"error": {"message": "Sprint not found"}}), 404

    data = request.get_json() or {}
    new_status = data.get("status", "").upper()

    if new_status == "ACTIVE":
        # Complete any other active sprint for this project first
        db_session.query(Sprint).filter(
            Sprint.project_id == sprint.project_id,
            Sprint.status == "ACTIVE",
            Sprint.id != sprint.id
        ).update({"status": "COMPLETED"}, synchronize_session=False)
        sprint.status = "ACTIVE"
        sprint.start_date = date.today()
        sprint.end_date = date.today() + timedelta(days=14)
    elif new_status == "COMPLETED":
        sprint.status = "COMPLETED"
        # Move uncompleted tasks to Backlog (sprint_id = None, status = BACKLOG)
        db_session.query(Task).filter(
            Task.sprint_id == sprint.id,
            Task.status != "DONE"
        ).update({"sprint_id": None, "status": "BACKLOG"}, synchronize_session=False)
    elif new_status == "PLANNED":
        sprint.status = "PLANNED"

    db_session.commit()
    return jsonify({"success": True, "message": f"Sprint status updated to {new_status}", "sprint_id": sprint.id}), 200

# 2. AGILE BOARD & BACKLOG
@agile_bp.route("/projects/<project_id>/board", methods=["GET"])
@jwt_required()
def get_project_board(project_id):
    """Fetch active sprint issues grouped by column status."""
    active_sprint = db_session.query(Sprint).filter(Sprint.project_id == project_id, Sprint.status == "ACTIVE").first()
    
    if not active_sprint:
        # Fallback to most recent sprint or all project issues
        active_sprint = db_session.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.created_at.desc()).first()

    query = db_session.query(Task).filter(Task.project_id == project_id)
    if active_sprint:
        query = query.filter(Task.sprint_id == active_sprint.id)

    tasks = query.order_by(Task.order_index.asc(), Task.created_at.desc()).all()
    issues = [serialize_issue(t) for t in tasks]

    return jsonify({
        "active_sprint": {
            "id": active_sprint.id,
            "name": active_sprint.name,
            "goal": active_sprint.goal,
            "status": active_sprint.status
        } if active_sprint else None,
        "issues": issues
    }), 200

@agile_bp.route("/projects/<project_id>/backlog", methods=["GET"])
@jwt_required()
def get_project_backlog(project_id):
    """Fetch unassigned backlog issues + planned sprints."""
    sprints = db_session.query(Sprint).filter(Sprint.project_id == project_id, Sprint.status != "COMPLETED").all()
    sprints_res = []
    for s in sprints:
        s_tasks = db_session.query(Task).filter(Task.sprint_id == s.id).order_by(Task.order_index.asc()).all()
        sprints_res.append({
            "id": s.id,
            "name": s.name,
            "goal": s.goal,
            "status": s.status,
            "issues": [serialize_issue(t) for t in s_tasks]
        })

    # Backlog tasks (no sprint assigned)
    backlog_tasks = db_session.query(Task).filter(Task.project_id == project_id, Task.sprint_id.is_(None)).order_by(Task.order_index.asc()).all()

    return jsonify({
        "sprints": sprints_res,
        "backlog_issues": [serialize_issue(t) for t in backlog_tasks]
    }), 200

# 3. CREATE AGILE ISSUE
@agile_bp.route("/projects/<project_id>/issues", methods=["POST"])
@jwt_required()
def create_agile_issue(project_id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        return jsonify({"error": {"message": "Project not found"}}), 404

    data = request.get_json() or {}
    title = data.get("title")
    description = data.get("description")
    issue_type = data.get("issue_type", "TASK").upper()
    priority = data.get("priority", "MEDIUM").upper()
    story_points = data.get("story_points", 1)
    sprint_id = data.get("sprint_id")
    assignee_id = data.get("assignee_id")
    parent_issue_id = data.get("parent_issue_id")

    if not title:
        return jsonify({"error": {"message": "Issue title is required"}}), 400

    issue_key = generate_issue_key(project)

    issue = Task(
        project_id=project.id,
        department_id=project.department_id,
        created_by_manager_id=current_user.id,
        issue_key=issue_key,
        title=title,
        description=description,
        issue_type=issue_type,
        priority=priority,
        status="TODO" if sprint_id else "BACKLOG",
        sprint_id=sprint_id if sprint_id else None,
        assignee_id=assignee_id if assignee_id else None,
        parent_issue_id=parent_issue_id if parent_issue_id else None,
        story_points=int(story_points) if story_points else 1
    )
    db_session.add(issue)
    db_session.commit()

    if assignee_id:
        db_session.add(TaskAssignee(task_id=issue.id, user_id=assignee_id))
        db_session.commit()

    return jsonify({"success": True, "message": f"Created issue {issue_key}", "issue": serialize_issue(issue)}), 201

# 4. MOVE ISSUE (DRAG & DROP / STATUS / SPRINT UPDATE)
@agile_bp.route("/issues/<issue_id>/move", methods=["PATCH"])
@jwt_required()
def move_issue(issue_id):
    issue = db_session.query(Task).filter(Task.id == issue_id).first()
    if not issue:
        return jsonify({"error": {"message": "Issue not found"}}), 404

    data = request.get_json() or {}
    if "title" in data and data["title"]:
        issue.title = data["title"].strip()
    if "description" in data:
        issue.description = data["description"]
    if "status" in data:
        issue.status = data["status"].upper()
    if "sprint_id" in data:
        new_sprint_id = data["sprint_id"]
        # Treat empty string, None, or "BACKLOG" sentinel as move-to-backlog
        if new_sprint_id in (None, "", "BACKLOG"):
            issue.sprint_id = None
            if issue.status not in ("DONE",):
                issue.status = "BACKLOG"
        else:
            issue.sprint_id = new_sprint_id
            if issue.status == "BACKLOG":
                issue.status = "TODO"
    if "order_index" in data:
        issue.order_index = int(data["order_index"])
    if "issue_type" in data:
        issue.issue_type = data["issue_type"].upper()
    if "priority" in data:
        issue.priority = data["priority"].upper()
    if "story_points" in data:
        issue.story_points = int(data["story_points"])
    if "assignee_id" in data:
        # Empty string means unassign
        issue.assignee_id = data["assignee_id"] or None

    db_session.commit()
    return jsonify({"success": True, "message": "Issue updated", "issue": serialize_issue(issue)}), 200

# 5. ISSUE ACTIVITY COMMENTS
@agile_bp.route("/issues/<issue_id>/comments", methods=["GET"])
@jwt_required()
def get_issue_comments(issue_id):
    comments = db_session.query(IssueComment).filter(IssueComment.task_id == issue_id).order_by(IssueComment.created_at.asc()).all()
    res = []
    for c in comments:
        emp = c.author.employee if c.author else None
        author_name = f"{emp.first_name} {emp.last_name}" if emp else (c.author.email if c.author else "User")
        res.append({
            "id": c.id,
            "author_id": c.author_id,
            "author_name": author_name,
            "body": c.body,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    return jsonify({"comments": res}), 200

@agile_bp.route("/issues/<issue_id>/comments", methods=["POST"])
@jwt_required()
def add_issue_comment(issue_id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": {"message": "Unauthenticated"}}), 401

    issue = db_session.query(Task).filter(Task.id == issue_id).first()
    if not issue:
        return jsonify({"error": {"message": "Issue not found"}}), 404

    data = request.get_json() or {}
    body = data.get("body")
    if not body:
        return jsonify({"error": {"message": "Comment body required"}}), 400

    comment = IssueComment(task_id=issue.id, author_id=current_user.id, body=body)
    db_session.add(comment)
    db_session.commit()

    # Notify assignee if present
    if issue.assignee_id and issue.assignee_id != current_user.id:
        notif_payload = {
            "id": f"comment-{comment.id}",
            "type": "issue_comment",
            "title": f"💬 New comment on {issue.issue_key}",
            "message": f"Comment posted on '{issue.title}': \"{body[:60]}\"",
            "url": "/tasks/agile",
            "timestamp": datetime.now(timezone.utc).strftime("%H:%M"),
            "unread": True,
            "badge_color": "teal"
        }
        socketio.emit("notification:new", notif_payload, room=f"user_{issue.assignee_id}")

    return jsonify({"success": True, "comment_id": comment.id}), 201
