import io
import base64
import random
import string
import pyotp
import qrcode

def generate_totp_secret() -> str:
    """Generate a 32-character Base32 TOTP secret."""
    return pyotp.random_base32()

def get_totp_uri(email: str, secret: str) -> str:
    """Generate TOTP provisioning URI for authenticator apps."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="Maxenius HRMS")

def generate_qr_code_base64(otp_uri: str) -> str:
    """Render QR Code as Base64 PNG data URL."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(otp_uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{qr_b64}"

def verify_totp_code(secret: str, code: str) -> bool:
    """Verify 6-digit TOTP code with time drift window tolerance."""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code.strip(), valid_window=1)

def generate_backup_codes(count: int = 8) -> list:
    """Generate a list of unique 8-character uppercase backup recovery codes."""
    chars = string.ascii_uppercase + string.digits
    codes = set()
    while len(codes) < count:
        code = "".join(random.choices(chars, k=8))
        codes.add(code)
    return sorted(list(codes))
