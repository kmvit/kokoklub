"""Единый вход по электронной почте для сайта и Django-админки."""
from django.contrib.auth.backends import ModelBackend

from .models import User


class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        email = (username or kwargs.get("email") or "").strip().lower()
        if not email or not password:
            return None
        user = User.objects.filter(email=email).first()
        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        # Сравнимое время ответа, даже если такого адреса нет.
        User().set_password(password)
        return None
