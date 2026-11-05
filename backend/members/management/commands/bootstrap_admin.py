"""Однократно создать администратора при сборке Vercel из переменных окружения."""
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from members.models import User
from members.phone import normalize_phone


class Command(BaseCommand):
    help = "Создать администратора из BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PHONE и BOOTSTRAP_ADMIN_PASSWORD"

    def handle(self, *args, **options):
        raw_phone = os.getenv("BOOTSTRAP_ADMIN_PHONE", "").strip()
        email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
        if not raw_phone and not email and not password:
            return
        if not raw_phone or not email or not password:
            raise CommandError("Задайте BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PHONE и BOOTSTRAP_ADMIN_PASSWORD")
        try:
            phone = normalize_phone(raw_phone)
            validate_password(password)
        except (ValueError, ValidationError) as error:
            raise CommandError(str(error)) from error

        existing = User.objects.filter(phone=phone).first()
        if existing:
            if not existing.is_staff or not existing.is_superuser:
                raise CommandError("Этот номер уже занят обычной учётной записью")
            if not existing.email:
                if User.objects.filter(email__iexact=email).exclude(pk=existing.pk).exists():
                    raise CommandError("Эта почта уже занята другой учётной записью")
                existing.email = email
                existing.save(update_fields=["email"])
            self.stdout.write("Администратор уже существует; пароль и права не менялись")
            return

        User.objects.create_superuser(phone=phone, email=email, password=password)
        self.stdout.write(self.style.SUCCESS("Администратор создан"))
