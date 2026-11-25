from collections import Counter
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .community import IsResident
from .models import ShelfBallot, ShelfChoice, ShelfItem


class WishInput(serializers.ModelSerializer):
    class Meta:
        model = ShelfItem
        fields = ["kind", "title", "by"]


class Shelves(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        resident = user.is_authenticated and user.is_member and not user.is_staff
        items, wishes, evenings = [], [], []
        for item in ShelfItem.objects.select_related("suggested_by").prefetch_related("supporters").order_by("title"):
            row = {"id": str(item.pk), "title": item.title, "by": item.by, "kind": item.kind}
            if item.in_collection:
                items.append(row)
            if item.suggested_by_id:
                supporters = list(item.supporters.all())
                wishes.append({**row, "status": "bought" if item.in_collection else "open",
                               "wants": len(supporters), "mine": user in supporters,
                               "names": [], "by_name": item.suggested_by.full_name if resident else "Резидент"})
        now = timezone.now()
        ballots = ShelfBallot.objects.filter(event__is_published=True, event__cancelled_at__isnull=True,
                                             event__starts_at__gt=now).select_related("event").prefetch_related("shelfchoice_set")
        for ballot in ballots.order_by("event__starts_at"):
            choices = list(ballot.shelfchoice_set.all())
            counts = Counter(str(c.item_id) for c in choices)
            evenings.append({"id": str(ballot.event_id), "kind": ballot.kind, "title": ballot.event.title,
                             "start": timezone.localtime(ballot.event.starts_at).isoformat(),
                             "open": ballot.event.starts_at > now + timedelta(hours=48),
                             "counts": counts, "total": len(choices), "lead": max(counts, key=counts.get, default=None),
                             "mine": next((str(c.item_id) for c in choices if c.member_id == user.pk), None)})
        return Response({"items": items, "wishes": wishes, "evenings": evenings, "goal": 10,
                         "can_pick": resident, "can_wish": resident, "admin": user.has_perm("members.change_shelfitem")})


class ShelfPick(APIView):
    permission_classes = [IsResident]

    @transaction.atomic
    def post(self, request):
        class Input(serializers.Serializer):
            event = serializers.IntegerField(min_value=1)
            item = serializers.IntegerField(min_value=1)
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        ballot = get_object_or_404(ShelfBallot.objects.select_for_update().select_related("event"),
                                  event_id=data.validated_data["event"], event__is_published=True, event__cancelled_at__isnull=True)
        if ballot.event.starts_at <= timezone.now() + timedelta(hours=48):
            return Response({"detail": "Голосование закрыто."}, status=409)
        item = get_object_or_404(ShelfItem, pk=data.validated_data["item"], kind=ballot.kind, in_collection=True)
        _, created = ShelfChoice.objects.update_or_create(ballot=ballot, member=request.user, defaults={"item": item})
        return Response({"title": item.title, "changed": not created})


class ShelfWish(APIView):
    permission_classes = [IsResident]

    @transaction.atomic
    def post(self, request, pk=None):
        if pk is None:
            data = WishInput(data=request.data)
            data.is_valid(raise_exception=True)
            item = data.save(suggested_by=request.user, in_collection=False)
            item.supporters.add(request.user)
            return Response({"id": item.pk}, status=201)
        item = get_object_or_404(ShelfItem.objects.select_for_update(), pk=pk, in_collection=False)
        mine = not item.supporters.filter(pk=request.user.pk).exists()
        if mine:
            item.supporters.add(request.user)
        else:
            item.supporters.remove(request.user)
        return Response({"mine": mine})


class AcquireWish(APIView):
    @transaction.atomic
    def post(self, request, pk):
        if not request.user.has_perm("members.change_shelfitem"):
            return Response(status=403)
        item = get_object_or_404(ShelfItem.objects.select_for_update(), pk=pk, suggested_by__isnull=False)
        item.in_collection = True
        item.save(update_fields=["in_collection"])
        return Response({"text": f"«{item.title}» в коллекции клуба."})
