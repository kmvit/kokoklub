"""Участник клуба — он же учётная запись. Вход по почте и паролю."""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from .phone import normalize_phone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra):
        email = extra.pop("email", None)
        if email:
            email = email.strip().lower()
        user = self.model(phone=normalize_phone(phone), email=email, **extra)
        if password:
            user.set_password(password)
        else:
            # анкету без входа может завести персонал
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        if not extra.get("email"):
            raise ValueError("Для администратора нужна электронная почта")
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(phone, password, **extra)


class Activity(models.Model):
    """Вид деятельности — справочник, чтобы поиск «кто делает сайты» работал."""

    name = models.CharField("название", max_length=80, unique=True)
    order = models.PositiveSmallIntegerField("порядок", default=100)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "вид деятельности"
        verbose_name_plural = "виды деятельности"

    def __str__(self):
        return self.name


class Hobby(models.Model):
    """Хобби — свободные теги: участник пишет своё, совпадения склеиваются."""

    name = models.CharField("название", max_length=40, unique=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "хобби"
        verbose_name_plural = "хобби"

    def __str__(self):
        return self.name

    @staticmethod
    def clean_name(raw: str) -> str:
        return " ".join((raw or "").split()).lower()[:40]


class User(AbstractBaseUser, PermissionsMixin):
    class Status(models.TextChoices):
        # как в ICQ: человек сам говорит, можно ли к нему сейчас подойти
        OPEN = "open", "Готов общаться"
        BUSY = "busy", "Занят"
        DND = "dnd", "Не беспокоить"

    phone = models.CharField("телефон", max_length=11, unique=True)
    email = models.EmailField("электронная почта", unique=True, null=True, blank=True)
    full_name = models.CharField("ФИО", max_length=150, blank=True)
    photo = models.ImageField("фото", upload_to="photos/", blank=True)
    activity = models.ForeignKey(
        Activity, verbose_name="вид деятельности", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="members",
    )
    occupation = models.CharField("чем занимаюсь", max_length=150, blank=True)
    hobbies = models.ManyToManyField(Hobby, verbose_name="хобби", blank=True, related_name="members")
    about = models.TextField("о себе", blank=True)
    can_help = models.TextField("чем могу помочь", blank=True)
    looking_for = models.TextField("кого ищу", blank=True)
    telegram = models.CharField("Telegram", max_length=32, blank=True)
    show_phone = models.BooleanField("показывать телефон участникам", default=False)

    status = models.CharField("статус", max_length=8, choices=Status.choices, default=Status.OPEN)
    status_text = models.CharField("подпись к статусу", max_length=80, blank=True)

    # Без согласия на обработку ПДн анкета не сохраняется и в каталог не попадает.
    consent_at = models.DateTimeField("согласие на обработку ПДн", null=True, blank=True)
    # Модерация: скрытый участник пропадает из каталога, но карта и вход работают.
    is_hidden = models.BooleanField("скрыт из каталога", default=False)

    is_active = models.BooleanField("активен", default=True)
    is_staff = models.BooleanField("персонал", default=False)
    date_joined = models.DateTimeField("зарегистрирован", default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        verbose_name = "участник"
        verbose_name_plural = "участники"

    def __str__(self):
        return self.full_name or f"+{self.phone}"

    @property
    def is_member(self) -> bool:
        """Член клуба — тот, у кого привязана действующая карта."""
        return self.cards.filter(is_active=True).exists()

    @property
    def profile_complete(self) -> bool:
        return bool(self.full_name and self.consent_at)


class Project(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="projects")
    title = models.CharField("название", max_length=150)
    description = models.TextField("описание", blank=True, max_length=5000)
    url = models.URLField("ссылка", blank=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "проект"
        verbose_name_plural = "проекты"


class Event(models.Model):
    title = models.CharField("название", max_length=150)
    description = models.TextField("описание", blank=True)
    starts_at = models.DateTimeField("начало")
    location = models.CharField("место", max_length=200, blank=True)
    is_published = models.BooleanField("опубликовано", default=False)

    class Meta:
        ordering = ["starts_at"]
        verbose_name = "событие афиши"
        verbose_name_plural = "афиша"


class TopUp(models.Model):
    member = models.ForeignKey(User, on_delete=models.PROTECT, related_name="topups")
    amount = models.DecimalField("сумма, ₽", max_digits=10, decimal_places=2)
    reference = models.UUIDField(unique=True, editable=False)
    created_at = models.DateTimeField("дата", auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="credited_topups")

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "пополнение счёта"
        verbose_name_plural = "пополнения счетов"
        constraints = [models.CheckConstraint(check=models.Q(amount__gt=0), name="topup_positive")]


def account_balance(user):
    from decimal import Decimal
    from django.db.models import Sum
    return user.topups.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
