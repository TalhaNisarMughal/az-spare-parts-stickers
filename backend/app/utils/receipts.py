"""Receipt uploads: validate, shrink, store in the database, serve back."""
import io

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from ..models import Receipt

MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # before compression
MAX_IMAGE_SIDE = 1600  # px — plenty to read a receipt, small enough for the DB
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
ALLOWED_TYPES = IMAGE_TYPES | {"application/pdf"}


def _shrink_image(raw: bytes) -> tuple[bytes, str]:
    """Re-encode as a bounded JPEG. Returns (bytes, content_type)."""
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)  # respect phone-camera rotation
    except Exception:
        raise HTTPException(400, "That image could not be read. Try a JPG, PNG or PDF.")
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=82, optimize=True)
    return out.getvalue(), "image/jpeg"


def store_receipt(file: UploadFile, kind: str, db: Session) -> Receipt:
    content_type = (file.content_type or "").lower()
    name = (file.filename or "receipt").strip()[:255]
    if content_type not in ALLOWED_TYPES:
        # Some browsers send an empty/odd type; fall back to the extension.
        lower = name.lower()
        if lower.endswith(".pdf"):
            content_type = "application/pdf"
        elif lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")):
            content_type = "image/jpeg"
        else:
            raise HTTPException(400, "Only images (JPG, PNG, WEBP) or PDF files can be attached.")

    raw = file.file.read()
    if not raw:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "The file is larger than 8 MB. Please use a smaller photo or PDF.")

    if content_type in IMAGE_TYPES:
        data, content_type = _shrink_image(raw)
        if not name.lower().endswith((".jpg", ".jpeg")):
            name = name.rsplit(".", 1)[0] + ".jpg"
    else:
        data = raw

    receipt = Receipt(
        kind=kind,
        filename=name,
        content_type=content_type,
        size_bytes=len(data),
        data=data,
    )
    db.add(receipt)
    db.flush()
    return receipt


def receipt_to_dict(r: Receipt | None) -> dict | None:
    if not r:
        return None
    return {
        "id": r.id,
        "filename": r.filename,
        "content_type": r.content_type,
        "size_bytes": r.size_bytes,
        "uploaded_at": r.uploaded_at.strftime("%Y-%m-%dT%H:%M:%S") + "Z",
    }


def receipt_response(r: Receipt) -> Response:
    return Response(
        content=r.data,
        media_type=r.content_type,
        headers={"Content-Disposition": f'inline; filename="{r.filename}"'},
    )


def replace_receipt(owner, file: UploadFile, kind: str, db: Session) -> Receipt:
    """Attach a new receipt to `owner` (anything with .receipt_id), dropping the old one."""
    old = owner.receipt_id
    new = store_receipt(file, kind, db)
    owner.receipt_id = new.id
    if old:
        stale = db.get(Receipt, old)
        if stale:
            db.delete(stale)
    return new


def remove_receipt(owner, db: Session) -> None:
    if owner.receipt_id:
        stale = db.get(Receipt, owner.receipt_id)
        owner.receipt_id = None
        db.flush()
        if stale:
            db.delete(stale)
