import os
from pathlib import Path
from dotenv import load_dotenv

# Load from project root .env or backend .env
root_dir = Path(__file__).resolve().parent.parent.parent
backend_dir = Path(__file__).resolve().parent.parent

if (root_dir / ".env").exists():
    load_dotenv(dotenv_path=root_dir / ".env")
elif (backend_dir / ".env").exists():
    load_dotenv(dotenv_path=backend_dir / ".env")
else:
    load_dotenv()

class Settings:
    APP_NAME: str = "Maxenius HRMS"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # Secrets MUST be set in .env — no weak fallbacks allowed
    @property
    def SECRET_KEY(self) -> str:
        val = os.getenv("SECRET_KEY")
        if not val:
            raise ValueError("SECRET_KEY is not set in environment. Add it to your .env file.")
        return val

    @property
    def JWT_SECRET_KEY(self) -> str:
        val = os.getenv("JWT_SECRET_KEY")
        if not val:
            raise ValueError("JWT_SECRET_KEY is not set in environment. Add it to your .env file.")
        return val

    JWT_ACCESS_TOKEN_EXPIRES_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", str(60 * 24 * 7)))  # 7 days default session
    
    # Database configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///hrms.db")
    
    # Redis & Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_TASK_ALWAYS_EAGER: bool = os.getenv("CELERY_TASK_ALWAYS_EAGER", "True").lower() in ("true", "1", "t")

settings = Settings()
