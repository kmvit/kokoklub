"""Покупка токенов на платёжной форме Т-Банка."""
import secrets
import hashlib
import hmac
import json
import uuid
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OnlinePayment, User
from .permissions import IsClubUser


def enabled():
    return bool(settings.TBANK_TERMINAL and settings.TBANK_PASSWORD and settings.TBANK_PUBLIC_ORIGIN.startswith("https://")
                and bool(settings.TBANK_TAXATION) == bool(settings.TBANK_ITEM_TAX))


def signature(fields):
    parts = {k: v for k, v in fields.items() if k not in ("Token", "Password") and
             v is not None and not isinstance(v, (list, dict))}
    parts["Password"] = settings.TBANK_PASSWORD
    values = [str(v).lower() if isinstance(v, bool) else str(v) for _, v in sorted(parts.items())]
    return hashlib.sha256("".join(values).encode("utf-8")).hexdigest()


def init_at_bank(order, member):
    amount = order.amount * 100
    origin = settings.TBANK_PUBLIC_ORIGIN
    description = "Пополнение клубного счёта" if order.purpose == "topup" else "Клубная карта" if order.purpose.startswith("card_") else "Подарочная карта клуба"
    payload = {
        "TerminalKey": settings.TBANK_TERMINAL, "OrderId": str(order.order_id), "Amount": amount,
        "Description": description, "PayType": "O",
        "NotificationURL": f"{origin}/api/payments/tbank/notify/",
        "SuccessURL": f"{origin}{settings.TBANK_RETURN_PATH}", "FailURL": f"{origin}{settings.TBANK_RETURN_PATH}",
    }
    if settings.TBANK_TAXATION and settings.TBANK_ITEM_TAX:
        payload["Receipt"] = {
            "Taxation": settings.TBANK_TAXATION, "Phone": "+" + member.phone,
            "Items": [{"Name": description, "Price": amount, "Quantity": 1,
                       "Amount": amount, "Tax": settings.TBANK_ITEM_TAX, "PaymentMethod": "advance", "PaymentObject": "payment"}],
        }
    payload["Token"] = signature(payload)
    base = "https://rest-api-test.tinkoff.ru" if settings.TBANK_TEST else "https://securepay.tinkoff.ru"
    headers = {"Content-Type": "application/json"}
    if settings.TBANK_API_TOKEN:
        headers["Authorization"] = "Bearer " + settings.TBANK_API_TOKEN
    request = Request(base + "/v2/Init", data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urlopen(request, timeout=8) as reply:
        return json.load(reply)


def card_quote(member, tariff):
    from club.membership import status
    state = status(member)
    ends = member.membership_sales.filter(ends_at__gt=timezone.now()).order_by("-ends_at").values_list("ends_at", flat=True).first()
    return {"due": state["tariffs"][tariff]["price" if ends else "due"], "entry":None if ends else state["entry_id"],
            "extend":ends.isoformat() if ends else None}


class CardQuote(APIView):
    permission_classes = [IsClubUser]

    def get(self, request, tariff):
        from club.membership import TARIFFS
        if tariff not in TARIFFS:
            return Response(status=404)
        return Response({"bank":enabled(), "quote":card_quote(request.user,tariff)})


def fulfill_card(order):
    from datetime import datetime, timedelta
    from club.membership import CARD_BENEFITS, TARIFFS
    from club.models import MembershipSale
    user = User.objects.select_for_update().get(pk=order.member_id)
    tariff = order.purpose[5:]
    if card_quote(user,tariff) != order.card_quote:
        order.needs_review = True
        return
    start = datetime.fromisoformat(order.card_quote["extend"]) if order.card_quote["extend"] else timezone.now()
    grant, visits = CARD_BENEFITS.get(tariff,(0,0))
    MembershipSale.objects.create(member=user,tariff=tariff,paid=order.amount,entry_payment_id=order.card_quote["entry"],
        starts_at=start,ends_at=start+timedelta(days=TARIFFS[tariff][1]),credit_grant=grant,included_visits=visits)


class CheckoutInput(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=["topup","gift_tokens","gift_month","gift_half","gift_year","card_month","card_half","card_year","card_keeper","card_patron"], default="topup")
    amount = serializers.IntegerField(min_value=1, max_value=1000000)
    reference = serializers.UUIDField()


class CheckoutView(APIView):
    permission_classes = [IsClubUser]

    def post(self, request):
        if not enabled():
            return Response({"detail": "Онлайн-пополнение пока недоступно."}, status=503)
        data = CheckoutInput(data=request.data)
        data.is_valid(raise_exception=True)
        args = data.validated_data
        from club.membership import TARIFFS
        purpose = args["purpose"]
        if purpose.startswith("gift_") and purpose != "gift_tokens" and args["amount"] != TARIFFS[purpose[5:]][0]:
            return Response({"detail":"Цена подарочной карты изменилась."}, status=409)
        quote = {}
        if purpose.startswith("card_"):
            quote = card_quote(request.user, purpose[5:])
            if args["amount"] != quote["due"] or request.data.get("quote") != quote:
                return Response({"detail":"Условия покупки изменились. Откройте карту ещё раз."},status=409)
        order, _ = OnlinePayment.objects.get_or_create(member=request.user, reference=args["reference"], defaults={
            "order_id":uuid.uuid4(), "amount":args["amount"], "purpose":purpose, "card_quote":quote})
        with transaction.atomic():
            order = OnlinePayment.objects.select_for_update().get(pk=order.pk)
            if order.amount != args["amount"] or order.purpose != purpose or order.card_quote != quote:
                return Response({"detail": "Для этой операции уже указана другая сумма."}, status=409)
            if order.confirmed_at or order.status in ("REJECTED", "DEADLINE_EXPIRED", "CANCELED") or order.needs_review:
                return Response({"detail": "Эта платёжная сессия завершена. Проверьте историю счёта."}, status=409)
            if not order.payment_url:
                try:
                    reply = init_at_bank(order, request.user)
                    link = urlsplit(reply.get("PaymentURL", ""))
                    valid = (reply.get("Success") is True and str(reply.get("ErrorCode")) == "0"
                             and str(reply.get("OrderId")) == str(order.order_id) and reply.get("Amount") == order.amount * 100
                             and reply.get("TerminalKey") == settings.TBANK_TERMINAL and link.scheme == "https" and link.hostname
                             and str(reply.get("PaymentId", "")).isdigit())
                except (URLError, OSError, ValueError, AttributeError):
                    valid = False
                if not valid:
                    order.status = "INIT_UNRESOLVED"
                    order.save(update_fields=["status"])
                    return Response({"detail": "Банк не вернул ссылку на оплату. Проверьте историю перед новой попыткой."}, status=502)
                order.payment_id = str(reply["PaymentId"])
                order.payment_url = reply["PaymentURL"]
                order.status = reply.get("Status", "NEW")
                order.save(update_fields=["payment_id", "payment_url", "status"])
            return Response({"payment_url": order.payment_url, "order": order.order_id})


class NotificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    @transaction.atomic
    def post(self, request):
        body = request.data
        if not isinstance(body, dict) or not settings.TBANK_PASSWORD or not settings.TBANK_TERMINAL:
            return HttpResponse(status=400)
        token = body.get("Token")
        if (not isinstance(token, str) or not token.isascii() or "Password" in body
                or body.get("TerminalKey") != settings.TBANK_TERMINAL
                or not hmac.compare_digest(token, signature(body))):
            return HttpResponse(status=403)
        try:
            order_id = uuid.UUID(str(body["OrderId"]))
        except (ValueError, KeyError):
            return HttpResponse(status=400)
        order = OnlinePayment.objects.select_for_update().filter(order_id=order_id).first()
        payment_id = str(body.get("PaymentId", ""))
        if not order or not payment_id.isdigit() or len(payment_id) > 32 or order.payment_id not in (None, payment_id):
            return HttpResponse(status=409)
        if OnlinePayment.objects.filter(payment_id=payment_id).exclude(pk=order.pk).exists():
            return HttpResponse(status=409)
        state = body.get("Status")
        if not isinstance(state, str) or len(state) > 32:
            return HttpResponse(status=400)
        if state in ("REFUNDED", "PARTIAL_REFUNDED", "REVERSED", "PARTIAL_REVERSED"):
            order.needs_review = True
            order.status = state
        elif state == "CONFIRMED":
            if (body.get("Success") is not True or str(body.get("ErrorCode")) != "0" or
                    str(body.get("Amount")) != str(order.amount * 100)):
                return HttpResponse(status=409)
            if not order.confirmed_at and not order.needs_review:
                order.confirmed_at = timezone.now()
                order.status = state
                if order.purpose.startswith("card_"):
                    fulfill_card(order)
                if order.purpose.startswith("gift_"):
                    order.gift_code = secrets.token_urlsafe(20)
        elif not order.confirmed_at and not order.needs_review:
            order.status = state
        order.payment_id = payment_id
        order.save(update_fields=["status", "confirmed_at", "needs_review", "payment_id", "gift_code"])
        return HttpResponse("OK", content_type="text/plain")
