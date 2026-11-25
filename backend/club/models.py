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


class EntryPayment(models.Model):
    visit = models.OneToOneField(Visit, on_delete=models.PROTECT)
    amount = models.PositiveIntegerField()
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class MembershipSale(models.Model):
    class Tariff(models.TextChoices):
        MONTH = "month", "Месяц"
        HALF = "half", "Полгода"
        YEAR = "year", "Год"
        KEEPER = "keeper", "Хранитель"
        PATRON = "patron", "Попечитель"

    credit_grant = models.PositiveIntegerField(default=0)
    included_visits = models.PositiveIntegerField(default=0)
    tariff = models.CharField(max_length=12, choices=Tariff.choices, default=Tariff.MONTH)
    member = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="membership_sales", on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", null=True, on_delete=models.PROTECT)
    entry_payment = models.OneToOneField(EntryPayment, null=True, on_delete=models.PROTECT)
    paid = models.PositiveIntegerField()
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()


    @property
    def invite_allowance(self):
        return {self.Tariff.MONTH: 1, self.Tariff.HALF: 3, self.Tariff.YEAR: 6, self.Tariff.KEEPER: 10, self.Tariff.PATRON: 20}[self.tariff]

    @property
    def visits_left(self):
        bought = self.packpurchase_set.aggregate(total=models.Sum("visits"))["total"] or 0
        used = self.package_bookings.filter(refunded=False).count()
        given = self.sent_visits.aggregate(total=models.Sum("quantity"))["total"] or 0
        received = self.received_visits.aggregate(total=models.Sum("quantity"))["total"] or 0
        return (self.included_visits + bought + received - given - used - self.walkin_set.count()
                - self.guest_bookings.filter(payment="pack", refunded=False).count())

    @property
    def invites_left(self):
        return max(0, self.invite_allowance - self.guest_bookings.filter(payment="invite", refunded=False).count())


class GuestBooking(models.Model):
    ticket = models.UUIDField(null=True, unique=True, editable=False)
    payment = models.CharField(max_length=8, choices=[("invite", "Пригласительный"), ("pack", "Визит"), ("tokens", "Токены")], default="invite")
    price = models.PositiveIntegerField(default=0)
    sale = models.ForeignKey(MembershipSale, related_name="guest_bookings", on_delete=models.PROTECT)
    event = models.ForeignKey("members.Event", related_name="guest_bookings", on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    arrived_at = models.DateTimeField(null=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    cancelled_at = models.DateTimeField(null=True)
    refunded = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["sale", "event"], condition=Q(cancelled_at__isnull=True),
                                    name="one_active_guest_per_sale_event"),
        ]


class OrganizerReward(models.Model):
    event = models.OneToOneField("members.Event", on_delete=models.PROTECT)
    organizer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="organizer_rewards")
    arrival = models.ForeignKey(Visit, on_delete=models.PROTECT, related_name="+")
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    completed_at = models.DateTimeField(null=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    invite_used_at = models.DateTimeField(null=True)
    invite_used_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    extra_visit = models.ForeignKey(Visit, null=True, on_delete=models.PROTECT, related_name="+")
    extra_visit_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")


class FoodRedemption(models.Model):
    reward = models.ForeignKey(OrganizerReward, related_name="food_orders", on_delete=models.PROTECT)
    amount = models.PositiveIntegerField()
    reference = models.UUIDField(unique=True)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)


class VisitPack(models.Model):
    title = models.CharField("название пакета", max_length=100)
    visits = models.PositiveSmallIntegerField("количество визитов")
    price = models.PositiveIntegerField("цена в токенах")
    available = models.BooleanField("открыта продажа", default=False)

    class Meta:
        verbose_name = "пакет визитов"
        verbose_name_plural = "пакеты визитов"
        constraints = [models.CheckConstraint(check=Q(visits__gt=0, price__gt=0), name="positive_pack_terms")]


class PackPurchase(models.Model):
    member = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="pack_purchases", on_delete=models.PROTECT)
    sale = models.ForeignKey(MembershipSale, on_delete=models.PROTECT)
    pack = models.ForeignKey(VisitPack, on_delete=models.PROTECT)
    visits = models.PositiveSmallIntegerField()
    price = models.PositiveIntegerField()
    reference = models.UUIDField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class WalkIn(models.Model):
    member = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="walkins", on_delete=models.PROTECT)
    day = models.DateField()
    visit = models.ForeignKey(Visit, on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", on_delete=models.PROTECT)
    package_sale = models.ForeignKey(MembershipSale, null=True, on_delete=models.PROTECT)
    price = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["member", "day"], name="one_resident_entry_daily")]


class BarOrder(models.Model):
    member = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="bar_orders", on_delete=models.PROTECT)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="+", on_delete=models.PROTECT)
    reference = models.UUIDField(unique=True)
    items = models.JSONField()
    ratings = models.JSONField(default=dict)
    service = models.PositiveSmallIntegerField(null=True)
    skipped = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class MenuQuestion(models.Model):
    title = models.CharField(max_length=120)
    note = models.CharField(max_length=160, blank=True)
    wish = models.BooleanField(default=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decision = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class MenuVote(models.Model):
    question = models.ForeignKey(MenuQuestion, related_name="votes", on_delete=models.CASCADE)
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    choice = models.CharField(max_length=5)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["member", "question"], name="one_menu_vote")]


class TeamPolicy(models.Model):
    rules = models.JSONField(default=dict)


class TeamPerson(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=80)
    post = models.CharField(max_length=80, blank=True)


class TeamCard(models.Model):
    person = models.ForeignKey(TeamPerson, on_delete=models.PROTECT, null=True)
    color = models.CharField(max_length=8)
    reason = models.CharField(max_length=160)
    note = models.CharField(max_length=300, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.ForeignKey("self", null=True, on_delete=models.PROTECT)
    dispute = models.JSONField(default=dict)
    void = models.BooleanField(default=False)
    amount = models.PositiveIntegerField(default=0)
    order = models.OneToOneField(BarOrder, null=True, on_delete=models.PROTECT)
    reference = models.UUIDField(null=True, unique=True)


class TeamFundEntry(models.Model):
    title = models.CharField(max_length=120)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    amount = models.PositiveIntegerField(default=0)
    voters = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="+", blank=True)
    reference = models.UUIDField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class VisitTransfer(models.Model):
    source = models.ForeignKey(MembershipSale, related_name="sent_visits", on_delete=models.PROTECT)
    destination = models.ForeignKey(MembershipSale, related_name="received_visits", on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    reference = models.UUIDField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
