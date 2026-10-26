from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from members.serializers import MemberShortSerializer
from members.views import catalog_queryset

from .models import Conversation, Message

MAX_TEXT = 4000
HISTORY = 300


def _message_data(m, me):
    return {"id": m.id, "text": m.text, "created_at": m.created_at, "mine": m.sender_id == me.pk,
            "read": m.read_at is not None}


def _require_member(user):
    # Писать могут только члены клуба: портал открыт всем, а общение — для своих.
    if not user.is_member:
        return Response({"detail": "Писать участникам могут члены клуба с клубной картой"}, status=403)
    return None


class ConversationListView(APIView):
    def get(self, request):
        me = request.user
        convs = (
            Conversation.of(me)
            .filter(Exists(Message.objects.filter(conversation=OuterRef("pk"))))
            .select_related("user_a__activity", "user_b__activity")
            .prefetch_related("user_a__hobbies", "user_b__hobbies")
            .annotate(unread=Count("messages", filter=Q(messages__read_at__isnull=True) & ~Q(messages__sender=me)))
            .order_by("-updated_at")
        )
        data = []
        for c in convs:
            last = c.messages.order_by("-created_at").first()
            data.append({
                "id": c.id,
                "other": MemberShortSerializer(c.other(me)).data,
                "last": _message_data(last, me) if last else None,
                "unread": c.unread,
            })
        return Response(data)

    def post(self, request):
        """Открыть переписку с участником (или вернуть уже существующую)."""
        if denied := _require_member(request.user):
            return denied
        other = get_object_or_404(catalog_queryset(), pk=request.data.get("member"))
        if other.pk == request.user.pk:
            return Response({"detail": "Нельзя написать самому себе"}, status=400)
        return Response({"id": Conversation.between(request.user, other).id})


class ConversationView(APIView):
    def get(self, request, pk):
        me = request.user
        conv = get_object_or_404(Conversation.of(me), pk=pk)
        # открыл переписку — входящие прочитаны
        conv.messages.filter(read_at__isnull=True).exclude(sender=me).update(read_at=timezone.now())
        messages = list(conv.messages.order_by("-created_at")[:HISTORY])[::-1]
        return Response({
            "id": conv.id,
            "other": MemberShortSerializer(conv.other(me)).data,
            "messages": [_message_data(m, me) for m in messages],
        })


class MessageCreateView(APIView):
    def post(self, request, pk):
        me = request.user
        if denied := _require_member(me):
            return denied
        conv = get_object_or_404(Conversation.of(me), pk=pk)
        text = str(request.data.get("text", "")).strip()
        if not text:
            return Response({"detail": "Пустое сообщение"}, status=400)
        if len(text) > MAX_TEXT:
            return Response({"detail": f"Сообщение длиннее {MAX_TEXT} символов"}, status=400)
        msg = Message.objects.create(conversation=conv, sender=me, text=text)
        Conversation.objects.filter(pk=conv.pk).update(updated_at=msg.created_at)
        return Response(_message_data(msg, me), status=201)
