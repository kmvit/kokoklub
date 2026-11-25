from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from club.models import MembershipSale
from .models import Event, TopUp, account_balance
from .tests import make_member


class ReservationTests(TestCase):
    def setUp(self):
        self.member = make_member()
        self.other = make_member("79009994422")
        self.api = APIClient()
        self.api.force_authenticate(self.member)
        self.event = Event.objects.create(title="Вечер", is_published=True, starts_at=timezone.now() + timedelta(days=2),
                                          resident_seats=1, resident_price=750)
        self.url = f"/api/events/{self.event.pk}/reserve/"
        for member in (self.member, self.other):
            TopUp.objects.create(member=member, created_by=self.other, amount=1000, reference=uuid4())

    def reserve(self, price=750):
        return self.api.post(self.url, {"price": price}, format="json")

    def test_last_seat_retry_and_early_refund(self):
        self.assertEqual(self.reserve(500).status_code, 409)
        self.assertEqual(self.reserve().status_code, 201)
        repeat = self.reserve()
        self.assertEqual(repeat.data["balance"], "250.00")
        booking = self.member.resident_bookings.get()
        cancel = f"/api/me/reservations/{booking.pk}/cancel/"
        self.api.force_authenticate(self.other)
        self.assertEqual(self.reserve().status_code, 409)
        self.assertEqual(self.api.post(cancel).status_code, 404)
        self.api.force_authenticate(self.member)
        self.event.resident_price = 900
        self.event.save()
        for _ in range(2):
            self.assertEqual(self.api.post(cancel).data["balance"], "1000.00")
        history = self.api.get("/api/me/account/").data
        self.assertEqual(history["charges"][0]["price"], 750)
        self.assertEqual(history["refunds"][0]["price"], 750)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.reserve(900).status_code, 201)

    def test_exactly_one_day_before_start_no_refund(self):
        self.reserve()
        booking = self.member.resident_bookings.get()
        with patch("members.bookings.timezone.now", return_value=self.event.starts_at - timedelta(hours=24)):
            result = self.api.post(f"/api/me/reservations/{booking.pk}/cancel/")
        self.assertEqual(result.data, {"balance": "250.00", "places": [], "visits": 0, "invites": 0, "guest_events": []})

    def test_insufficient_balance_or_membership(self):
        self.event.resident_price = 1500
        self.event.save()
        self.assertEqual(self.reserve(1500).status_code, 409)
        MembershipSale.objects.create(member=self.member, cashier=self.other, paid=1500,
                                      starts_at=timezone.now(), ends_at=self.event.starts_at)
        self.assertEqual(self.reserve(1500).status_code, 403)
        self.assertEqual(account_balance(self.member), 1000)
        self.assertFalse(self.member.resident_bookings.exists())
