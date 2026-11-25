from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsClubUser
from .models import Event, PartnerCode, ResidentBooking, User, account_balance


def active_sale(member):
    return member.membership_sales.filter(starts_at__lte=timezone.now(), ends_at__gt=timezone.now()).order_by("-ends_at").first()


def reservations(member):
    sale = active_sale(member)
    places = member.resident_bookings.filter(cancelled_at__isnull=True, event__starts_at__gt=timezone.now())
    guests = sale.guest_bookings.filter(cancelled_at__isnull=True, event__starts_at__gt=timezone.now()) if sale else None
    return {"invites": sale.invites_left if sale else 0,
            "guest_events": list(guests.values_list("event_id", flat=True)) if sale else [],
            "visits": sale.visits_left if sale else 0, "balance": format(account_balance(member), ".2f"), "places": list(places.values("id", "event_id", "event__title", "event__starts_at", "price", "visit_id", "guest", "package_sale_id"))}


class MyReservations(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        return Response(reservations(request.user))


class ReservePlace(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        member = User.objects.select_for_update().get(pk=request.user.pk)
        event = get_object_or_404(Event.objects.select_for_update(), pk=pk, is_published=True, cancelled_at__isnull=True)
        active = event.resident_bookings.filter(cancelled_at__isnull=True)
        if active.filter(member=member).exists():
            return Response(reservations(member))
        if event.starts_at <= timezone.now():
            return Response({"detail": "Встреча уже началась."}, status=409)
        guest = not member.is_member
        code = None
        entry = 0
        if guest:
            if member.is_staff or not event.guest_seats:
                return Response({"detail": "Гостевая запись закрыта."}, status=403)
            raw_code = request.data.get("code", "")
            if raw_code:
                code = get_object_or_404(PartnerCode.objects.select_for_update(), event=event, code=raw_code, enabled=True)
                if event.organizer_id is None or code.residentbooking_set.filter(cancelled_at__isnull=True).count() >= code.limit:
                    return Response({"detail": "Места по этому промокоду закончились."}, status=409)
            entry = (500 if timezone.localtime(event.starts_at).hour < 13 else 750) if code else 1000
            price, capacity = entry + event.guest_extra, event.guest_seats
        else:
            if member.membership_sales.exists() and not member.membership_sales.filter(ends_at__gt=event.starts_at).exists():
                return Response({"detail": "Нужна клубная карта, действующая на начало встречи."}, status=403)
            price, capacity = event.resident_price, event.resident_seats
        if active.filter(guest=guest).count() >= capacity or price is None:
            return Response({"detail": "Свободных мест для бронирования нет."}, status=409)
        package_sale = None
        if request.data.get("use_pack"):
            package_sale = active_sale(member)
            if guest or not event.accepts_pack or not package_sale or package_sale.visits_left <= 0:
                return Response({"detail": "Оплата визитом недоступна."}, status=409)
            price = 0
        if request.data.get("price") != price:
            return Response({"detail": "Цена изменилась. Обновите афишу."}, status=409)
        if account_balance(member) < price:
            return Response({"detail": "На счёте недостаточно токенов."}, status=409)
        ResidentBooking.objects.create(member=member, event=event, price=price, guest=guest, guest_entry=entry, partner_code=code, package_sale=package_sale)
        if request.data.get("plus_guest") is True:
            from club.invitations import reserve_guest
            reserve_guest(member, event, request.data.get("guest_payment", "invite"), request.data.get("guest_price"))
        return Response(reservations(member), status=201)


class CancelReservation(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        member = User.objects.select_for_update().get(pk=request.user.pk)
        booking = get_object_or_404(ResidentBooking.objects.select_for_update().select_related("event"), pk=pk, member=member)
        if booking.visit_id:
            return Response({"detail": "Приход уже отмечен."}, status=409)
        if booking.cancelled_at is None:
            now = timezone.now()
            if now >= booking.event.starts_at:
                return Response({"detail": "Встреча уже началась."}, status=409)
            booking.cancelled_at = now
            booking.refunded = not booking.guest and booking.event.starts_at - now > timedelta(hours=24)
            booking.save(update_fields=["cancelled_at", "refunded"])
        return Response(reservations(member))
