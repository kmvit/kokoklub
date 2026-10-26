from django.contrib import admin

from .models import Card, Visit


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ["uid", "member", "is_active", "issued_at", "revoked_at"]
    list_filter = ["is_active"]
    search_fields = ["uid", "member__full_name", "member__phone"]
    raw_id_fields = ["member", "issued_by"]


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ["member", "entered_at", "left_at"]
    date_hierarchy = "entered_at"
    search_fields = ["member__full_name", "member__phone"]
    raw_id_fields = ["member", "card"]
