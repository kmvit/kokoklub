"""Участник клуба — он же учётная запись. Вход по почте и паролю."""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver
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
        """Для оформленных тарифов проверяем срок, для прежних карт — активную метку."""
        if self.is_staff:
            return False
        latest = self.membership_sales.order_by("-ends_at").values_list("ends_at", flat=True).first()
        if latest is not None:
            return latest > timezone.now()
        return self.cards.filter(is_active=True).exists()

    @property
    def profile_complete(self) -> bool:
        return bool(self.full_name and self.consent_at)


class Project(models.Model):
    helpers = models.ManyToManyField(User, related_name="helped_projects", blank=True)
    exchange = models.CharField(max_length=240, blank=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="projects")
    title = models.CharField("название", max_length=150)
    description = models.TextField("описание", blank=True, max_length=5000)
    url = models.URLField("ссылка", blank=True)

    class Stage(models.TextChoices):
        IDEA = "idea", "Идея"
        IN_PROGRESS = "in_progress", "В работе"
        COMPLETE = "complete", "Готово"

    summary = models.CharField("краткое описание", max_length=240, blank=True)
    directions = models.JSONField(default=list, blank=True)
    author_role = models.CharField("роль автора", max_length=120, blank=True)
    stage = models.CharField(max_length=16, choices=Stage.choices, blank=True)
    looking_for = models.CharField("ищу для проекта", max_length=300, blank=True)
    links = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-id"]
        verbose_name = "проект"
        verbose_name_plural = "проекты"


class ProjectImage(models.Model):
    project = models.ForeignKey(Project, related_name="images", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="projects/")
    is_cover = models.BooleanField(default=False)

    class Meta:
        ordering = ["-is_cover", "id"]


@receiver(post_delete, sender=ProjectImage)
def delete_project_image_file(sender, instance, **kwargs):
    image = instance.image
    transaction.on_commit(lambda: image.storage.delete(image.name), robust=True)


class Event(models.Model):
    accepts_pack = models.BooleanField("можно оплатить собственное место одним визитом", default=False)
    guest_seats = models.PositiveIntegerField("мест для гостей по записи", default=0)
    guest_extra = models.PositiveIntegerField("доплата гостя за программу в токенах", default=0)
    organizer = models.ForeignKey(User, verbose_name="организатор своей встречи", null=True, blank=True,
                                  limit_choices_to={"is_staff": False}, on_delete=models.PROTECT)
    cancelled_at = models.DateTimeField(null=True, editable=False)
    resident_seats = models.PositiveIntegerField("мест для самостоятельной брони резидентов", default=0)
    resident_price = models.PositiveIntegerField("цена места резидента в токенах", null=True, blank=True)
    invite_seats = models.PositiveIntegerField("мест по пригласительным", default=0)
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


class PartnerCode(models.Model):
    event = models.ForeignKey(Event, on_delete=models.PROTECT)
    code = models.SlugField("промокод", unique=True)
    limit = models.PositiveIntegerField("число использований")
    enabled = models.BooleanField("действует", default=True)

    class Meta:
        verbose_name = "промокод организатора"
        verbose_name_plural = "промокоды организаторов"


class ResidentBooking(models.Model):
    package_sale = models.ForeignKey("club.MembershipSale", related_name="package_bookings", null=True, on_delete=models.PROTECT)
    guest = models.BooleanField(default=False)
    guest_entry = models.PositiveIntegerField(default=0)
    partner_code = models.ForeignKey(PartnerCode, null=True, on_delete=models.PROTECT)
    visit = models.ForeignKey("club.Visit", null=True, on_delete=models.PROTECT)
    checked_in_by = models.ForeignKey(User, null=True, on_delete=models.PROTECT, related_name="+")
    member = models.ForeignKey(User, related_name="resident_bookings", on_delete=models.PROTECT)
    event = models.ForeignKey(Event, related_name="resident_bookings", on_delete=models.PROTECT)
    price = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True)
    refunded = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["member", "event"], condition=models.Q(cancelled_at__isnull=True),
                                                name="one_active_resident_booking")]


def balance_expression():
    from decimal import Decimal
    from django.db.models.functions import Coalesce

    def total(query, field, owner="member"):
        sums = query.filter(**{owner: models.OuterRef("pk")}).order_by().values(owner).annotate(value=models.Sum(field))
        return Coalesce(models.Subquery(sums.values("value")), models.Value(Decimal("0.00")),
                        output_field=models.DecimalField(max_digits=20, decimal_places=2))

    from club.models import GuestBooking, MembershipSale, PackPurchase, WalkIn
    return (total(OnlinePayment.objects.filter(confirmed_at__isnull=False, purpose="topup"), "amount")
            + total(OnlinePayment.objects.filter(purpose="gift_tokens", redeemed_at__isnull=False), "amount", "redeemed_by")
            - total(ShopOrder.objects.all(), "price")
            + total(MembershipSale.objects.filter(starts_at__lte=timezone.now()), "credit_grant") - total(PackPurchase.objects.all(), "price")
            + total(TopUp.objects.all(), "amount") - total(ResidentBooking.objects.filter(refunded=False), "price")
            - total(RecordingPurchase.objects.all(), "price")
            - total(WalkIn.objects.all(), "price")
            - total(GuestBooking.objects.filter(refunded=False), "price", "sale__member"))


def account_balance(user):
    return User.objects.filter(pk=user.pk).annotate(balance=balance_expression()).values_list("balance", flat=True).get()


class MeetingProposal(models.Model):
    class Stage(models.TextChoices):
        NEW = "new", "На рассмотрении"
        OPEN = "open", "Сбор интереса"
        DECLINED = "declined", "Отклонена"

    author = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    contact = models.CharField("как связаться с автором", max_length=200)
    title = models.CharField("тема", max_length=150)
    description = models.TextField("описание", max_length=2400)
    stage = models.CharField("статус", max_length=12, choices=Stage.choices, default=Stage.NEW)
    interested = models.ManyToManyField(User, related_name="meeting_interests", blank=True)
    review = models.CharField("ответ команды", max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    event = models.OneToOneField(Event, null=True, blank=True, on_delete=models.PROTECT, verbose_name="встреча в афише")

    class Meta:
        verbose_name = "заявка на встречу"
        verbose_name_plural = "заявки на встречи"

    def __str__(self):
        return self.title


class ClubPost(models.Model):
    title = models.CharField(max_length=140, blank=True)
    poll_choices = models.JSONField(default=list, blank=True)
    poll_question = models.CharField(max_length=140, blank=True)
    likes = models.ManyToManyField(User, related_name="+", blank=True)
    respondents = models.ManyToManyField(User, related_name="+", blank=True)
    pinned = models.BooleanField(default=False)

    class Kind(models.TextChoices):
        NOTE = "note", "Обсуждение"
        OFFER = "offer", "Свои для своих"
        POLL = "poll", "Голосование"

    author = models.ForeignKey(User, on_delete=models.PROTECT)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    text = models.TextField(max_length=2400)
    created_at = models.DateTimeField(auto_now_add=True)
    visible = models.BooleanField(default=True)

    class Meta:
        verbose_name = "публикация клуба"
        verbose_name_plural = "публикации клуба"


class PollVote(models.Model):
    option = models.PositiveSmallIntegerField(null=True)
    post = models.ForeignKey(ClubPost, on_delete=models.CASCADE, related_name="votes")
    member = models.ForeignKey(User, on_delete=models.CASCADE)
    support = models.BooleanField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "member"], name="one_club_poll_vote")]


class Recording(models.Model):
    title = models.CharField("название", max_length=150)
    url = models.URLField("ссылка для просмотра")
    price = models.PositiveIntegerField("цена для гостя в токенах")
    published = models.BooleanField("опубликовано", default=False)

    class Meta:
        verbose_name = "запись клуба"
        verbose_name_plural = "записи клуба"


class RecordingPurchase(models.Model):
    member = models.ForeignKey(User, on_delete=models.PROTECT, related_name="recording_purchases")
    recording = models.ForeignKey(Recording, on_delete=models.PROTECT)
    price = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["recording", "member"], name="one_recording_purchase")]


class OnlinePayment(models.Model):
    purpose = models.CharField(max_length=24, default="topup")
    card_quote = models.JSONField(default=dict, blank=True)
    gift_code = models.CharField(max_length=40, unique=True, null=True)
    redeemed_by = models.ForeignKey(User, related_name="redeemed_gifts", null=True, on_delete=models.PROTECT)
    redeemed_at = models.DateTimeField(null=True)

    member = models.ForeignKey(User, on_delete=models.PROTECT, related_name="online_payments")
    order_id = models.UUIDField(unique=True, editable=False)
    reference = models.UUIDField()
    amount = models.PositiveIntegerField("сумма пополнения в рублях")
    payment_id = models.CharField(max_length=32, null=True, unique=True)
    payment_url = models.URLField(max_length=1000, blank=True)
    status = models.CharField(max_length=32, default="CREATED")
    confirmed_at = models.DateTimeField(null=True)
    needs_review = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["member", "reference"], name="one_checkout_per_reference")]
        verbose_name = "онлайн-пополнение"
        verbose_name_plural = "онлайн-пополнения"


class ShelfItem(models.Model):
    class Kind(models.TextChoices):
        VINYL = "vinyl", "Пластинка"
        FILM = "film", "Фильм"
        BOOK = "book", "Книга"

    kind = models.CharField(max_length=8, choices=Kind.choices)
    title = models.CharField(max_length=120)
    by = models.CharField("автор", max_length=80, blank=True)
    in_collection = models.BooleanField("в коллекции", default=True)
    suggested_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    supporters = models.ManyToManyField(User, related_name="shelf_wishes", blank=True)

    def __str__(self):
        return self.title


class ShelfBallot(models.Model):
    event = models.OneToOneField(Event, on_delete=models.CASCADE)
    kind = models.CharField(max_length=8, choices=ShelfItem.Kind.choices)


class ShelfChoice(models.Model):
    ballot = models.ForeignKey(ShelfBallot, on_delete=models.CASCADE)
    member = models.ForeignKey(User, on_delete=models.CASCADE)
    item = models.ForeignKey(ShelfItem, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["ballot", "member"], name="one_choice_per_library_evening")]


class ClubQuestionnaire(models.Model):
    member = models.OneToOneField(User, related_name="questionnaire", on_delete=models.CASCADE)
    answers = models.JSONField(default=dict)
    hidden = models.JSONField(default=list)
    meet_on = models.DateField(null=True)


class Discussion(models.Model):
    topic = models.SlugField(max_length=40)
    title = models.CharField(max_length=140)
    author = models.ForeignKey(User, on_delete=models.PROTECT)
    post = models.OneToOneField(ClubPost, blank=True, null=True, on_delete=models.CASCADE)
    pinned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class DiscussionReply(models.Model):
    discussion = models.ForeignKey(Discussion, related_name="replies", on_delete=models.CASCADE)
    author = models.ForeignKey(User, on_delete=models.PROTECT)
    text = models.TextField(max_length=2000)
    reply_to = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    likes = models.ManyToManyField(User, related_name="+", blank=True)
    reports = models.ManyToManyField(User, related_name="+", blank=True)


class TopicPreference(models.Model):
    topic = models.SlugField(max_length=40)
    member = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["topic", "member"], name="one_topic_preference")]


class ShopProduct(models.Model):
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    price = models.PositiveIntegerField()
    available = models.BooleanField(default=True)
    requires_portrait = models.BooleanField(default=False)

    def __str__(self):
        return self.title


class ShopOrder(models.Model):
    member = models.ForeignKey(User, related_name="shop_orders", on_delete=models.PROTECT)
    product = models.ForeignKey(ShopProduct, on_delete=models.PROTECT)
    title = models.CharField(max_length=120)
    price = models.PositiveIntegerField()
    reference = models.UUIDField(unique=True)
    status = models.CharField(max_length=10, choices=[("ordered","Принят"),("ready","Готов"),("issued","Выдан")], default="ordered")
    created_at = models.DateTimeField(auto_now_add=True)
