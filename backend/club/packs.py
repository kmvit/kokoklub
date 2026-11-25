from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from members.bookings import active_sale
from members.models import User, account_balance
from members.permissions import IsClubUser
from .models import PackPurchase, VisitPack


class PurchaseInput(serializers.Serializer):
    reference = serializers.UUIDField()
    id = serializers.IntegerField(min_value=1)
    visits = serializers.IntegerField(min_value=1)
    price = serializers.IntegerField(min_value=1)


class VisitPacksView(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        sale = active_sale(request.user)
        return Response({"left": sale.visits_left if sale else 0, "expires": sale.ends_at if sale else None,
                         "offers": list(VisitPack.objects.filter(available=True).values("id", "title", "visits", "price")) if sale else []})

    @transaction.atomic
    def post(self, request):
        data = PurchaseInput(data=request.data)
        data.is_valid(raise_exception=True)
        order = data.validated_data
        member = User.objects.select_for_update().get(pk=request.user.pk)
        previous = PackPurchase.objects.filter(reference=order["reference"]).first()
        if previous:
            if (previous.member_id, previous.pack_id, previous.visits, previous.price) != (
                    member.pk, order["id"], order["visits"], order["price"]):
                return Response({"detail": "Номер покупки уже использован."}, status=409)
            return self.get(request)
        pack = get_object_or_404(VisitPack.objects.select_for_update(), pk=order["id"], available=True)
        sale = active_sale(member)
        if not sale:
            return Response({"detail": "Для покупки нужна действующая карта с тарифом."}, status=403)
        if (pack.price, pack.visits) != (order["price"], order["visits"]):
            return Response({"detail": "Условия пакета изменились. Обновите страницу."}, status=409)
        if account_balance(member) < pack.price:
            return Response({"detail": "Недостаточно токенов на счёте."}, status=409)
        PackPurchase.objects.create(member=member, sale=sale, pack=pack, price=pack.price,
                                    visits=pack.visits, reference=order["reference"])
        return self.get(request)
