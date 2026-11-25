from datetime import timedelta

from django.contrib import admin
from django.db import transaction
from django.utils import timezone
from django import forms
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils.html import format_html

from .models import Activity, Hobby, User, TopUp, balance_expression
from .phone import normalize_phone


def _clean_phone(form):
    try:
        return normalize_phone(form.cleaned_data["phone"])
    except ValueError as e:
        raise ValidationError(str(e)) from e


def phone_form_field():
    # Поле модели хранит 11 цифр, но ввод может содержать +, пробелы и скобки.
    # clean_phone нормализует значение до проверки ограничения модели.
    return forms.CharField(
        label="Телефон", max_length=32,
        help_text="Российский мобильный номер: +7 (900) 123-45-67. Можно вводить с +7, 8 или без кода страны.",
        widget=forms.TextInput(attrs={"type": "tel", "autocomplete": "tel", "placeholder": "+7 (900) 123-45-67"}),
    )


class UserAddForm(UserCreationForm):
    phone = phone_form_field()
    email = forms.EmailField(label="Электронная почта", required=True)
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ["phone", "email"]

    clean_phone = _clean_phone

    def clean_email(self):
        return self.cleaned_data["email"].strip().lower()


class UserEditForm(UserChangeForm):
    phone = phone_form_field()
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"

    clean_phone = _clean_phone

    def clean_email(self):
        email = self.cleaned_data.get("email")
        return email.strip().lower() if email else None


class EmailAdminAuthenticationForm(AdminAuthenticationForm):
    username = forms.EmailField(label="Электронная почта", widget=forms.EmailInput(attrs={"autofocus": True}))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # AuthenticationForm берёт maxlength из USERNAME_FIELD (телефон, 11 символов).
        self.username_field = User._meta.get_field("email")
        self.fields["username"].max_length = 254
        self.fields["username"].widget.attrs["maxlength"] = 254


admin.site.login_form = EmailAdminAuthenticationForm


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserEditForm
    add_form = UserAddForm
    ordering = ["-date_joined"]
    list_display = ["email", "phone", "full_name", "balance_display", "activity", "status", "is_hidden", "is_staff", "date_joined"]
    list_filter = ["is_staff", "is_hidden", "status", "activity"]
    search_fields = ["email", "phone", "full_name", "occupation"]
    filter_horizontal = ["hobbies", "groups", "user_permissions"]
    readonly_fields = ["balance_display", "balance_history"]
    fieldsets = [
        (None, {"fields": ["email", "phone", "password"]}),
        ("Клубный счёт", {"fields": ["balance_display", "balance_history"]}),
        ("Анкета", {"fields": [
            "full_name", "photo", "activity", "occupation", "hobbies",
            "about", "can_help", "looking_for", "telegram", "show_phone", "consent_at",
        ]}),
        ("Статус", {"fields": ["status", "status_text", "is_hidden"]}),
        ("Доступ", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["email", "phone", "password1", "password2", "is_staff"]})]


    def get_queryset(self, request):
        # Подзапрос не умножает сумму при фильтрации или поиске по связанным полям.
        return super().get_queryset(request).annotate(club_balance=balance_expression())

    @admin.display(description="Баланс, ₽", ordering="club_balance")
    def balance_display(self, obj):
        return f"{obj.club_balance:,.2f}".replace(",", " ").replace(".", ",") + " ₽"

    @admin.display(description="История счёта")
    def balance_history(self, obj):
        url = reverse("admin:members_topup_changelist") + f"?member__id__exact={obj.pk}"
        return format_html('<a href="{}">Посмотреть пополнения пользователя</a>', url)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ["name", "order"]
    list_editable = ["order"]


@admin.register(Hobby)
class HobbyAdmin(admin.ModelAdmin):
    search_fields = ["name"]


from .models import ClubPost, Event, MeetingProposal, OnlinePayment, PartnerCode, Recording, ResidentBooking, TopUp

class EventForm(forms.ModelForm):
    weekly_count = forms.IntegerField(label="Число еженедельных встреч, включая первую", initial=1, min_value=1,
                                      max_value=12, required=False)

    class Meta:
        model = Event
        fields = "__all__"

    def clean(self):
        data = super().clean()
        event = self.instance
        if not event.pk:
            return data
        if hasattr(event, "organizerreward") and ("organizer" in self.changed_data or "starts_at" in self.changed_data):
            raise ValidationError("У организатора уже отмечен приход на эту встречу.")
        quotas = [(event.resident_bookings.filter(guest=False), "resident_seats"),
                  (event.resident_bookings.filter(guest=True), "guest_seats"), (event.guest_bookings, "invite_seats")]
        for bookings, field in quotas:
            if field in self.changed_data and (data.get(field) or 0) < bookings.filter(cancelled_at__isnull=True).count():
                self.add_error(field, "Уже забронировано больше мест.")
        return data


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "starts_at", "location", "is_published"]
    list_filter = ["is_published"]
    form = EventForm

    def get_exclude(self, request, obj=None):
        return ["weekly_count"] if obj else []

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            fields = {f.attname: getattr(obj, f.attname) for f in obj._meta.fields
                      if not f.primary_key and f.name not in ("starts_at", "cancelled_at")}
            Event.objects.bulk_create([Event(**fields, starts_at=obj.starts_at + timedelta(weeks=i))
                                       for i in range(1, form.cleaned_data.get("weekly_count") or 1)])
    actions = ["cancel_events"]
    readonly_fields = ["cancelled_at"]

    @admin.action(description="Отменить до начала и вернуть токены и пригласительные", permissions=["change"])
    @transaction.atomic
    def cancel_events(self, request, queryset):
        count = 0
        review = []
        now = timezone.now()
        for event in queryset.select_for_update().filter(starts_at__gt=now, cancelled_at__isnull=True).order_by("pk"):
            if event.resident_bookings.filter(guest=True, visit__entrypayment__membershipsale__isnull=False).exists():
                review.append(event.title)
                continue
            event.resident_bookings.filter(cancelled_at__isnull=True).update(cancelled_at=now, refunded=True)
            event.guest_bookings.filter(cancelled_at__isnull=True).update(cancelled_at=now, refunded=True)
            event.cancelled_at, event.is_published = now, False
            event.save(update_fields=["cancelled_at", "is_published"])
            count += 1
        if review:
            self.message_user(request, "Нужна сверка на кассе: гостевой вход уже зачтён при покупке карты. " + ", ".join(review))
        self.message_user(request, f"Отменено встреч: {count}. Начавшиеся встречи пропущены.")


@admin.register(MeetingProposal)
class MeetingProposalAdmin(admin.ModelAdmin):
    list_display = ["title", "stage", "interest_count", "event", "created_at"]
    readonly_fields = ["author", "title", "description", "contact", "interest_count", "created_at"]
    exclude = ["interested"]
    list_filter = ["stage"]

    @admin.display(description="Пойдут")
    def interest_count(self, obj):
        return obj.interested.count() if obj and obj.pk else 0

    def has_add_permission(self, request):
        return False


@admin.register(TopUp)
class TopUpAdmin(admin.ModelAdmin):
    list_display = ["member", "amount", "created_by", "created_at"]
    search_fields = ["member__full_name", "member__phone"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ResidentBooking)
class ResidentBookingAdmin(admin.ModelAdmin):
    list_display = ["event", "member", "price", "created_at", "cancelled_at", "refunded"]
    list_select_related = ["event", "member"]
    search_fields = ["event__title", "member__phone", "member__full_name"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Recording)
class RecordingAdmin(admin.ModelAdmin):
    list_display = ["title", "price", "published"]


@admin.register(ClubPost)
class ClubPostAdmin(admin.ModelAdmin):
    list_display = ["author", "kind", "created_at", "visible"]
    readonly_fields = ["author", "kind", "text", "created_at"]
    list_filter = ["kind", "visible"]

    def has_add_permission(self, request):
        return False


@admin.register(PartnerCode)
class PartnerCodeAdmin(admin.ModelAdmin):
    list_display = ["code", "event", "limit", "enabled", "used"]
    search_fields = ["code", "event__title"]

    @admin.display(description="Броней по коду")
    def used(self, obj):
        return obj.residentbooking_set.filter(cancelled_at__isnull=True).count()


@admin.register(OnlinePayment)
class OnlinePaymentAdmin(admin.ModelAdmin):
    list_display = ["order_id", "member", "amount", "status", "confirmed_at", "needs_review"]
    list_filter = ["status", "needs_review"]
    search_fields = ["order_id", "payment_id", "member__phone"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


from .models import ShelfBallot, ShelfItem
admin.site.register(ShelfItem)
admin.site.register(ShelfBallot)

from .models import ShopOrder, ShopProduct
admin.site.register(ShopProduct)


@admin.register(ShopOrder)
class ShopOrderAdmin(admin.ModelAdmin):
    list_display = ["title", "member", "price", "status"]
    readonly_fields = ["title", "member", "price", "product", "reference", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
