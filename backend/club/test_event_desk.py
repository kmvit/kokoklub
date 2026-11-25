from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from members.models import Event, ResidentBooking, User, account_balance
from .models import FoodRedemption, OrganizerReward


class EventDeskTests(TestCase):
    def setUp(self):
        self.member = User.objects.create_user("79001230987")
        self.staff = User.objects.create_user("79001230986", is_staff=True)
        self.event = Event.objects.create(title="Событие", starts_at=timezone.now(), organizer=self.member, is_published=True)
        self.path = f"/api/staff/members/{self.member.pk}/event-desk/"
        self.api = APIClient()
        self.api.force_authenticate(self.staff)

    def post(self, action, pk, **kwargs):
        return self.api.post(self.path, {"action": action, "id": pk, **kwargs}, format="json")

    def test_reward_lifecycle_retries_and_food_restriction(self):
        self.assertEqual(self.post("organizer", self.event.pk).status_code, 200)
        self.post("organizer", self.event.pk)
        reward = OrganizerReward.objects.get()
        self.assertEqual(self.member.visits.count(), 1)
        self.assertEqual(account_balance(self.member), 0)
        ref = str(uuid4())
        for _ in range(2):
            state = self.post("food", reward.pk, reference=ref, amount=600)
            self.assertEqual(state.data["rewards"][0]["meal"], 400)
        self.assertEqual(FoodRedemption.objects.count(), 1)
        self.assertEqual(self.post("food", reward.pk, reference=str(uuid4()), amount=401).status_code, 409)
        self.assertEqual(self.post("invite", reward.pk).status_code, 409)
        for _ in range(2):
            self.assertEqual(self.post("complete", reward.pk).status_code, 200)
            self.assertEqual(self.post("invite", reward.pk).status_code, 200)
        self.assertEqual(self.post("visit", reward.pk).status_code, 409)
        self.member.visits.update(left_at=timezone.now())
        self.post("visit", reward.pk)
        self.post("visit", reward.pk)
        self.assertEqual(self.member.visits.count(), 2)

    def test_resident_booking_admission(self):
        place = ResidentBooking.objects.create(member=self.member, event=self.event, price=0)
        for _ in range(2):
            self.assertEqual(self.post("resident", place.pk).status_code, 200)
        self.assertEqual(self.member.visits.count(), 1)
        self.api.force_authenticate(self.member)
        self.assertEqual(self.post("resident", place.pk).status_code, 403)
        self.assertEqual(self.api.post(f"/api/me/reservations/{place.pk}/cancel/").status_code, 409)

    def test_cancelled_or_rescheduled_event(self):
        self.event.starts_at += timedelta(days=1)
        self.event.save()
        self.assertEqual(self.post("organizer", self.event.pk).status_code, 404)
        self.event.starts_at = timezone.now()
        self.event.cancelled_at = timezone.now()
        self.event.save()
        self.assertEqual(self.post("organizer", self.event.pk).status_code, 404)
