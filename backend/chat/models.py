"""Личная переписка двух участников.

Пока без онлайна: новые сообщения приходят при обновлении страницы.
"""
from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Conversation(models.Model):
    # Пара хранится упорядоченно (user_a.id < user_b.id) — так у двух людей
    # ровно одна переписка, кто бы ни написал первым.
    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        verbose_name = "переписка"
        verbose_name_plural = "переписки"
        constraints = [
            models.UniqueConstraint(fields=["user_a", "user_b"], name="conversation_pair_unique"),
            models.CheckConstraint(check=Q(user_a__lt=F("user_b")), name="conversation_pair_ordered"),
        ]

    def __str__(self):
        return f"{self.user_a} — {self.user_b}"

    @classmethod
    def between(cls, one, other):
        a, b = sorted([one, other], key=lambda u: u.pk)
        return cls.objects.get_or_create(user_a=a, user_b=b)[0]

    @classmethod
    def of(cls, user):
        return cls.objects.filter(Q(user_a=user) | Q(user_b=user))

    def other(self, user):
        return self.user_b if self.user_a_id == user.pk else self.user_a


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    text = models.TextField()
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "сообщение"
        verbose_name_plural = "сообщения"
