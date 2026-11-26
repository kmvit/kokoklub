from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import User, account_balance
from .models import EntryPayment, MembershipSale, Visit
from .queries import open_visits

TARIFFS = {
    MembershipSale.Tariff.MONTH: (1500, 30),
    MembershipSale.Tariff.HALF: (7500, 182),
    MembershipSale.Tariff.YEAR: (15000, 365),
    MembershipSale.Tariff.KEEPER: (50000, 365),
    MembershipSale.Tariff.PATRON: (100000, 365),
}
CARD_BENEFITS = {"keeper": (10000, 40), "patron": (30000, 90)}
GUEST_ENTRY = 1000


def status(member):
    payment = EntryPayment.objects.filter(
        visit__member=member, visit__entered_at__date=timezone.localdate(),
        membershipsale__isnull=True,
    ).exclude(visit__residentbooking__guest=True, visit__residentbooking__refunded=True).order_by("-visit__entered_at").first()
    sale = MembershipSale.current_for(member.pk).order_by("-ends_at").first()
    credit = payment.amount if payment else 0
    tariffs = {
        code: {"name": code.label, "price": price, "days": days, "due": max(0, price - credit)}
        for code, (price, days) in TARIFFS.items()
    }
    return {
        "tariffs": tariffs,
        "balance": str(account_balance(member)),
        "invites_left": sale.invites_left if sale else 0,
        "active_tariff": sale.get_tariff_display() if sale else None,
        "expires": sale.ends_at if sale else None,
        "legacy": not sale and member.is_member,
        "entry_id": payment.pk if payment else None,
        "entry_price": GUEST_ENTRY,
        "due": tariffs["month"]["due"],
    }


class StaffMembershipView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        return Response(status(get_object_or_404(User, pk=pk, is_staff=False)))

    @transaction.atomic
    def post(self, request, pk):
        member = get_object_or_404(User.objects.select_for_update(), pk=pk, is_staff=False)
        state = status(member)
        action = request.data.get("action")
        if state["expires"] or (state["legacy"] and action == "entry"):
            if isinstance(action, str) and action in TARIFFS and state["active_tariff"] != MembershipSale.Tariff(action).label:
                return Response({"detail": "У участника уже есть действующая карта."}, status=409)
            return Response(state)
        if action == "entry":
            if not state["entry_id"]:
                visit = open_visits().filter(member=member, entered_at__date=timezone.localdate()).first()
                if not visit:
                    visit = Visit.objects.create(member=member)
                if hasattr(visit, "entrypayment"):
                    # Вход по отменённой гостевой брони уже закрыт возвратом.
                    visit.left_at = timezone.now()
                    visit.save(update_fields=["left_at"])
                    visit = Visit.objects.create(member=member)
                EntryPayment.objects.create(visit=visit, amount=GUEST_ENTRY, cashier=request.user)
        elif isinstance(action, str) and action in TARIFFS:
            quote = state["tariffs"][action]
            if request.data.get("entry_id") != state["entry_id"] or request.data.get("paid") != quote["due"]:
                return Response({"detail": "Сумма изменилась. Обновите карточку гостя."}, status=409)
            start = timezone.now()
            grant, visits = CARD_BENEFITS.get(action, (0, 0))
            MembershipSale.objects.create(
                credit_grant=grant, included_visits=visits,
                member=member, tariff=action, cashier=request.user, entry_payment_id=state["entry_id"],
                paid=quote["due"], starts_at=start, ends_at=start + timedelta(days=quote["days"]),
            )
        else:
            return Response({"detail": "Неизвестная операция"}, status=400)
        return Response(status(member))
