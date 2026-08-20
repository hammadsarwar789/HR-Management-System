import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, Date, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    manager_id = Column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(50), default="ACTIVE")  # PLANNING | ACTIVE | ON_HOLD | COMPLETED
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    department = relationship("Department")
    manager = relationship("User", foreign_keys=[manager_id])
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")

class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uix_project_user"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_in_project = Column(String(100), default="Developer")
    assigned_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="members")
    user = relationship("User")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    issue_key = Column(String(50), nullable=True, index=True)  # e.g., 'HRMS-101'
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    sprint_id = Column(String(36), ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True)
    parent_issue_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_by_manager_id = Column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    assignee_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    issue_type = Column(String(30), default="TASK")  # EPIC | STORY | TASK | BUG | SUBTASK
    priority = Column(String(20), default="MEDIUM")  # LOWEST | LOW | MEDIUM | HIGH | HIGHEST | BLOCKER
    status = Column(String(30), default="TODO")  # BACKLOG | TODO | IN_PROGRESS | IN_REVIEW | QA | DONE
    story_points = Column(Integer, default=1)
    order_index = Column(Integer, default=0)
    estimated_hours = Column(Numeric(5, 2), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="tasks")
    department = relationship("Department")
    sprint = relationship("Sprint", back_populates="tasks")
    created_by_manager = relationship("User", foreign_keys=[created_by_manager_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    assignees = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("IssueComment", back_populates="task", cascade="all, delete-orphan")
    subtasks = relationship("Task", backref="parent_issue", remote_side=[id])

class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uix_task_user"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    task = relationship("Task", back_populates="assignees")
    user = relationship("User")
