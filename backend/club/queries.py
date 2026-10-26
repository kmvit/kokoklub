from datetime import timedelta

from django.conf import settings
from django.db.models import Exists, OuterRef
from django.utils import timezone

from .models import Card, Visit


def club_day_start():
    """Начало текущего клубного дня (см. CLUB_DAY_START_HOUR)."""
    now = timezone.localtime()
    start = now.replace(hour=settings.CLUB_DAY_START_HOUR, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    return start


def open_visits():
    """Кто сейчас в клубе: вошёл в этот клубный день и не вышел."""
    return Visit.objects.filter(left_at__isnull=True, entered_at__gte=club_day_start())


def with_club_flags(qs):
    return qs.annotate(
        has_card=Exists(Card.objects.filter(member=OuterRef("pk"), is_active=True)),
        in_club=Exists(open_visits().filter(member=OuterRef("pk"))),
    )
