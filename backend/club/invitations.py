from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from members.permissions import IsClubUser
from members.models import Event, User, account_balance
from .models import GuestBooking, MembershipSale


def invitation_status(member):
    now = timezone.now()
    sale = member.membership_sales.filter(starts_at__lte=now, ends_at__gt=now).order_by("-ends_at").first()
    bookings = GuestBooking.objects.filter(
        sale__member=member, event__starts_at__gt=now, cancelled_at__isnull=True,
    ).values("id", "event_id", "arrived_at", "payment", "price")
    return {
        "tariff": sale.get_tariff_display() if sale else None,
        "pack_visits": sale.visits_left if sale else 0,
        "left": sale.invites_left if sale else 0,
        "expires": sale.ends_at if sale else None,
        "bookings": list(bookings),
    }


class InvitationView(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        return Response(invitation_status(request.user))


class BookingConflict(APIException):
    status_code = 409


def reserve_guest(member, event, payment, price):
    # Вызывающий обработчик держит блокировки участника и события.
    now = timezone.now()
    if event.starts_at <= now:
        raise BookingConflict("Событие уже началось.")
    sale = MembershipSale.objects.select_for_update().filter(
        member=member, starts_at__lte=now, ends_at__gt=event.starts_at,
    ).order_by("-ends_at").first()
    if not sale:
        raise PermissionDenied("Нужна карта, действующая в день встречи.")
    places = event.guest_bookings.filter(cancelled_at__isnull=True)
    if places.filter(sale=sale).exists():
        return False
    if places.count() >= event.invite_seats:
        raise BookingConflict("Места по пригласительным закончились.")
    if payment == "invite":
        if not sale.invites_left:
            raise BookingConflict("Пригласительные закончились.")
    elif payment == "pack":
        if not event.accepts_pack or sale.visits_left <= 0:
            raise BookingConflict("Недостаточно пакетных визитов.")
    elif payment == "tokens":
        if event.resident_price is None or price != event.resident_price:
            raise BookingConflict("Проверьте цену дополнительного пригласительного.")
        if account_balance(member) < price:
            raise BookingConflict("На счёте недостаточно токенов.")
    else:
        raise BookingConflict("Выберите способ оплаты гостевого места.")
    GuestBooking.objects.create(sale=sale, event=event, payment=payment, price=price if payment == "tokens" else 0)
    return True


class GuestPlaceView(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        member = User.objects.select_for_update().get(pk=request.user.pk)
        event = get_object_or_404(Event.objects.select_for_update(), pk=pk, is_published=True, cancelled_at__isnull=True)
        created = reserve_guest(member, event, request.data.get("payment", "invite"), request.data.get("price"))
        return Response(invitation_status(member), status=201 if created else 200)


class CancelGuestPlaceView(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        booking = get_object_or_404(
            GuestBooking.objects.select_for_update().select_related("event"), pk=pk, sale__member=request.user,
        )
        if booking.arrived_at is not None:
            return Response({"detail": "Гость уже прошёл по этой брони."}, status=409)
        if booking.cancelled_at is None:
            now = timezone.now()
            if now >= booking.event.starts_at:
                return Response({"detail": "Событие уже началось."}, status=409)
            booking.cancelled_at = now
            booking.refunded = booking.event.starts_at - now > timedelta(hours=24)
            booking.save(update_fields=["cancelled_at", "refunded"])
        return Response(invitation_status(request.user))


def todays_guest_bookings(member_id):
    return GuestBooking.objects.filter(
        sale__member_id=member_id, event__starts_at__date=timezone.localdate(),
        event__is_published=True, event__cancelled_at__isnull=True, cancelled_at__isnull=True,
    )


class StaffGuestArrivalsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        today = timezone.localdate()
        bookings = GuestBooking.objects.filter(sale__member_id=pk, event__starts_at__date__gte=today,
            event__is_published=True, event__cancelled_at__isnull=True, cancelled_at__isnull=True,
        ).order_by("event__starts_at", "id").select_related("event")
        if request.query_params.get("scope") != "upcoming":
            bookings = bookings.filter(event__starts_at__date=today)
        return Response([{"id": b.pk, "event__title": b.event.title, "event__starts_at": b.event.starts_at,
                          "arrived_at": b.arrived_at, "can_check_in": timezone.localdate(b.event.starts_at) == today}
                         for b in bookings])


class StaffGuestCheckInView(APIView):
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request, pk, booking_id):
        booking = get_object_or_404(todays_guest_bookings(pk).select_for_update(), pk=booking_id)
        already_arrived = booking.arrived_at is not None
        if not already_arrived:
            booking.arrived_at = timezone.now()
            booking.checked_in_by = request.user
            booking.save(update_fields=["arrived_at", "checked_in_by"])
        return Response({"arrived_at": booking.arrived_at, "already_arrived": already_arrived})


class InvitationLink(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request, pk):
        import uuid
        booking = get_object_or_404(GuestBooking.objects.select_for_update(), pk=pk, sale__member=request.user,
                                    cancelled_at__isnull=True, event__cancelled_at__isnull=True,
                                    event__starts_at__gt=timezone.now(), event__is_published=True)
        if not booking.ticket:
            booking.ticket = uuid.uuid4()
            booking.save(update_fields=["ticket"])
        return Response({"ticket":booking.ticket})


class Ticket(APIView):
    permission_classes = [AllowAny]

    def get(self, request, key):
        booking = get_object_or_404(GuestBooking.objects.select_related("event"), ticket=key, cancelled_at__isnull=True,
                                    event__is_published=True, event__cancelled_at__isnull=True,
                                    event__starts_at__date__gte=timezone.localdate())
        return Response({"title":booking.event.title,"starts_at":booking.event.starts_at,
                         "location":booking.event.location, "arrived":bool(booking.arrived_at)})

    @transaction.atomic
    def post(self, request, key):
        if not request.user.is_authenticated or not request.user.is_staff:
            raise PermissionDenied()
        booking = get_object_or_404(GuestBooking.objects.select_for_update(), ticket=key,cancelled_at__isnull=True,
            event__is_published=True,event__cancelled_at__isnull=True,event__starts_at__date=timezone.localdate())
        if not booking.arrived_at:
            booking.arrived_at = timezone.now()
            booking.checked_in_by = request.user
            booking.save(update_fields=["arrived_at","checked_in_by"])
        return Response({"arrived":True})
