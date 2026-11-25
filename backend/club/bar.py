import json
from collections import Counter, defaultdict
from pathlib import Path

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import User
from members.permissions import IsClubUser
from .models import BarOrder, MenuQuestion, MenuVote

MENU = json.loads(Path(__file__).with_name("menu.json").read_text())
ITEMS = {item[0]: section["name"] for side in MENU["sides"] for section in side["sections"] for item in section["items"]}


def order_data(order):
    return {"id": str(order.pk), "items": [{"name": name, **order.ratings.get(name, {})} for name in order.items],
            "service": order.service, "skipped": order.skipped, "ts": order.created_at, "done": order.skipped or all(n in order.ratings for n in order.items)}


class MyOrders(APIView):
    permission_classes = [IsClubUser]

    def get(self, request, pk=None):
        if pk:
            return self.http_method_not_allowed(request)
        return Response({"orders": [order_data(o) for o in request.user.bar_orders.order_by("-pk")[:50]]})

    @transaction.atomic
    def post(self, request, pk=None):
        if pk is None:
            return self.http_method_not_allowed(request)
        order = get_object_or_404(BarOrder.objects.select_for_update(), member=request.user, pk=pk)
        class Rating(serializers.Serializer):
            stars = serializers.IntegerField(min_value=1, max_value=5)
            text = serializers.CharField(max_length=300, allow_blank=True, default="")
        class Input(serializers.Serializer):
            items = serializers.DictField(child=Rating(), required=False)
            service = serializers.IntegerField(min_value=0, max_value=5, required=False)
            skip = serializers.BooleanField(default=False)
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        args = data.validated_data
        ratings = args.get("items", {})
        if ratings.keys() - set(order.items):
            raise serializers.ValidationError("Оценить можно только свой заказ.")
        order.ratings.update(ratings)
        order.skipped = args["skip"]
        order.service = args.get("service") or order.service
        order.save()
        if order.service == 5:
            from .team import reward_service
            reward_service(order)
        return Response(order_data(order))


class Orders(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        rows = BarOrder.objects.select_related("member", "cashier").order_by("-pk")
        groups, service = defaultdict(list), []
        for order in rows:
            for item, rating in order.ratings.items():
                groups[item].append(rating)
            if order.service:
                service.append(order.service)
        def summary(values):
            return {"n":len(values), "avg":round(sum(values) / len(values), 1) if values else None,
                    "dist":[values.count(k) for k in range(1, 6)]}
        return Response({"min":5, "service":summary(service), "items":[{"name":n, "section":sec,
            "comments":[x for x in groups[n] if x.get("text")][:6], **summary([x["stars"] for x in groups[n]])} for n, sec in ITEMS.items()],
            "orders":[{**order_data(o), "name":o.member.full_name, "by":o.cashier.full_name} for o in rows[:80]]})

    @transaction.atomic
    def post(self, request):
        class Input(serializers.Serializer):
            user = serializers.IntegerField(min_value=1)
            items = serializers.ListField(child=serializers.ChoiceField(choices=list(ITEMS)), allow_empty=False, max_length=80)
            reference = serializers.UUIDField()
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        args = data.validated_data
        member = get_object_or_404(User, pk=args["user"], is_staff=False)
        items = list(dict.fromkeys(args["items"]))
        order, _ = BarOrder.objects.get_or_create(reference=args["reference"], defaults={"member":member,"cashier":request.user,"items":items})
        if order.member_id != member.pk or order.cashier_id != request.user.pk or order.items != items:
            return Response({"detail":"Номер заказа уже занят."}, status=409)
        return Response({"name": member.full_name, "text":"Заказ записан."})


class Menu(APIView):
    permission_classes = [AllowAny]

    def get(self, request, action=None, pk=None):
        if action or pk:
            return self.http_method_not_allowed(request)
        items, wishes = [], []
        user = request.user
        can_vote = user.is_authenticated and user.is_member
        for question in MenuQuestion.objects.select_related("author").prefetch_related("votes").order_by("-pk"):
            votes = {v.member_id:v.choice for v in question.votes.all()}
            counts = Counter(votes.values())
            row = {"id":str(question.pk), "item":question.title, "title":question.title, "note":question.note,
                   "status":"closed" if question.decision else "open", "decision":question.decision,
                   "by_name":question.author.full_name if can_vote else "Резидент", "ts":question.created_at,
                   "wants":len(votes), "counts":{k:counts[k] for k in ("keep","fix","drop")}, "total":len(votes), "mine":votes.get(user.pk)}
            (wishes if question.wish else items).append(row)
        return Response({"menu":MENU, "items":items, "wishes":wishes, "goal":10, "can_vote":can_vote, "admin":user.has_perm("club.change_menuquestion")})

    @transaction.atomic
    def post(self, request, action=None, pk=None):
        if action is None:
            return self.http_method_not_allowed(request)
        user = request.user
        admin = user.has_perm("club.change_menuquestion")
        if action in ("open", "close","done") and not admin:
            raise PermissionDenied()
        if action not in ("open","close","done") and not (user.is_authenticated and user.is_member):
            raise PermissionDenied()
        if action in ("open","wish"):
            class Input(serializers.Serializer):
                title = serializers.CharField(max_length=120)
                note = serializers.CharField(max_length=160, allow_blank=True, default="")
            data = Input(data={**request.data, "title":request.data.get("title") or request.data.get("item")})
            data.is_valid(raise_exception=True)
            wish = action == "wish"
            if not wish and data.validated_data["title"] not in ITEMS:
                raise serializers.ValidationError("Позиции нет в меню.")
            q = MenuQuestion.objects.create(**data.validated_data, wish=wish, author=user)
            if wish:
                MenuVote.objects.create(question=q, member=user, choice="want")
        else:
            q = get_object_or_404(MenuQuestion.objects.select_for_update(), pk=pk)
            if q.decision:
                return Response({"detail":"Вопрос уже закрыт."}, status=409)
            if action in ("close","done"):
                decision = "Добавлено в меню" if action == "done" else serializers.CharField(max_length=300).run_validation(request.data.get("decision"))
                q.decision = decision
                q.save(update_fields=["decision"])
            elif action == "want" and q.wish:
                vote, created = MenuVote.objects.get_or_create(question=q, member=user, defaults={"choice":"want"})
                if not created:
                    vote.delete()
            elif action == "vote" and not q.wish:
                choice = serializers.ChoiceField(choices=["keep","fix","drop"]).run_validation(request.data.get("choice"))
                MenuVote.objects.update_or_create(question=q, member=user, defaults={"choice":choice})
            else:
                raise serializers.ValidationError("Неизвестное действие.")
        return Response({"ok":True,"text":"Решение сохранено."})
