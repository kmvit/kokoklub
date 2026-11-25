from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Event, MeetingProposal, PartnerCode
from .permissions import IsClubUser


def cancel_event(event, now):
    if event.cancelled_at:
        return
    if event.starts_at <= now:
        raise serializers.ValidationError("Встреча уже началась.")
    if event.resident_bookings.filter(guest=True, visit__entrypayment__membershipsale__isnull=False).exists():
        raise serializers.ValidationError("Вход зачтён в карту. Нужна сверка на кассе.")
    for bookings in (event.resident_bookings, event.guest_bookings):
        bookings.filter(cancelled_at__isnull=True).update(cancelled_at=now, refunded=True)
    event.cancelled_at, event.is_published = now, False
    event.save(update_fields=["cancelled_at", "is_published"])


class ScheduleInput(serializers.ModelSerializer):
    weekly_count = serializers.IntegerField(min_value=1, max_value=12, default=1, write_only=True)

    class Meta:
        model = Event
        fields = ["id", "title", "description", "starts_at", "location", "organizer", "resident_price",
                  "resident_seats", "invite_seats", "guest_seats", "guest_extra", "accepts_pack", "weekly_count"]

    def validate(self, attrs):
        event = self.instance
        if attrs.get("starts_at", timezone.now() + timedelta(days=1)) <= timezone.now():
            raise serializers.ValidationError("Выберите будущее время.")
        if event:
            if event.cancelled_at or event.starts_at <= timezone.now():
                raise serializers.ValidationError("Можно изменить только предстоящую встречу.")
            for field, bookings in [("resident_seats", event.resident_bookings.filter(guest=False)),
                                    ("guest_seats", event.resident_bookings.filter(guest=True)),
                                    ("invite_seats", event.guest_bookings)]:
                if field in attrs and attrs[field] < bookings.filter(cancelled_at__isnull=True).count():
                    raise serializers.ValidationError({field: "Уже забронировано больше мест."})
            if hasattr(event, "organizerreward") and any(getattr(event, k) != attrs[k] for k in ("starts_at", "organizer") if k in attrs):
                raise serializers.ValidationError("Приход организатора уже отмечен.")
        return attrs


class Schedule(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk=None):
        if pk:
            return Response(ScheduleInput(get_object_or_404(Event,pk=pk)).data)
        return Response({"events": ScheduleInput(Event.objects.filter(cancelled_at__isnull=True, starts_at__gt=timezone.now()), many=True).data,
                         "proposals": list(MeetingProposal.objects.values("id", "title", "description", "contact", "stage", "review", "event_id"))
                         if request.user.has_perm("members.change_meetingproposal") else [],
                         "issue_codes": request.user.has_perm("members.add_partnercode"),
                         "create": request.user.has_perm("members.add_event"), "change": request.user.has_perm("members.change_event")})

    @transaction.atomic
    def post(self, request, pk=None):
        if not request.user.has_perm("members.change_event" if pk else "members.add_event"):
            raise PermissionDenied()
        event = get_object_or_404(Event.objects.select_for_update(), pk=pk) if pk else None
        if event and request.data.get("action") == "cancel":
            cancel_event(event, timezone.now())
            return Response(status=204)
        data = ScheduleInput(event, data=request.data, partial=bool(event))
        data.is_valid(raise_exception=True)
        repeat = data.validated_data.pop("weekly_count", 1)
        event = data.save(is_published=True)
        if not pk:
            for i in range(1, repeat):
                Event.objects.create(**{**data.validated_data, "starts_at": event.starts_at + timedelta(weeks=i)}, is_published=True)
        return Response(ScheduleInput(event).data)


class ReviewProposal(APIView):
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request, pk):
        if not request.user.has_perm("members.change_meetingproposal"):
            raise PermissionDenied()
        proposal = get_object_or_404(MeetingProposal.objects.select_for_update(), pk=pk)
        class Review(serializers.ModelSerializer):
            class Meta:
                model = MeetingProposal
                fields = ["stage", "review", "event"]
        data = Review(proposal, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(data.data)


class Organizing(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        events = Event.objects.filter(organizer=request.user, is_published=True, cancelled_at__isnull=True)
        codes = PartnerCode.objects.filter(event__in=events).annotate(
            used=Count("residentbooking", filter=Q(residentbooking__cancelled_at__isnull=True)))
        return Response([{"id": e.pk, "title": e.title, "starts_at": e.starts_at,
                          "codes": [{"code": c.code, "limit": c.limit, "used": c.used, "enabled": c.enabled}
                                    for c in codes if c.event_id == e.pk]} for e in events])


class EventCode(APIView):
    permission_classes = [AllowAny]

    def get(self, request, code):
        item = get_object_or_404(PartnerCode.objects.select_related("event"), code=code, enabled=True,
            event__organizer__isnull=False, event__starts_at__gt=timezone.now(),event__is_published=True,event__cancelled_at__isnull=True)
        return Response({"event":item.event_id, "title":item.event.title, "starts_at":item.event.starts_at,
                         "price":(500 if timezone.localtime(item.event.starts_at).hour < 13 else 750) + item.event.guest_extra,
                         "left":max(0,item.limit-item.residentbooking_set.filter(cancelled_at__isnull=True).count())})


class IssueCode(APIView):
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request, pk):
        if not request.user.has_perm("members.add_partnercode"):
            raise PermissionDenied()
        event = get_object_or_404(Event.objects.select_for_update(),pk=pk,organizer__isnull=False,
            is_published=True,cancelled_at__isnull=True,starts_at__gt=timezone.now())
        class Input(serializers.ModelSerializer):
            limit = serializers.IntegerField(min_value=1)
            code = serializers.SlugField(max_length=50)
            class Meta:
                model = PartnerCode
                fields = ["code","limit"]
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        code, _ = PartnerCode.objects.get_or_create(code=data.validated_data["code"],defaults={"event":event,"limit":data.validated_data["limit"]})
        if code.event_id != event.pk or code.limit != data.validated_data["limit"]:
            return Response({"detail":"Этот код уже занят."},status=409)
        return Response({"code":code.code})
