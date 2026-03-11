import qrcode
from PIL import Image
import json
import io


def generate_qr_code(data: dict, box_size: int = 4, border: int = 2) -> Image.Image:
    """Generate a QR code image from a dictionary of data."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(json.dumps(data))
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def read_qr_code(image: Image.Image) -> dict | None:
    """Read QR code from an image and return the decoded data."""
    from pyzbar.pyzbar import decode as qr_decode
    decoded = qr_decode(image)
    if not decoded:
        return None
    try:
        data = json.loads(decoded[0].data.decode("utf-8"))
        return data
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
