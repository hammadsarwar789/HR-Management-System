import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.db.session import db_session
from app.models.auth import User
from app.models.chat import Channel, ChannelMember, Message, HRPolicyChunk
from app.services.rag_engine import HRChatbotEngine
from werkzeug.security import generate_password_hash

def seed_chat_system():
    app = create_app()
    with app.app_context():
        print("[+] Seeding Real-Time Chat & HR AI Chatbot System...")

        # 1. Create or get HR AI Chatbot User Entity
        bot_user = db_session.query(User).filter(User.email == "hrbot@maxenius.com").first()
        if not bot_user:
            bot_user = User(
                email="hrbot@maxenius.com",
                password_hash=generate_password_hash("HRBot@System123"),
                is_active=True
            )
            db_session.add(bot_user)
            db_session.flush()
            print("  [v] Created '@HRBot' system user entity.")

        # Fetch all existing users
        users = db_session.query(User).all()

        # 2. Seed Default Channels
        default_channels_info = [
            {"name": "general", "is_private": False, "desc": "Company-wide general discussions"},
            {"name": "announcements", "is_private": False, "desc": "Official news and HR announcements"},
            {"name": "hr-helpdesk", "is_private": False, "desc": "HR queries and policy support"}
        ]

        created_channels = []
        for ch_info in default_channels_info:
            ch = db_session.query(Channel).filter(Channel.name == ch_info["name"]).first()
            if not ch:
                ch = Channel(
                    name=ch_info["name"],
                    is_direct_message=False,
                    is_private=ch_info["is_private"],
                    created_by=users[0].id if users else None
                )
                db_session.add(ch)
                db_session.flush()
                print(f"  [v] Created channel '#{ch.name}'")

                # Add initial welcome message
                welcome_msg = Message(
                    channel_id=ch.id,
                    sender_id=bot_user.id,
                    sender_type="bot",
                    content=f"Welcome to **#{ch.name}**! {ch_info['desc']}. Mention `@HRBot` anytime for assistance."
                )
                db_session.add(welcome_msg)

            created_channels.append(ch)

            # Ensure all active users belong to public channels
            for u in users:
                existing_member = db_session.query(ChannelMember).filter(
                    ChannelMember.channel_id == ch.id,
                    ChannelMember.user_id == u.id
                ).first()
                if not existing_member:
                    role = "admin" if u.id == ch.created_by else "member"
                    db_session.add(ChannelMember(channel_id=ch.id, user_id=u.id, role=role))

        db_session.commit()

        # 3. Seed HR Policy Documents into RAG Vector Store
        sample_policies = [
            {
                "title": "Annual & Sick Leave Entitlement Policy",
                "category": "Leave Policy",
                "content": (
                    "Employees are entitled to 20 days of paid Annual Leave per calendar year. "
                    "In addition, 10 days of Paid Sick Leave are granted per year upon submission of a medical certificate. "
                    "Casual Leave is capped at 5 days. Unused annual leave up to 5 days may be carried forward into the next fiscal year. "
                    "Leave requests must be submitted through the ESS portal at least 3 days in advance."
                )
            },
            {
                "title": "Hybrid & Remote Work Policy",
                "category": "Workplace Policy",
                "content": (
                    "Employees are eligible for up to 2 remote work (WFH) days per week after completing their 90-day probationary period. "
                    "Core working hours are 09:00 AM to 05:00 PM local time. Remote workers must remain reachable via Slack/HRMS Chat "
                    "and attend all scheduled department standups."
                )
            },
            {
                "title": "Health Insurance & Wellness Benefits",
                "category": "Employee Benefits",
                "content": (
                    "Maxenius provides comprehensive health and dental coverage for full-time employees and direct dependants. "
                    "Medical reimbursement claims up to $500 per incident can be submitted directly under Expenses. "
                    "An annual wellness allowance of $300 is available for gym memberships and ergonomic equipment."
                )
            },
            {
                "title": "Parental & Maternity Leave Policy",
                "category": "Leave Policy",
                "content": (
                    "Female employees receive 14 weeks of fully paid Maternity Leave. "
                    "Male employees receive 2 weeks of fully paid Paternity Leave. "
                    "Flexible return-to-work options are available upon request to Department Managers."
                )
            },
            {
                "title": "Professional Code of Conduct & Integrity",
                "category": "Code of Conduct",
                "content": (
                    "Employees are expected to maintain the highest standards of professional ethics, respect, and document security. "
                    "Confidential HR and financial records must never be exported outside authorized Maxenius object storage. "
                    "Zero tolerance for harassment or discrimination."
                )
            }
        ]

        for p in sample_policies:
            existing = db_session.query(HRPolicyChunk).filter(HRPolicyChunk.title == p["title"]).first()
            if not existing:
                HRChatbotEngine.ingest_policy_chunk(
                    title=p["title"],
                    category=p["category"],
                    content=p["content"]
                )
                print(f"  [v] Ingested RAG policy chunk: '{p['title']}'")

        print("[*] Real-Time Chat & HR AI Chatbot system seeded successfully!\n")

if __name__ == "__main__":
    seed_chat_system()
