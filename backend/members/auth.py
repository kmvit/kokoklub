"""Вход участника по SMS-коду и персонала по паролю."""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.cache import cache
from django.db.models import F
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LoginCode, User
from .phone import normalize_phone
from .sms import SmsError, send_sms

logger = logging.getLogger(__name__)

CODE_TTL = timedelta(minutes=5)
RESEND_AFTER = timedelta(seconds=60)
MAX_CODES_PER_HOUR = 5
MAX_ATTEMPTS = 5
# Каждое SMS стоит денег: с одного адреса не больше стольких запросов в час,
# иначе бот переберёт чужие номера за наш счёт.
MAX_CODES_PER_IP_HOUR = 20


def _hash(phone: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def tokens_for(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


class RequestCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            phone = normalize_phone(request.data.get("phone", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

        ip_key = f"sms-ip:{_client_ip(request)}"
        if cache.get(ip_key, 0) >= MAX_CODES_PER_IP_HOUR:
            return Response({"detail": "Слишком много попыток, попробуйте позже"}, status=429)

        now = timezone.now()
        recent = LoginCode.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
        last = recent.order_by("-created_at").first()
        if last and now - last.created_at < RESEND_AFTER:
            wait = int((RESEND_AFTER - (now - last.created_at)).total_seconds()) + 1
            return Response(
                {"detail": f"Новый код можно запросить через {wait} с", "retry_after": wait},
                status=429,
            )
        if recent.count() >= MAX_CODES_PER_HOUR:
            return Response({"detail": "Слишком много кодов за час, попробуйте позже"}, status=429)

        code = f"{secrets.randbelow(10000):04d}"
        LoginCode.objects.create(phone=phone, code_hash=_hash(phone, code))
        try:
            send_sms(phone, f"Код входа в Клуб Коко: {code}")
        except SmsError:
            logger.exception("Не ушло SMS с кодом на +%s", phone)
            return Response({"detail": "Не удалось отправить SMS, попробуйте позже"}, status=502)

        cache.set(ip_key, cache.get(ip_key, 0) + 1, 3600)
        return Response({"phone": phone, "retry_after": int(RESEND_AFTER.total_seconds())})


class VerifyCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            phone = normalize_phone(request.data.get("phone", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        code = str(request.data.get("code", "")).strip()

        login_code = (
            LoginCode.objects.filter(phone=phone, used=False, created_at__gte=timezone.now() - CODE_TTL)
            .order_by("-created_at")
            .first()
        )
        if not login_code:
            return Response({"detail": "Код устарел — запросите новый"}, status=400)
        if login_code.attempts >= MAX_ATTEMPTS:
            return Response({"detail": "Слишком много неверных попыток — запросите новый код"}, status=400)
        if not hmac.compare_digest(login_code.code_hash, _hash(phone, code)):
            LoginCode.objects.filter(pk=login_code.pk).update(attempts=F("attempts") + 1)
            return Response({"detail": "Неверный код"}, status=400)

        login_code.used = True
        login_code.save(update_fields=["used"])

        user = User.objects.filter(phone=phone).first() or User.objects.create_user(phone)
        if not user.is_active:
            return Response({"detail": "Учётная запись заблокирована"}, status=403)
        return Response(tokens_for(user))


class StaffLoginView(APIView):
    """Вход персонала на планшете: телефон и пароль, заданный в админке."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            phone = normalize_phone(request.data.get("phone", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        user = authenticate(request, phone=phone, password=request.data.get("password", ""))
        if not user or not user.is_staff:
            return Response({"detail": "Неверный телефон или пароль"}, status=400)
        return Response(tokens_for(user))
