from django.contrib import admin

from .models import Card, FoodRedemption, GuestBooking, MembershipSale, OrganizerReward, Visit, VisitPack


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


@admin.register(GuestBooking)
class GuestBookingAdmin(admin.ModelAdmin):
    list_display = ["event", "resident", "created_at", "arrived_at", "checked_in_by", "cancelled_at", "refunded"]
    list_select_related = ["event", "sale__member", "checked_in_by"]
    search_fields = ["event__title", "sale__member__phone", "sale__member__full_name"]

    @admin.display(description="Пригласил")
    def resident(self, booking):
        return booking.sale.member

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(VisitPack)
class VisitPackAdmin(admin.ModelAdmin):
    list_display = ["title", "visits", "price", "available"]


class AuditAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MembershipSale)
class MembershipSaleAdmin(AuditAdmin):
    list_display = ["member", "tariff", "paid", "entry_payment", "starts_at", "ends_at", "cashier"]
    list_filter = ["tariff"]
    search_fields = ["member__full_name", "member__phone"]


@admin.register(OrganizerReward)
class OrganizerRewardAdmin(AuditAdmin):
    list_display = ["event", "organizer", "completed_at", "invite_used_at", "extra_visit"]
    search_fields = ["event__title", "organizer__phone"]


@admin.register(FoodRedemption)
class FoodRedemptionAdmin(AuditAdmin):
    list_display = ["reward", "amount", "cashier", "created_at", "reference"]
    search_fields = ["reward__event__title", "reward__organizer__phone"]
