import io
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError


def shrink_photo(upload) -> ContentFile:
    """Фото с телефона весит мегабайты — ужимаем до 1000px JPEG.

    exif_transpose — чтобы снимок с телефона не лёг на бок.
    """
    try:
        img = Image.open(upload)
        img = ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError) as e:
        raise ValueError("Не получилось открыть фото — пришлите JPG или PNG") from e
    img.thumbnail((1000, 1000))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return ContentFile(buf.getvalue(), name=f"{uuid.uuid4().hex}.jpg")
