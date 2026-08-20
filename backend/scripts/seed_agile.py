import sys
import os
from datetime import datetime, date, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.db.session import db_session
from app.models.employee import Department, Employee
from app.models.auth import User
from app.models.project import Project, Task
from app.models.agile import Sprint, IssueComment

app = create_app()

with app.app_context():
    print("[*] Seeding Agile Sprints & Issues...")
    project = db_session.query(Project).first()
    admin_user = db_session.query(User).filter(User.email == "admin@maxenius.com").first()

    if project and admin_user:
        # Check if sprint exists
        sprint1 = db_session.query(Sprint).filter(Sprint.project_id == project.id, Sprint.name == "Sprint 1 (Active)").first()
        if not sprint1:
            sprint1 = Sprint(
                project_id=project.id,
                name="Sprint 1 (Active)",
                goal="Deliver Core Agile Issue Board, Backlog & Interactive Drawer Modal.",
                status="ACTIVE",
                start_date=date.today() - timedelta(days=3),
                end_date=date.today() + timedelta(days=11)
            )
            sprint2 = Sprint(
                project_id=project.id,
                name="Sprint 2 (Planned)",
                goal="Integrate automated Slack notifications & Velocity Charts.",
                status="PLANNED",
                start_date=date.today() + timedelta(days=12),
                end_date=date.today() + timedelta(days=26)
            )
            db_session.add_all([sprint1, sprint2])
            db_session.commit()

        # Update existing tasks with issue keys and sprint
        tasks = db_session.query(Task).filter(Task.project_id == project.id).all()
        for idx, t in enumerate(tasks):
            if not t.issue_key:
                t.issue_key = f"HRMS-{101 + idx}"
            if idx == 0:
                t.issue_type = "STORY"
                t.status = "IN_PROGRESS"
                t.sprint_id = sprint1.id
                t.story_points = 5
                t.assignee_id = admin_user.id
            elif idx == 1:
                t.issue_type = "TASK"
                t.status = "TODO"
                t.sprint_id = sprint1.id
                t.story_points = 3
                t.assignee_id = admin_user.id
            elif idx == 2:
                t.issue_type = "BUG"
                t.status = "QA"
                t.sprint_id = sprint1.id
                t.story_points = 2
                t.assignee_id = admin_user.id
            else:
                t.issue_type = "TASK"
                t.status = "BACKLOG"
                t.story_points = 2

        db_session.commit()
        print("[+] Agile Sprints & Issues seeded successfully!")
