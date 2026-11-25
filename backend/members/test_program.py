from datetime import timedelta
from uuid import uuid4

from django.contrib.admin.sites import AdminSite
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from club.models import GuestBooking, MembershipSale
from .admin import EventAdmin
from .models import Event, MeetingProposal, Recording, ResidentBooking, TopUp, account_balance
from .tests import make_member


class CommunityProgramTests(TestCase):
    def setUp(self):
        self.resident = make_member()
        self.guest = make_member("79001112244", card=False)
        self.api = APIClient()

    def test_request_to_program_interest_is_not_a_booking(self):
        proposal = self.api.post("/api/proposals/", {"title": "Винил", "description": "Слушаем пластинку", "contact": "Ирина"})
        self.assertEqual(proposal.status_code, 201)
        idea = MeetingProposal.objects.get()
        self.assertFalse(self.api.get("/api/proposals/").data["ideas"])
        idea.stage = "open"
        idea.save()
        self.api.force_authenticate(self.guest)
        url = f"/api/proposals/{idea.pk}/interest/"
        self.assertEqual(self.api.post(url, {"interested": True}, format="json").status_code, 403)
        self.api.force_authenticate(self.resident)
        for _ in range(2):
            self.assertEqual(self.api.post(url, {"interested": True}, format="json").data["interest"], 1)
        self.assertFalse(Event.objects.exists())
        self.assertNotIn("contact", self.api.get("/api/proposals/").data["ideas"][0])

    def test_recording_access_purchase_and_poll(self):
        rec = Recording.objects.create(title="Концерт", url="https://example.org/concert", price=300, published=True)
        self.api.force_authenticate(self.guest)
        self.assertIsNone(self.api.get("/api/recordings/").data[0]["url"])
        url = f"/api/recordings/{rec.pk}/purchase/"
        self.assertEqual(self.api.post(url, {"price": 300}, format="json").status_code, 409)
        TopUp.objects.create(member=self.guest, created_by=self.resident, amount=500, reference=uuid4())
        for _ in range(2):
            self.assertEqual(self.api.post(url, {"price": 300}, format="json").data["url"], rec.url)
        self.assertEqual(account_balance(self.guest), 200)
        self.assertEqual(self.api.get("/api/feed/").status_code, 403)
        self.api.force_authenticate(self.resident)
        self.assertEqual(self.api.get("/api/recordings/").data[0]["url"], rec.url)
        self.api.post(url, {"price": 300}, format="json")
        self.assertFalse(self.resident.recording_purchases.exists())
        self.assertEqual(self.api.post("/api/feed/", {"text": "Послушаем джаз?", "kind": "poll"}).status_code, 201)
        poll_id = self.api.get("/api/feed/").data[0]["id"]
        for vote in [True, True, False]:
            self.assertEqual(self.api.post(f"/api/feed/{poll_id}/vote/", {"support": vote}, format="json").status_code, 204)
        poll = self.api.get("/api/feed/").data[0]
        self.assertEqual((poll["yes"], poll["no"]), (0, 1))

    def test_club_cancellation_restores_both_balances_once(self):
        now = timezone.now()
        sale = MembershipSale.objects.create(member=self.resident, cashier=self.guest, paid=1500,
                                             starts_at=now, ends_at=now + timedelta(days=30))
        event = Event.objects.create(title="Вечер", starts_at=now + timedelta(hours=2), is_published=True)
        TopUp.objects.create(member=self.resident, created_by=self.guest, amount=500, reference=uuid4())
        ResidentBooking.objects.create(member=self.resident, event=event, price=500)
        GuestBooking.objects.create(sale=sale, event=event)
        admin = EventAdmin(Event, AdminSite())
        from unittest.mock import patch
        with patch.object(admin, "message_user"):
            for _ in range(2):
                admin.cancel_events(None, Event.objects.filter(pk=event.pk))
        self.assertEqual(account_balance(self.resident), 500)
        self.assertEqual(sale.invites_left, 1)
        self.assertFalse(self.api.get("/api/events/").data)

    def test_weekly_series_uses_the_requested_number_of_dates(self):
        from django.test import RequestFactory
        from .admin import EventForm
        date = timezone.localtime() + timedelta(days=2)
        form = EventForm(data={"title": "Разговор", "starts_at": date.isoformat(), "weekly_count": 3,
                               "resident_seats": 4, "invite_seats": 2, "guest_seats": 0, "guest_extra": 0,
                               "resident_price": 500, "is_published": True})
        self.assertTrue(form.is_valid(), form.errors)
        admin = EventAdmin(Event, AdminSite())
        admin.save_model(RequestFactory().post("/"), form.save(commit=False), form, False)
        events = list(Event.objects.filter(title="Разговор").order_by("starts_at"))
        self.assertEqual(len(events), 3)
        self.assertEqual(events[-1].starts_at - events[0].starts_at, timedelta(days=14))
