"""Настройки Django для портала «Клуб Коко»."""
import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from django.core.exceptions import ImproperlyConfigured

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

# На Vercel (переменная VERCEL ставится платформой) — прод по умолчанию: без DEBUG,
# с обязательным секретным ключом и адресами *.vercel.app.
ON_VERCEL = bool(os.getenv("VERCEL"))

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if ON_VERCEL:
        raise ImproperlyConfigured("Задайте DJANGO_SECRET_KEY в переменных окружения Vercel")
    SECRET_KEY = "dev-insecure-change-me"
DEBUG = os.getenv("DJANGO_DEBUG", "0" if ON_VERCEL else "1") == "1"
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
if ON_VERCEL:
    ALLOWED_HOSTS.append(".vercel.app")
if DEBUG:
    ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    # участники клуба: профиль, анкета, вход по SMS
    "members",
    # клубные карты (NFC) и визиты
    "club",
    # личные сообщения между участниками
    "chat",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Локально можно без Postgres: DB_ENGINE=sqlite (тесты, быстрый запуск без Docker).
# На Vercel база приходит одной строкой DATABASE_URL (Neon / Vercel Postgres).
if os.getenv("DATABASE_URL"):
    db_url = urlparse(os.environ["DATABASE_URL"])
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": db_url.path.lstrip("/"),
            "USER": db_url.username,
            "PASSWORD": db_url.password,
            "HOST": db_url.hostname,
            "PORT": db_url.port or 5432,
            "OPTIONS": {k: v[0] for k, v in parse_qs(db_url.query).items() if k == "sslmode"},
        }
    }
elif os.getenv("DB_ENGINE") == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "koko"),
            "USER": os.getenv("POSTGRES_USER", "koko"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "koko"),
            "HOST": os.getenv("POSTGRES_HOST", "db"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
        }
    }

# Учётная запись — это участник клуба, логин — номер телефона.
AUTH_USER_MODEL = "members.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "Europe/Moscow")
USE_I18N = True
USE_TZ = True

LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO").upper()
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "{asctime} {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        name: {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False}
        for name in ("members", "club", "chat")
    },
}
LOGGING["loggers"]["django.request"] = {
    "handlers": ["console"], "level": "ERROR", "propagate": False,
}

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

SIMPLE_JWT = {
    # Участник заходит по SMS — каждое SMS стоит денег, поэтому refresh живёт
    # долго: гость входит один раз и остаётся в кабинете на телефоне.
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=180),
}

CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5180,http://127.0.0.1:5180"
).split(",")
CSRF_TRUSTED_ORIGINS = [o for o in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if o]
if ON_VERCEL:
    CSRF_TRUSTED_ORIGINS.append("https://*.vercel.app")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# ─────────── SMS для входа ───────────
# console — код пишется в лог (разработка), smsru — отправка через sms.ru.
SMS_BACKEND = os.getenv("SMS_BACKEND", "console")
SMSRU_API_ID = os.getenv("SMSRU_API_ID", "")
SMS_SENDER = os.getenv("SMS_SENDER", "")

# ─────────── Клуб ───────────
# Бар клуба работает в Падаче: пункт «Меню» в портале ведёт на страницу
# заведения там. Пусто — пункт не показывается.
MENU_URL = os.getenv("MENU_URL", "")

# Клубный день начинается не в полночь: кто зашёл в 23:00 и сидит до двух
# ночи, всё ещё «в клубе». Незакрытые визиты прошлого дня считаются
# завершёнными — забыть приложить карту на выходе можно.
CLUB_DAY_START_HOUR = int(os.getenv("CLUB_DAY_START_HOUR", "6"))
