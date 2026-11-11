from django.contrib import admin
from django import forms
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.core.exceptions import ValidationError
from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.urls import reverse
from django.utils.html import format_html
from decimal import Decimal

from .models import Activity, Hobby, User, TopUp
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
        totals = TopUp.objects.filter(member=OuterRef("pk")).order_by().values("member").annotate(total=Sum("amount")).values("total")
        return super().get_queryset(request).annotate(
            club_balance=Coalesce(Subquery(totals), Value(Decimal("0.00")), output_field=DecimalField(max_digits=20, decimal_places=2)),
        )

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


from .models import Event, TopUp

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "starts_at", "location", "is_published"]
    list_filter = ["is_published"]


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
