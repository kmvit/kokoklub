from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from members.models import User

from .models import Card, Visit, normalize_uid


class UidTests(TestCase):
    def test_formats(self):
        self.assertEqual(normalize_uid("53:FB:51:19:23:00:01"), "53FB5119230001")
        self.assertEqual(normalize_uid("53fb5119230001\n"), "53FB5119230001")
        with self.assertRaises(ValueError):
            normalize_uid("12")


class StaffTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.staff = User.objects.create_user("79009990000", password="x", is_staff=True)
        self.api.force_authenticate(self.staff)
        self.guest = User.objects.create_user("79001112233", full_name="Гость", consent_at=timezone.now())

    def test_staff_only(self):
        api = APIClient()
        api.force_authenticate(self.guest)
        self.assertEqual(api.get("/api/staff/inside/").status_code, 403)

    def test_bind_and_rebind_card(self):
        res = self.api.post(f"/api/staff/members/{self.guest.pk}/card/", {"uid": "53:FB:51:19:23:00:01"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["card"]["uid"], "53FB5119230001")
        # потерял карту — новая заменяет старую
        res = self.api.post(f"/api/staff/members/{self.guest.pk}/card/", {"uid": "53FB5119230002"}, format="json")
        self.assertEqual(res.data["card"]["uid"], "53FB5119230002")
        self.assertEqual(Card.objects.filter(member=self.guest, is_active=True).count(), 1)

    def test_card_of_another_member_rejected(self):
        other = User.objects.create_user("79001112244")
        Card.objects.create(member=other, uid="53FB5119230001")
        res = self.api.post(f"/api/staff/members/{self.guest.pk}/card/", {"uid": "53FB5119230001"}, format="json")
        self.assertEqual(res.status_code, 409)

    def test_scan_toggles_enter_exit(self):
        Card.objects.create(member=self.guest, uid="53FB5119230001")
        res = self.api.post("/api/staff/scan/", {"uid": "53fb5119230001"}, format="json")
        self.assertEqual(res.data["action"], "enter")
        self.assertEqual(len(self.api.get("/api/staff/inside/").data), 1)
        res = self.api.post("/api/staff/scan/", {"uid": "53fb5119230001"}, format="json")
        self.assertEqual(res.data["action"], "exit")
        self.assertEqual(self.api.get("/api/staff/inside/").data, [])

    def test_unknown_card(self):
        res = self.api.post("/api/staff/scan/", {"uid": "53FB5119230009"}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_yesterday_visit_not_inside(self):
        card = Card.objects.create(member=self.guest, uid="53FB5119230001")
        Visit.objects.create(member=self.guest, card=card, entered_at=timezone.now() - timedelta(days=2))
        self.assertEqual(self.api.get("/api/staff/inside/").data, [])
        res = self.api.post("/api/staff/scan/", {"uid": "53FB5119230001"}, format="json")
        self.assertEqual(res.data["action"], "enter")

    def test_create_guest_requires_consent(self):
        res = self.api.post("/api/staff/members/", {"phone": "89005556677", "full_name": "Пётр"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.api.post(
            "/api/staff/members/", {"phone": "89005556677", "full_name": "Пётр", "consent": True}, format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["phone"], "79005556677")
