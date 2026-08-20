from datetime import datetime, date
from decimal import Decimal
from app.tasks.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.employee import Employee
from app.models.expense import ExpenseRequest
from app.services.payroll_service import calculate_payroll_for_employee

@celery_app.task(name="app.tasks.payroll_tasks.process_monthly_payroll_batch")
def process_monthly_payroll_batch(year: int, month: int):
    db = SessionLocal()
    try:
        month_year = date(year, month, 1)
        employees = db.query(Employee).filter(Employee.status == "active").all()
        processed_ids = []
        for emp in employees:
            try:
                run = calculate_payroll_for_employee(db, emp.id, month_year)
                # Auto-status transition: update included approved claims to reimbursed
                approved_claims = db.query(ExpenseRequest).filter(
                    ExpenseRequest.employee_id == emp.id,
                    ExpenseRequest.status.in_(["approved", "APPROVED"])
                ).all()
                for claim in approved_claims:
                    claim.status = "reimbursed"
                    claim.payroll_run_id = run.id
                db.commit()

                processed_ids.append(run.id)
            except Exception as e:
                db.rollback()
                print(f"Error processing payroll for employee {emp.id}: {e}")
        return {"status": "completed", "processed_count": len(processed_ids), "run_ids": processed_ids}
    finally:
        db.close()
