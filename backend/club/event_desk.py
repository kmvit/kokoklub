from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Event, ResidentBooking, User, account_balance
from members.bookings import active_sale
from .membership import GUEST_ENTRY
from .models import EntryPayment, FoodRedemption, OrganizerReward, Visit, WalkIn
from .queries import open_visits, visit_for


def meal_balance(reward):
    return 1000 - (reward.food_orders.aggregate(total=Sum("amount"))["total"] or 0)


def admitted_today(member, day):
    if member.membership_sales.filter(cashier__isnull=False, starts_at__date=day).exists():
        return True
    return member.walkins.filter(day=day).exists() or member.visits.filter(entered_at__date=day).filter(
        Q(residentbooking__isnull=False) | Q(entrypayment__isnull=False)
    ).exists() or member.organizer_rewards.filter(Q(arrival__entered_at__date=day) | Q(extra_visit__entered_at__date=day)).exists()


def day_price(member, sale):
    if sale or member.is_member:
        return 500 if timezone.localtime().hour < 13 else 750
    return GUEST_ENTRY


def active_bookings(member):
    return member.resident_bookings.filter(cancelled_at__isnull=True, event__is_published=True,
                                           event__cancelled_at__isnull=True)


def desk(member):
    today = timezone.localdate()
    bookings = active_bookings(member).filter(event__starts_at__date__gte=today)
    events = Event.objects.filter(organizer=member, is_published=True, cancelled_at__isnull=True, starts_at__date=today)
    sale = active_sale(member)
    return {
        "balance": format(account_balance(member), ".2f"),
        "walkin": {"day": today, "price": day_price(member, sale), "visits": sale.visits_left if sale else 0,
                   "paid": admitted_today(member, today), "in_club": open_visits().filter(member=member).exists()},
        "day": today,
        "places": list(bookings.order_by("event__starts_at").values("id", "event__title", "event__starts_at", "visit_id", "guest")),
        "hosting": list(events.filter(organizerreward__isnull=True).values("id", "title")),
        "rewards": reward_status(member),
    }


def reward_status(member):
    rewards = member.organizer_rewards.filter(event__cancelled_at__isnull=True).select_related("event").order_by("-event__starts_at")
    return [{"id": r.pk, "title": r.event.title, "meal": meal_balance(r),
                     "completed": bool(r.completed_at), "can_complete": r.event.starts_at <= timezone.now(),
                     "invite_used": bool(r.invite_used_at), "visit_used": bool(r.extra_visit_id)} for r in rewards]


class DeskInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=["resident", "organizer", "complete", "food", "invite", "visit", "day", "day_pack"])
    id = serializers.IntegerField(min_value=1, required=False)
    day = serializers.DateField(required=False)
    amount = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    reference = serializers.UUIDField(required=False)


class MemberEventDesk(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        return Response(desk(get_object_or_404(User, pk=pk, is_staff=False)))

    @transaction.atomic
    def post(self, request, pk):
        data = DeskInput(data=request.data)
        data.is_valid(raise_exception=True)
        args = data.validated_data
        member = get_object_or_404(User.objects.select_for_update(), pk=pk, is_staff=False)
        action, target = args["action"], args.get("id")
        today = timezone.localdate()
        if action in ("day", "day_pack"):
            sale = active_sale(member)
            if args.get("day") != today:
                return Response({"detail": "Сменился день визита. Обновите карточку участника."}, status=409)
            if not admitted_today(member, today):
                if active_bookings(member).filter(event__starts_at__date=today, visit__isnull=True).exists():
                    return Response({"detail": "На сегодня есть бронь. Отметьте приход по записи без доплаты."}, status=409)
                price = day_price(member, sale)
                use_pack = action == "day_pack"
                if use_pack and (not sale or sale.visits_left <= 0):
                    return Response({"detail": "Пакетные визиты закончились."}, status=409)
                if not use_pack and args.get("amount") != price:
                    return Response({"detail": "Цена входа изменилась. Обновите карточку гостя."}, status=409)
                if not use_pack and account_balance(member) < price:
                    return Response({"detail": "На счёте недостаточно токенов для оплаты входа."}, status=409)
                visit = visit_for(member)
                if price == GUEST_ENTRY and timezone.localdate(visit.entered_at) != today:
                    visit.left_at = timezone.now()
                    visit.save(update_fields=["left_at"])
                    visit = Visit.objects.create(member=member)
                WalkIn.objects.create(member=member, cashier=request.user, day=today, visit=visit,
                                      package_sale=sale if use_pack else None, price=0 if use_pack else price)
                if price == GUEST_ENTRY:
                    EntryPayment.objects.create(visit=visit, amount=price, cashier=request.user)
            else:
                visit_for(member)
        elif action == "resident":
            booking = get_object_or_404(ResidentBooking.objects.select_for_update(), member=member, pk=target,
                                        event__starts_at__date=today, event__is_published=True,
                                        event__cancelled_at__isnull=True, cancelled_at__isnull=True)
            if not booking.visit_id:
                booking.visit = visit_for(member)
                if booking.guest and booking.guest_entry:
                    EntryPayment.objects.get_or_create(visit=booking.visit, defaults={"amount": booking.guest_entry, "cashier": request.user})
                booking.checked_in_by = request.user
                booking.save(update_fields=["visit", "checked_in_by"])
        elif action == "organizer":
            event = get_object_or_404(Event.objects.select_for_update(), organizer=member, pk=target,
                                      starts_at__date=today, is_published=True, cancelled_at__isnull=True)
            if not OrganizerReward.objects.filter(event=event).exists():
                OrganizerReward.objects.create(event=event, organizer=member, granted_by=request.user, arrival=visit_for(member))
        else:
            reward = get_object_or_404(OrganizerReward.objects.select_for_update().select_related("event"),
                                       organizer=member, pk=target, event__cancelled_at__isnull=True)
            if action == "food":
                amount, reference = args.get("amount"), args.get("reference")
                if not amount or not reference:
                    return Response({"detail": "Укажите сумму заказа и номер операции."}, status=400)
                previous = FoodRedemption.objects.filter(reference=reference).first()
                if previous and (previous.reward_id != reward.pk or previous.amount != amount or previous.cashier_id != request.user.pk):
                    return Response({"detail": "Номер операции уже занят."}, status=409)
                if not previous:
                    if amount > meal_balance(reward):
                        return Response({"detail": "Недостаточно кредитов на еду."}, status=409)
                    FoodRedemption.objects.create(reward=reward, cashier=request.user, amount=amount, reference=reference)
            elif action == "complete":
                if reward.event.starts_at > timezone.now() or reward.event.cancelled_at:
                    return Response({"detail": "Эту встречу пока нельзя отметить проведённой."}, status=409)
                if not reward.completed_at:
                    reward.completed_at, reward.completed_by = timezone.now(), request.user
                    reward.save(update_fields=["completed_at", "completed_by"])
            elif not reward.completed_at:
                return Response({"detail": "Привилегия доступна после проведения встречи."}, status=409)
            elif action == "invite" and not reward.invite_used_at:
                reward.invite_used_at, reward.invite_used_by = timezone.now(), request.user
                reward.save(update_fields=["invite_used_at", "invite_used_by"])
            elif action == "visit" and not reward.extra_visit_id:
                if open_visits().filter(member=member).exists():
                    return Response({"detail": "Участник уже в клубе. Вход можно использовать в следующий визит."}, status=409)
                reward.extra_visit, reward.extra_visit_by = visit_for(member), request.user
                reward.save(update_fields=["extra_visit", "extra_visit_by"])
        return Response(desk(member))
