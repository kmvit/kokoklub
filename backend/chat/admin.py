from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    raw_id_fields = ["sender"]


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["user_a", "user_b", "updated_at"]
    raw_id_fields = ["user_a", "user_b"]
    inlines = [MessageInline]
