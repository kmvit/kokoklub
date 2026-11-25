import json
from datetime import timedelta
from pathlib import Path

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TeamCard, TeamFundEntry, TeamPerson, TeamPolicy

DEFAULTS = json.loads(Path(__file__).with_name("team_defaults.json").read_text())


def person_for(user):
    return TeamPerson.objects.get_or_create(user=user, defaults={"name":user.full_name or user.email or "Сотрудник"})[0]


def rules_lock():
    return TeamPolicy.objects.select_for_update().get_or_create(pk=1)[0]


def settle(rules):
    now = timezone.now()
    cards = TeamCard.objects.filter(void=False, used__isnull=True).order_by("pk")
    yellow = cards.filter(color="yellow", created_at__gte=now-timedelta(days=rules["yellow_days"]))
    for person in set(yellow.values_list("person_id", flat=True)):
        while len(ids := list(yellow.filter(person_id=person).values_list("pk",flat=True)[:rules["yellow_to_red"]])) == rules["yellow_to_red"]:
            red = TeamCard.objects.create(person_id=person, color="red", reason="Накоплены жёлтые карточки")
            TeamCard.objects.filter(pk__in=ids).update(used=red)
    month = timezone.localtime().replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    for _ in range(rules["purple_cap"] - cards.filter(color="purple", created_at__gte=month).count()):
        ids = list(cards.filter(color="green").values_list("pk",flat=True)[:rules["green_to_purple"]])
        if len(ids) < rules["green_to_purple"]:
            break
        purple = TeamCard.objects.create(color="purple", reason="Зелёные карточки команды", amount=rules["purple_rub"])
        TeamCard.objects.filter(pk__in=ids).update(used=purple)


def reward_service(order):
    policy = rules_lock()
    person = person_for(order.cashier)
    TeamCard.objects.get_or_create(order=order, defaults={"person":person, "color":"green","reason":"Пять звёзд за обслуживание"})
    settle({**DEFAULTS, **policy.rules})


def amount(rows):
    return rows.aggregate(total=Sum("amount"))["total"] or 0


class Team(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, **kwargs):
        me = person_for(request.user)
        admin = request.user.has_perm("club.change_teampolicy")
        policy = TeamPolicy.objects.filter(pk=1).first()
        cfg = {**DEFAULTS, **(policy.rules if policy else {})}
        now = timezone.localtime()
        month = now.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
        live = TeamCard.objects.filter(void=False)
        staff, journal = [], []
        for p in TeamPerson.objects.order_by("name"):
            cards = live.filter(person=p)
            row = {"id":str(p.pk), "name":p.name, "post":p.post, "greens":cards.filter(color="green").count(),
                   "greens_month":cards.filter(color="green",created_at__gte=month).count()}
            if admin or me.pk == p.pk:
                reds = cards.filter(color="red", created_at__gte=now-timedelta(days=cfg["red_days"])).count()
                row.update(yellows=cards.filter(color="yellow",used__isnull=True,created_at__gte=now-timedelta(days=cfg["yellow_days"])).count(),
                           reds=reds, alert=reds>=cfg["red_limit"], premium=max(0,100-reds*cfg["premium_cut"]) if cfg["premium_link"] else None)
            staff.append(row)
        for c in TeamCard.objects.select_related("person","author").order_by("-pk"):
            own = c.person_id == me.pk
            if not admin and not own and (c.void or c.color not in ("green","purple")):
                continue
            journal.append({"id":str(c.pk), "color":c.color, "reason":c.reason, "note":c.note, "mine":own,
                            "staff_name":c.person.name if c.person else "Команда", "by_name":c.author.full_name if c.author else "Автоматически",
                            "ts":c.created_at, "used":bool(c.used_id), "dispute":(c.dispute or None) if admin or own else None, "void":c.void, "rub":c.amount, "auto":not c.author_id})
            if len(journal) == 80:
                break
        moves = TeamFundEntry.objects.select_related("author").prefetch_related("voters").order_by("-pk")
        total, spent = amount(live.filter(color="purple")), amount(moves)
        return Response({"cfg":cfg,"admin":admin,"me":str(me.pk),"staff":staff,"journal":journal,
            "fund":{"total":total,"spent":spent,"left":total-spent,"greens":live.filter(color="green",used__isnull=True).count(),
                    "need":cfg["green_to_purple"],"purples_month":live.filter(color="purple",created_at__gte=month).count(),
                    "cap":cfg["purple_cap"],"rub":cfg["purple_rub"]},
            "ideas":[{"id":str(x.pk),"title":x.title,"who_name":x.author.full_name,"n":len(x.voters.all()),"mine":request.user in x.voters.all()} for x in moves if not x.amount],
            "spends":[{"title":x.title,"rub":x.amount,"ts":x.created_at} for x in moves if x.amount],
            "disputes":live.filter(dispute__status="open").count() if admin else 0})

    @transaction.atomic
    def post(self, request, action=None, pk=None):
        if action not in ("ideas","vote","dispute") and not request.user.has_perm("club.change_teampolicy"):
            raise PermissionDenied()
        data, user = request.data, request.user
        policy = rules_lock()
        rules = {**DEFAULTS, **policy.rules}
        def string(k, maximum, optional=False):
            return serializers.CharField(max_length=maximum,allow_blank=optional).run_validation(data.get(k,""))
        def integer(k, maximum):
            return serializers.IntegerField(min_value=1,max_value=maximum).run_validation(data.get(k))
        if action == "cards":
            person = get_object_or_404(TeamPerson,pk=integer("staff", 2147483647))
            color = serializers.ChoiceField(choices=["yellow","green","red"]).run_validation(data.get("color"))
            TeamCard.objects.get_or_create(reference=serializers.UUIDField().run_validation(data.get("reference")),
                defaults={"person":person,"color":color,"reason":string("reason",160),"note":string("note",300,True),"author":user})
        elif action in ("dispute","resolve"):
            c = get_object_or_404(TeamCard,pk=pk,void=False)
            if action == "dispute":
                if not c.person_id or c.person.user_id != user.pk:
                    raise PermissionDenied()
                c.dispute = {"text":string("text",300),"status":"open"}
            else:
                if c.used_id or c.color == "purple":
                    raise serializers.ValidationError("Начисление уже связано с фондом или другой карточкой.")
                c.void = data.get("void") is True
                c.dispute = {**c.dispute,"status":"accepted" if c.void else "kept"}
            c.save()
        elif action == "settings":
            bounds = {"yellow_to_red":50,"red_limit":50,"green_to_purple":50,"purple_cap":100,"purple_rub":1000000}
            for key, maximum in bounds.items():
                if key in data:
                    rules[key] = integer(key,maximum)
            if "premium_cut" in data:
                rules["premium_cut"] = serializers.IntegerField(min_value=0,max_value=100).run_validation(data["premium_cut"])
            rules["premium_link"] = data.get("premium_link") is True
            policy.rules = rules
            policy.save()
        elif action == "staff":
            TeamPerson.objects.create(name=string("name",40),post=string("post",40,True))
        elif action in ("spend","ideas"):
            value = integer("rub",1000000) if action == "spend" else 0
            ref = serializers.UUIDField().run_validation(data.get("reference"))
            if not TeamFundEntry.objects.filter(reference=ref).exists():
                if value > amount(TeamCard.objects.filter(color="purple",void=False)) - amount(TeamFundEntry.objects.all()):
                    raise serializers.ValidationError("В фонде недостаточно средств.")
                TeamFundEntry.objects.create(reference=ref,amount=value,title=string("title",120),author=user)
        elif action == "vote":
            entry = get_object_or_404(TeamFundEntry,pk=pk,amount=0)
            if entry.voters.filter(pk=user.pk).exists():
                entry.voters.remove(user)
            else:
                entry.voters.add(user)
        else:
            raise serializers.ValidationError("Неизвестное действие.")
        settle(rules)
        return Response({"ok":True})
