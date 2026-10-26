"""Кабинет персонала: анкеты гостей, выдача карт, вход по карте, кто в клубе."""
import logging

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import User
from members.phone import normalize_phone
from members.serializers import MemberShortSerializer, photo_url

from .models import Card, Visit, normalize_uid
from .queries import open_visits, with_club_flags

logger = logging.getLogger(__name__)


class StaffMemberSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()
    activity = serializers.CharField(source="activity.name", default=None, read_only=True)
    card = serializers.SerializerMethodField()
    in_club = serializers.BooleanField(read_only=True)
    profile_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "phone", "full_name", "photo", "activity", "occupation",
            "profile_complete", "is_hidden", "card", "in_club", "date_joined",
        ]

    def get_photo(self, obj):
        return photo_url(obj)

    def get_card(self, obj):
        card = next((c for c in obj.cards.all() if c.is_active), None)
        return {"uid": card.uid, "issued_at": card.issued_at} if card else None


def staff_members():
    qs = User.objects.select_related("activity").prefetch_related("cards")
    return with_club_flags(qs)


def _member_data(member_id):
    return StaffMemberSerializer(staff_members().get(pk=member_id)).data


class StaffMembersView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        # учётки персонала — не гости, в списке выдачи карт им не место
        qs = staff_members().filter(is_staff=False)
        q = request.query_params.get("q", "").strip()
        if q:
            digits = "".join(ch for ch in q if ch.isdigit())
            cond = Q(full_name__icontains=q)
            if len(digits) >= 3:
                # ищем по хвосту номера: «4567» найдёт +7 900 123-45-67
                cond |= Q(phone__contains=digits[-10:])
            qs = qs.filter(cond)
        return Response(StaffMemberSerializer(qs.order_by("-date_joined")[:50], many=True).data)

    def post(self, request):
        """Анкета за гостя без смартфона: бариста вводит телефон и имя сам."""
        try:
            phone = normalize_phone(request.data.get("phone", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        full_name = " ".join(str(request.data.get("full_name", "")).split())
        if not full_name:
            return Response({"detail": "Укажите имя"}, status=400)
        if not request.data.get("consent"):
            return Response({"detail": "Нужно согласие гостя на обработку персональных данных"}, status=400)
        if User.objects.filter(phone=phone).exists():
            return Response({"detail": "Гость с таким телефоном уже есть — найдите его поиском"}, status=409)
        user = User.objects.create_user(phone, full_name=full_name, consent_at=timezone.now())
        return Response(_member_data(user.pk), status=201)


class StaffMemberView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        """Модерация: скрыть из каталога или вернуть."""
        member = get_object_or_404(User, pk=pk)
        if "is_hidden" in request.data:
            member.is_hidden = bool(request.data["is_hidden"])
            member.save(update_fields=["is_hidden"])
        return Response(_member_data(member.pk))


class MemberCardView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        """Привязать карту. Прежняя карта участника (потерял) отвязывается."""
        member = get_object_or_404(User, pk=pk)
        try:
            uid = normalize_uid(request.data.get("uid", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

        owner = Card.objects.filter(uid=uid, is_active=True).select_related("member").first()
        if owner and owner.member_id == member.pk:
            return Response(_member_data(member.pk))
        if owner:
            return Response(
                {"detail": f"Эта карта уже у участника {owner.member} — сначала отвяжите её там"},
                status=409,
            )
        try:
            with transaction.atomic():
                Card.objects.filter(member=member, is_active=True).update(
                    is_active=False, revoked_at=timezone.now(),
                )
                Card.objects.create(uid=uid, member=member, issued_by=request.user)
        except IntegrityError:
            # одновременно ту же карту привязали на другом планшете
            return Response({"detail": "Карта только что привязана к другому участнику"}, status=409)
        logger.info("Карта %s выдана участнику %s (выдал %s)", uid, member.pk, request.user.pk)
        return Response(_member_data(member.pk))

    def delete(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        Card.objects.filter(member=member, is_active=True).update(is_active=False, revoked_at=timezone.now())
        return Response(_member_data(member.pk))


def _visit_data(visit):
    return {
        "id": visit.id,
        "entered_at": visit.entered_at,
        "member": MemberShortSerializer(visit.member).data | {"phone": visit.member.phone},
    }


class ScanView(APIView):
    """Карту приложили к ридеру у входа: вошёл, а если уже внутри — вышел."""

    permission_classes = [IsAdminUser]

    def post(self, request):
        try:
            uid = normalize_uid(request.data.get("uid", ""))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        card = Card.objects.filter(uid=uid, is_active=True).select_related("member").first()
        if not card:
            return Response({"detail": "Карта не привязана ни к одному участнику", "uid": uid}, status=404)

        member = card.member
        with transaction.atomic():
            visit = open_visits().select_for_update().filter(member=member).first()
            if visit:
                visit.left_at = timezone.now()
                visit.save(update_fields=["left_at"])
                action = "exit"
            else:
                visit = Visit.objects.create(member=member, card=card)
                action = "enter"
        return Response({"action": action, **_visit_data(visit)})


class InsideView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        visits = (
            open_visits()
            .select_related("member__activity")
            .prefetch_related("member__hobbies")
            .order_by("-entered_at")
        )
        data = []
        for v in visits:
            v.member.in_club = True
            data.append(_visit_data(v))
        return Response(data)


class LeaveView(APIView):
    """Отметить выход вручную — гость ушёл, не приложив карту."""

    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        visit = get_object_or_404(open_visits(), pk=pk)
        visit.left_at = timezone.now()
        visit.save(update_fields=["left_at"])
        return Response({"ok": True})
