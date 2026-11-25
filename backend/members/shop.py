from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from club.membership import TARIFFS
from club.models import MembershipSale, VisitTransfer
from .bookings import active_sale
from .models import OnlinePayment, ShopOrder, ShopProduct, User, account_balance
from .payments import enabled
from .permissions import IsClubUser
from .questionnaires import questionnaire


class Shop(APIView):
    permission_classes = [IsClubUser]

    def get(self, request, pk=None):
        if pk:
            return self.http_method_not_allowed(request)
        user = request.user
        return Response({"products":list(ShopProduct.objects.filter(available=True).values("id","title","price","description","requires_portrait")),
            "orders":[{"title":o.title,"price":o.price,"status":o.get_status_display()} for o in user.shop_orders.order_by("-pk")[:100]],
            "bank":enabled(),"gifts":list(user.online_payments.filter(gift_code__isnull=False, needs_review=False)
                .values("gift_code","amount","purpose","redeemed_at").order_by("-pk"))})

    @transaction.atomic
    def post(self, request, pk=None):
        if pk is None:
            return self.http_method_not_allowed(request)
        user = User.objects.select_for_update().get(pk=request.user.pk)
        ref = serializers.UUIDField().run_validation(request.data.get("reference"))
        previous = ShopOrder.objects.filter(reference=ref).first()
        if previous:
            if previous.member_id != user.pk or previous.product_id != pk or previous.price != request.data.get("price"):
                return Response({"detail":"Номер заказа уже занят."},status=409)
            return Response({"status":previous.get_status_display()})
        product = get_object_or_404(ShopProduct.objects.select_for_update(),pk=pk,available=True)
        if product.requires_portrait and (not user.is_member or questionnaire(user)["progress"] != 100):
            return Response({"detail":"Для заказа нужна клубная карта и заполненная анкета."},status=403)
        if product.price != request.data.get("price") or account_balance(user) < product.price:
            return Response({"detail":"Проверьте цену и баланс."},status=409)
        ShopOrder.objects.create(member=user,product=product,reference=ref,title=product.title,price=product.price)
        return Response({"status":"Принят"},status=201)


class RedeemGift(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=request.user.pk)
        code = serializers.CharField(max_length=40).run_validation(request.data.get("code"))
        gift = get_object_or_404(OnlinePayment.objects.select_for_update(),gift_code=code,confirmed_at__isnull=False,needs_review=False)
        if gift.redeemed_by_id:
            if gift.redeemed_by_id == user.pk:
                return Response({"ok":True})
            return Response({"detail":"Подарок уже получен."},status=409)
        now = timezone.now()
        if gift.purpose != "gift_tokens":
            tariff = gift.purpose.removeprefix("gift_")
            if tariff not in TARIFFS:
                raise serializers.ValidationError("Неизвестная подарочная карта.")
            if user.is_member:
                return Response({"detail":"У вас уже есть действующая карта. Код сохранит силу."},status=409)
            MembershipSale.objects.create(member=user,tariff=tariff,paid=gift.amount,starts_at=now,
                                          ends_at=now+timedelta(days=TARIFFS[tariff][1]))
        gift.redeemed_by, gift.redeemed_at = user, now
        gift.save(update_fields=["redeemed_by","redeemed_at"])
        return Response({"ok":True})


class TransferVisits(APIView):
    permission_classes = [IsClubUser]

    @transaction.atomic
    def post(self, request):
        class Input(serializers.Serializer):
            member = serializers.IntegerField(min_value=1)
            quantity = serializers.IntegerField(min_value=1,max_value=1000)
            reference = serializers.UUIDField()
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        args = data.validated_data
        users = {u.pk:u for u in User.objects.select_for_update().filter(pk__in=[request.user.pk,args["member"]],is_active=True,is_staff=False).order_by("pk")}
        if len(users) != 2:
            raise serializers.ValidationError("Выберите другого резидента.")
        prior = VisitTransfer.objects.filter(reference=args["reference"]).first()
        if prior:
            if (prior.source.member_id,prior.destination.member_id,prior.quantity) != (request.user.pk,args["member"],args["quantity"]):
                return Response({"detail":"Номер перевода уже занят."},status=409)
            return Response({"ok":True})
        source, destination = active_sale(users[request.user.pk]), active_sale(users[args["member"]])
        if not source or not destination or source.visits_left < args["quantity"]:
            return Response({"detail":"Для перевода нужны действующие карты и доступные визиты."},status=409)
        VisitTransfer.objects.create(source=source,destination=destination,quantity=args["quantity"],reference=args["reference"])
        return Response({"ok":True},status=201)
