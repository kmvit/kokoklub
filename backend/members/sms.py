"""Отправка SMS. Провайдер выбирается настройкой SMS_BACKEND."""
import logging

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class SmsError(Exception):
    pass


def send_sms(phone: str, text: str) -> None:
    if settings.SMS_BACKEND == "smsru":
        _send_smsru(phone, text)
    else:
        # разработка: SMS никуда не уходит, код видно в логе бэкенда
        logger.info("SMS для +%s: %s", phone, text)


def _send_smsru(phone: str, text: str) -> None:
    params = {"api_id": settings.SMSRU_API_ID, "to": phone, "msg": text, "json": 1}
    if settings.SMS_SENDER:
        params["from"] = settings.SMS_SENDER
    try:
        res = httpx.get("https://sms.ru/sms/send", params=params, timeout=10)
        body = res.json()
    except (httpx.HTTPError, ValueError) as e:
        raise SmsError(f"sms.ru недоступен: {e}") from e
    sms = (body.get("sms") or {}).get(phone) or {}
    if body.get("status") != "OK" or sms.get("status") != "OK":
        raise SmsError(f"sms.ru отказал: {sms.get('status_text') or body.get('status_text')}")
