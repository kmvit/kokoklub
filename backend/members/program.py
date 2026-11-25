from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MeetingProposal


class ProposalInput(serializers.ModelSerializer):
    class Meta:
        model = MeetingProposal
        fields = ["title", "description", "contact"]


def open_ideas(user):
    rows = MeetingProposal.objects.filter(stage="open", event__isnull=True).annotate(
        interest=Count("interested")).order_by("-created_at")
    selected = set(user.meeting_interests.values_list("pk", flat=True)) if user.is_authenticated else set()
    return [{"id": row.pk, "ts": row.created_at, "title": row.title, "description": row.description,
             "interest": row.interest, "selected": row.pk in selected} for row in rows]


class ProposalsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        mine = []
        if request.user.is_authenticated:
            mine = list(MeetingProposal.objects.filter(author=request.user).values("title", "stage", "review", "event_id"))
        return Response({"ideas": open_ideas(request.user), "mine": mine})

    def post(self, request):
        data = ProposalInput(data=request.data)
        data.is_valid(raise_exception=True)
        proposal = data.save(author=request.user if request.user.is_authenticated else None)
        return Response({"id": proposal.pk}, status=201)


class InterestView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        if not request.user.is_member:
            return Response({"detail": "Выбирать встречи могут резиденты."}, status=403)
        proposal = get_object_or_404(MeetingProposal.objects.select_for_update(), pk=pk, stage="open", event__isnull=True)
        if request.data.get("interested") is True:
            proposal.interested.add(request.user)
        elif request.data.get("interested") is False:
            proposal.interested.remove(request.user)
        else:
            return Response({"detail": "Укажите свой выбор."}, status=400)
        return Response({"interest": proposal.interested.count(), "selected": request.data["interested"]})
