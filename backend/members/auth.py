"""Регистрация и единый вход по почте и паролю."""
import hashlib

from django.contrib.auth import authenticate, login as session_login, logout as session_logout
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .phone import normalize_phone


def tokens_for(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)
    consent = serializers.BooleanField()

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Эта почта уже зарегистрирована")
        return email

    def validate_phone(self, value):
        try:
            phone = normalize_phone(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("Этот телефон уже есть в системе. Обратитесь к персоналу клуба")
        return phone

    def validate_password(self, value):
        try:
            validate_password(value)
        except ValidationError as error:
            raise serializers.ValidationError(error.messages) from error
        return value

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Нужно согласие на обработку персональных данных")
        return value


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = User.objects.create_user(
                data["phone"], password=data["password"], email=data["email"],
                consent_at=timezone.now(),
            )
        except IntegrityError:
            return Response({"detail": "Почта или телефон уже зарегистрированы"}, status=409)
        return Response(tokens_for(user), status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        password = str(request.data.get("password", ""))
        ip = request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")
        key = "login-fail:" + hashlib.sha256(f"{ip}:{email}".encode()).hexdigest()
        if cache.get(key, 0) >= 10:
            return Response({"detail": "Слишком много попыток. Попробуйте через 15 минут"}, status=429)
        user = authenticate(request._request, username=email, password=password)
        if not user:
            if cache.add(key, 1, 900) is False:
                try:
                    cache.incr(key)
                except ValueError:
                    cache.set(key, 1, 900)
            return Response({"detail": "Неверная почта или пароль"}, status=400)
        cache.delete(key)
        if user.is_superuser:
            # Единый вход на сайте открывает и Django-админку в том же браузере.
            session_login(request._request, user)
        return Response(tokens_for(user))


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        session_logout(request._request)
        return Response({"ok": True})
