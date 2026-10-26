from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.core.exceptions import ValidationError

from .models import Activity, Hobby, User
from .phone import normalize_phone


def _clean_phone(form):
    try:
        return normalize_phone(form.cleaned_data["phone"])
    except ValueError as e:
        raise ValidationError(str(e)) from e


class UserAddForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ["phone"]

    clean_phone = _clean_phone


class UserEditForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"

    clean_phone = _clean_phone


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserEditForm
    add_form = UserAddForm
    ordering = ["-date_joined"]
    list_display = ["phone", "full_name", "activity", "status", "is_hidden", "is_staff", "date_joined"]
    list_filter = ["is_staff", "is_hidden", "status", "activity"]
    search_fields = ["phone", "full_name", "occupation"]
    filter_horizontal = ["hobbies", "groups", "user_permissions"]
    fieldsets = [
        (None, {"fields": ["phone", "password"]}),
        ("Анкета", {"fields": [
            "full_name", "photo", "activity", "occupation", "hobbies",
            "about", "can_help", "looking_for", "telegram", "show_phone", "consent_at",
        ]}),
        ("Статус", {"fields": ["status", "status_text", "is_hidden"]}),
        ("Доступ", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["phone", "password1", "password2", "is_staff"]})]


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ["name", "order"]
    list_editable = ["order"]


@admin.register(Hobby)
class HobbyAdmin(admin.ModelAdmin):
    search_fields = ["name"]
