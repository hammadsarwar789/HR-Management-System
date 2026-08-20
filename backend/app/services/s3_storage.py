import os
import time
import hmac
import hashlib
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Check if AWS S3 environment variables are provided
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")  # For MinIO or S3-compatible storage

# Secret key used for signing local fallback tokens
SIGNING_SECRET = os.getenv("SECRET_KEY", "maxenius-hrms-storage-secret-key-2026")

class S3StorageService:
    """
    Service for generating time-limited pre-signed URLs for document sharing.
    Supports AWS S3 / MinIO object storage, with fallback to local tokenized encrypted vault.
    """

    @staticmethod
    def is_s3_configured() -> bool:
        return bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and S3_BUCKET_NAME)

    @classmethod
    def generate_presigned_upload_url(
        cls,
        channel_id: str,
        user_id: str,
        file_name: str,
        mime_type: str,
        file_size_bytes: int,
        expires_in_seconds: int = 900  # 15 minutes
    ) -> Dict[str, Any]:
        """
        Generate pre-signed PUT URL for uploading document directly to Object Storage.
        """
        # Validate whitelist mime types (PDF, Images, Office Docs, Zip, Text)
        allowed_mimes = [
            "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
            "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/zip", "application/x-zip-compressed", "text/plain", "text/csv"
        ]
        if mime_type.lower() not in allowed_mimes and not mime_type.startswith("image/"):
            raise ValueError(f"File type '{mime_type}' is not allowed for channel sharing.")

        # Max file size limit (50MB)
        if file_size_bytes > 50 * 1024 * 1024:
            raise ValueError("File size exceeds 50MB limit.")

        storage_path = f"channels/{channel_id}/{int(time.time())}_{file_name}"

        if cls.is_s3_configured():
            try:
                import boto3
                from botocore.config import Config

                s3_kwargs = {
                    "aws_access_key_id": AWS_ACCESS_KEY_ID,
                    "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
                    "region_name": AWS_REGION,
                    "config": Config(signature_version="s3v4")
                }
                if S3_ENDPOINT_URL:
                    s3_kwargs["endpoint_url"] = S3_ENDPOINT_URL

                s3_client = boto3.client("s3", **s3_kwargs)
                presigned_url = s3_client.generate_presigned_url(
                    "put_object",
                    Params={
                        "Bucket": S3_BUCKET_NAME,
                        "Key": storage_path,
                        "ContentType": mime_type
                    },
                    ExpiresIn=expires_in_seconds
                )
                return {
                    "mode": "s3",
                    "upload_url": presigned_url,
                    "storage_path": storage_path,
                    "expires_in": expires_in_seconds,
                    "headers": {"Content-Type": mime_type}
                }
            except Exception as e:
                logger.warning(f"Failed to generate AWS S3 presigned URL, falling back to local vault: {e}")

        # Local Tokenized Vault Fallback
        payload = {
            "channel_id": channel_id,
            "user_id": user_id,
            "file_name": file_name,
            "mime_type": mime_type,
            "file_size": file_size_bytes,
            "storage_path": storage_path,
            "exp": int(time.time()) + expires_in_seconds
        }
        token = cls._sign_token(payload)
        upload_url = f"/api/v1/chat/files/upload-vault/{token}"

        return {
            "mode": "local_vault",
            "upload_url": upload_url,
            "storage_path": storage_path,
            "expires_in": expires_in_seconds,
            "headers": {"Content-Type": mime_type}
        }

    @classmethod
    def generate_presigned_download_url(
        cls,
        attachment_id: str,
        storage_path: str,
        file_name: str,
        mime_type: str,
        expires_in_seconds: int = 3600  # 1 hour
    ) -> str:
        """
        Generate time-limited pre-signed GET URL for downloading attachments.
        """
        if cls.is_s3_configured():
            try:
                import boto3
                from botocore.config import Config

                s3_kwargs = {
                    "aws_access_key_id": AWS_ACCESS_KEY_ID,
                    "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
                    "region_name": AWS_REGION,
                    "config": Config(signature_version="s3v4")
                }
                if S3_ENDPOINT_URL:
                    s3_kwargs["endpoint_url"] = S3_ENDPOINT_URL

                s3_client = boto3.client("s3", **s3_kwargs)
                return s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": S3_BUCKET_NAME,
                        "Key": storage_path,
                        "ResponseContentDisposition": f'inline; filename="{file_name}"'
                    },
                    ExpiresIn=expires_in_seconds
                )
            except Exception as e:
                logger.warning(f"Failed to generate AWS S3 presigned GET URL: {e}")

        # Local Tokenized Vault Download URL
        payload = {
            "attachment_id": attachment_id,
            "storage_path": storage_path,
            "file_name": file_name,
            "exp": int(time.time()) + expires_in_seconds
        }
        token = cls._sign_token(payload)
        return f"/api/v1/chat/files/download-vault/{token}"

    @staticmethod
    def _sign_token(payload: Dict[str, Any]) -> str:
        import base64
        data_str = json.dumps(payload, separators=(',', ':'))
        encoded_data = base64.urlsafe_b64encode(data_str.encode()).decode().rstrip('=')
        sig = hmac.new(SIGNING_SECRET.encode(), encoded_data.encode(), hashlib.sha256).hexdigest()
        return f"{encoded_data}.{sig}"

    @staticmethod
    def verify_token(token: str) -> Optional[Dict[str, Any]]:
        import base64
        try:
            parts = token.split(".")
            if len(parts) != 2:
                return None
            encoded_data, sig = parts[0], parts[1]
            expected_sig = hmac.new(SIGNING_SECRET.encode(), encoded_data.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected_sig):
                return None
            
            # Padding restoration
            padded_data = encoded_data + '=' * (-len(encoded_data) % 4)
            data_bytes = base64.urlsafe_b64decode(padded_data)
            payload = json.loads(data_bytes.decode())
            
            if payload.get("exp", 0) < time.time():
                return None  # Token expired
            return payload
        except Exception:
            return None
