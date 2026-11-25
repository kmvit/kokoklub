from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation
from .community import IsResident
from .models import ClubQuestionnaire
from .permissions import IsClubUser
from .views import catalog_queryset

KEYS = ("alias", "source", "music", "film", "evening", "work", "give", "project", "meet", "media", "mood")


def questionnaire(member):
    profile = getattr(member, "questionnaire", None)
    answers = {"alias": member.full_name.split(" ")[0], "work": member.occupation,
               "give": member.can_help, "meet": member.looking_for}
    if profile:
        answers.update(profile.answers)
    return {"anketa": answers, "hidden": profile.hidden if profile else ["source", "media"],
            "progress": round(100 * sum(bool(answers.get(k)) for k in KEYS) / len(KEYS)),
            "here": bool(profile and profile.meet_on == timezone.localdate())}


class MyQuestionnaire(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        return Response(questionnaire(request.user))

    @transaction.atomic
    def patch(self, request):
        member = type(request.user).objects.select_for_update().get(pk=request.user.pk)
        q, _ = ClubQuestionnaire.objects.get_or_create(member=member, defaults={"hidden": ["source", "media"]})
        class Input(serializers.Serializer):
            answers = serializers.DictField(child=serializers.CharField(max_length=400, allow_blank=True), required=False)
            hidden = serializers.ListField(child=serializers.ChoiceField(choices=KEYS[1:]), required=False)
            here = serializers.BooleanField(required=False)
        data = Input(data=request.data)
        data.is_valid(raise_exception=True)
        changes = data.validated_data
        answers = changes.get("answers", {})
        if answers.keys() - set(KEYS):
            raise serializers.ValidationError("Неизвестное поле анкеты.")
        q.answers.update(answers)
        if not member.full_name and answers.get("alias"):
            member.full_name = answers["alias"][:120]
            member.save(update_fields=["full_name"])
        if "here" in changes:
            q.meet_on = timezone.localdate() if changes["here"] else None
        if "hidden" in changes:
            q.hidden = changes["hidden"]
        q.save()
        return Response(questionnaire(member))


class Directory(APIView):
    permission_classes = [IsResident]

    def get(self, request):
        mine = questionnaire(request.user)
        conversations = {c.other(request.user).pk: c for c in Conversation.of(request.user).select_related("user_a", "user_b")}
        rows = []
        for member in catalog_queryset().select_related("questionnaire").exclude(pk=request.user.pk):
            if not member.is_member:
                continue
            profile = questionnaire(member)
            public = {k: v for k, v in profile["anketa"].items() if k not in profile["hidden"]}
            fields = {"music": "music", "cinema": "film", "evenings": "evening", "work": "work", "people": "meet"}
            parts, common = {}, []
            for category, key in fields.items():
                first = {x.strip().casefold() for x in mine["anketa"].get(key, "").split(",") if x.strip()}
                overlap = [x.strip() for x in public.get(key, "").split(",") if x.strip().casefold() in first]
                parts[category] = 20 if overlap else 0
                common.extend(overlap)
            conv = conversations.get(member.pk)
            link = "none"
            if conv and conv.introduction_by_id:
                link = "mutual" if conv.consent == "accepted" else "sent" if conv.introduction_by_id == request.user.pk else "incoming" if conv.consent == "pending" else "declined"
            rows.append({"id": str(member.pk), "anketa": public, "here": profile["here"], "link": link,
                         "chat_id": conv.pk if conv else None, "can_write": link == "mutual",
                         "note": conv.messages.first().text if conv and conv.introduction_by_id and conv.messages.exists() else "",
                         "parts": parts, "score": sum(parts.values()), "match": sum(parts.values()), "common": common,
                         "plans": None, "unread": conv.messages.filter(read_at__isnull=True).exclude(sender=request.user).count() if conv else 0})
        return Response({"list": sorted(rows, key=lambda r: -r["score"]), "me": mine, "links": []})
