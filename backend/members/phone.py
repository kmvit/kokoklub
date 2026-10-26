import re


def normalize_phone(raw: str) -> str:
    """Российский номер в виде 7XXXXXXXXXX: так он хранится и по нему ищут.

    Принимает любое написание: +7 (900) 123-45-67, 8 900 123 45 67, 9001234567.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "7" + digits
    elif len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) != 11 or not digits.startswith("79"):
        raise ValueError("Введите номер мобильного телефона")
    return digits
