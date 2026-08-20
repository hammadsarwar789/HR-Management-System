import sys
import os
from datetime import datetime, date, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.db.session import db_session
from app.models.employee import Department, Employee
from app.models.auth import User
from app.models.project import Project, ProjectMember, Task, TaskAssignee

app = create_app()

with app.app_context():
    print("[*] Seeding Projects & Tasks...")
    
    # 1. Ensure departments exist and assign managers
    depts = db_session.query(Department).all()
    if not depts:
        eng_dept = Department(name="Engineering")
        hr_dept = Department(name="Human Resources")
        db_session.add_all([eng_dept, hr_dept])
        db_session.commit()
        depts = [eng_dept, hr_dept]

    admin_user = db_session.query(User).filter(User.email == "admin@maxenius.com").first()
    if admin_user:
        for d in depts:
            if not d.manager_id:
                d.manager_id = admin_user.id
        db_session.commit()

    eng_dept = db_session.query(Department).filter(Department.name.ilike("%Engineering%")).first() or depts[0]

    # 2. Check if projects exist
    existing_proj = db_session.query(Project).first()
    if not existing_proj and admin_user:
        p1 = Project(
            name="HRMS Portal 2.0 Redesign",
            description="Complete overhaul of the Maxenius HRMS employee dashboard, chat, and project tracking modules.",
            department_id=eng_dept.id,
            manager_id=admin_user.id,
            status="ACTIVE",
            start_date=date.today() - timedelta(days=15),
            end_date=date.today() + timedelta(days=30)
        )
        p2 = Project(
            name="Mobile App API Suite",
            description="REST & WebSocket API integrations for iOS and Android mobile clients.",
            department_id=eng_dept.id,
            manager_id=admin_user.id,
            status="ACTIVE",
            start_date=date.today() - timedelta(days=5),
            end_date=date.today() + timedelta(days=45)
        )
        db_session.add_all([p1, p2])
        db_session.commit()

        # Seed Tasks
        t1 = Task(
            project_id=p1.id,
            department_id=eng_dept.id,
            created_by_manager_id=admin_user.id,
            title="Design Interactive Kanban Board Component",
            description="Implement drag-and-drop or status selector columns for TODO, IN_PROGRESS, IN_REVIEW, DONE.",
            priority="CRITICAL",
            status="IN_PROGRESS",
            estimated_hours=16.0,
            due_date=datetime.now(timezone.utc) + timedelta(days=3)
        )
        t2 = Task(
            project_id=p1.id,
            department_id=eng_dept.id,
            created_by_manager_id=admin_user.id,
            title="Department Workload Metric Calculation",
            description="Compute active task count per employee chip to prevent over-allocation.",
            priority="HIGH",
            status="TODO",
            estimated_hours=8.0,
            due_date=datetime.now(timezone.utc) + timedelta(days=5)
        )
        t3 = Task(
            project_id=p2.id,
            department_id=eng_dept.id,
            created_by_manager_id=admin_user.id,
            title="Push Notification Trigger on Task Assign",
            description="Emit WebSocket notification:new event when manager allocates task.",
            priority="MEDIUM",
            status="IN_REVIEW",
            estimated_hours=12.0,
            due_date=datetime.now(timezone.utc) + timedelta(days=2)
        )
        db_session.add_all([t1, t2, t3])
        db_session.commit()

        # Assign tasks to admin user
        db_session.add_all([
            TaskAssignee(task_id=t1.id, user_id=admin_user.id),
            TaskAssignee(task_id=t2.id, user_id=admin_user.id),
            TaskAssignee(task_id=t3.id, user_id=admin_user.id)
        ])
        db_session.commit()
        print("[+] Projects & Tasks seeded successfully!")
    else:
        print("[!] Projects already exist.")
