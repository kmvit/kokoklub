from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClubPost, PollVote, Recording, RecordingPurchase, User, account_balance
from .permissions import IsClubUser


class IsResident(IsClubUser):
    message = "Раздел доступен резидентам клуба."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_member


class PostInput(serializers.ModelSerializer):
    class Meta:
        model = ClubPost
        fields = ["kind", "text"]


class FeedView(APIView):
    permission_classes = [IsResident]

    def get(self, request):
        posts = list(ClubPost.objects.filter(visible=True, author__is_hidden=False, author__is_active=True)
                     .select_related("author").annotate(yes=Count("votes", filter=Q(votes__support=True)),
                                                        no=Count("votes", filter=Q(votes__support=False)))
                     .order_by("-created_at", "-id")[:100])
        votes = dict(PollVote.objects.filter(member=request.user, post__in=posts).values_list("post_id", "support"))
        return Response([{"id": p.pk, "kind": p.kind, "text": p.text, "author": p.author.full_name,
                          "author_id": p.author_id, "created_at": p.created_at, "yes": p.yes, "no": p.no,
                          "vote": votes.get(p.pk)} for p in posts])

    def post(self, request):
        data = PostInput(data=request.data)
        data.is_valid(raise_exception=True)
        data.save(author=request.user)
        return Response(status=201)


class PollView(APIView):
    permission_classes = [IsResident]

    @transaction.atomic
    def post(self, request, pk):
        post = get_object_or_404(ClubPost.objects.select_for_update(), pk=pk, kind="poll", visible=True,
                                 author__is_hidden=False, author__is_active=True)
        support = request.data.get("support")
        if not isinstance(support, bool):
            return Response({"detail": "Выберите ответ."}, status=400)
        PollVote.objects.update_or_create(post=post, member=request.user, defaults={"support": support})
        return Response(status=204)


class LibraryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        owned = set(request.user.recording_purchases.values_list("recording_id", flat=True)) if request.user.is_authenticated else set()
        resident = request.user.is_authenticated and request.user.is_member
        return Response([{"id": r.pk, "title": r.title, "price": r.price,
                          "url": r.url if resident or r.pk in owned else None}
                         for r in Recording.objects.filter(published=True).order_by("-pk")])


class PurchaseRecording(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        member = User.objects.select_for_update().get(pk=request.user.pk)
        recording = get_object_or_404(Recording.objects.select_for_update(), pk=pk, published=True)
        if member.is_member or member.recording_purchases.filter(recording=recording).exists():
            return Response({"url": recording.url})
        if recording.price != request.data.get("price"):
            return Response({"detail": "Цена изменилась. Обновите список записей."}, status=409)
        if account_balance(member) < recording.price:
            return Response({"detail": "Недостаточно токенов для покупки."}, status=409)
        RecordingPurchase.objects.create(member=member, recording=recording, price=recording.price)
        return Response({"url": recording.url}, status=201)
