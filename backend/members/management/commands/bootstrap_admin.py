"""Однократно создать администратора при сборке Vercel из переменных окружения."""
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from members.models import User
from members.phone import normalize_phone


class Command(BaseCommand):
    help = "Создать администратора из BOOTSTRAP_ADMIN_PHONE и BOOTSTRAP_ADMIN_PASSWORD"

    def handle(self, *args, **options):
        raw_phone = os.getenv("BOOTSTRAP_ADMIN_PHONE", "").strip()
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
        if not raw_phone and not password:
            return
        if not raw_phone or not password:
            raise CommandError("Задайте обе переменные BOOTSTRAP_ADMIN_PHONE и BOOTSTRAP_ADMIN_PASSWORD")
        try:
            phone = normalize_phone(raw_phone)
            validate_password(password)
        except (ValueError, ValidationError) as error:
            raise CommandError(str(error)) from error

        existing = User.objects.filter(phone=phone).first()
        if existing:
            if not existing.is_staff or not existing.is_superuser:
                raise CommandError("Этот номер уже занят обычной учётной записью")
            self.stdout.write("Администратор уже существует; пароль и права не менялись")
            return

        User.objects.create_superuser(phone=phone, password=password)
        self.stdout.write(self.style.SUCCESS("Администратор создан"))
