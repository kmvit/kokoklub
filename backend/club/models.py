"""Клубные карты (NFC) и визиты в клуб."""
import re

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


def normalize_uid(raw: str) -> str:
    """Серийный номер чипа: HEX заглавными без разделителей.

    NFC Tools показывает 53:FB:51:19:23:00:01, ридер в режиме клавиатуры
    печатает 53fb5119230001 — в базе оба превращаются в 53FB5119230001.
    Ридер должен быть настроен на HEX: десятичный вывод отсюда не отличить.
    """
    uid = re.sub(r"[^0-9A-Fa-f]", "", raw or "").upper()
    # 4 байта (Mifare Classic) … 10 байт (самые длинные UID по ISO 14443)
    if len(uid) < 8 or len(uid) > 20:
        raise ValueError("Не похоже на номер карты — приложите карту ещё раз")
    return uid


class Card(models.Model):
    uid = models.CharField("номер чипа", max_length=20)
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="участник",
        on_delete=models.CASCADE, related_name="cards",
    )
    is_active = models.BooleanField("действует", default=True)
    issued_at = models.DateTimeField("выдана", default=timezone.now)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="выдал", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    revoked_at = models.DateTimeField("отвязана", null=True, blank=True)

    class Meta:
        ordering = ["-issued_at"]
        verbose_name = "клубная карта"
        verbose_name_plural = "клубные карты"
        constraints = [
            # Одна карта — один владелец, у участника одна действующая карта.
            # Отвязанные остаются в истории: найденную старую карту можно
            # снова выдать, в том числе другому человеку.
            models.UniqueConstraint(
                fields=["uid"], condition=Q(is_active=True), name="card_uid_active_unique",
            ),
            models.UniqueConstraint(
                fields=["member"], condition=Q(is_active=True), name="card_member_active_unique",
            ),
        ]

    def __str__(self):
        return self.uid


class Visit(models.Model):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="участник",
        on_delete=models.CASCADE, related_name="visits",
    )
    card = models.ForeignKey(Card, verbose_name="карта", null=True, blank=True, on_delete=models.SET_NULL)
    entered_at = models.DateTimeField("вход", default=timezone.now, db_index=True)
    left_at = models.DateTimeField("выход", null=True, blank=True)

    class Meta:
        ordering = ["-entered_at"]
        verbose_name = "визит"
        verbose_name_plural = "визиты"

    def __str__(self):
        return f"{self.member} — {timezone.localtime(self.entered_at):%d.%m %H:%M}"
