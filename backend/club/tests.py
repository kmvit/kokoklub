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
        self.assertFalse(Card.objects.get(member=self.guest, uid="53FB5119230001").is_active)

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

    def test_card_lookup_does_not_change_visit(self):
        card = Card.objects.create(member=self.guest, uid="53FB5119230001")
        visit = Visit.objects.create(member=self.guest, card=card)
        res = self.api.post("/api/staff/card-lookup/", {"uid": "53:fb:51:19:23:00:01"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.guest.pk)
        self.assertTrue(res.data["in_club"])
        visit.refresh_from_db()
        self.assertIsNone(visit.left_at)
        self.assertEqual(self.api.get(f"/api/staff/members/{self.guest.pk}/").data["id"], self.guest.pk)

    def test_card_lookup_requires_staff_and_active_card(self):
        card = Card.objects.create(member=self.guest, uid="53FB5119230001", is_active=False)
        self.assertEqual(self.api.post("/api/staff/card-lookup/", {"uid": card.uid}, format="json").status_code, 404)
        card.is_active = True
        card.save(update_fields=["is_active"])
        api = APIClient()
        api.force_authenticate(self.guest)
        self.assertEqual(api.post("/api/staff/card-lookup/", {"uid": card.uid}, format="json").status_code, 403)
        self.assertEqual(api.get(f"/api/staff/members/{self.guest.pk}/").status_code, 403)

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


class MembershipSaleTests(TestCase):
    def test_paid_visit_offsets_one_sale(self):
        staff = User.objects.create_user("79009992222", is_staff=True)
        guest = User.objects.create_user("79009993333")
        api = APIClient()
        api.force_authenticate(staff)
        url = f"/api/staff/members/{guest.pk}/membership/"
        self.assertEqual(api.get(url).data["due"], 1500)
        entry = api.post(url, {"action": "entry"}, format="json").data
        self.assertEqual(entry["due"], 500)
        api.post(url, {"action": "entry"}, format="json")
        self.assertEqual(guest.visits.count(), 1)
        purchase = {"action": "month", "entry_id": entry["entry_id"], "paid": 500}
        self.assertEqual(api.post(url, purchase, format="json").status_code, 200)
        api.post(url, purchase, format="json")
        self.assertEqual(guest.membership_sales.count(), 1)
        self.assertTrue(guest.is_member)

    def test_prior_day_payment_and_expired_quote(self):
        staff = User.objects.create_user("79009992222", is_staff=True)
        guest = User.objects.create_user("79009993333")
        api = APIClient()
        url = f"/api/staff/members/{guest.pk}/membership/"
        api.force_authenticate(guest)
        self.assertEqual(api.post(url, {"action": "entry"}).status_code, 403)
        api.force_authenticate(staff)
        entry = api.post(url, {"action": "entry"}, format="json").data
        guest.visits.update(entered_at=timezone.now() - timedelta(days=1))
        self.assertEqual(api.get(url).data["due"], 1500)
        purchase = {"action": "month", "entry_id": entry["entry_id"], "paid": 500}
        self.assertEqual(api.post(url, purchase, format="json").status_code, 409)
        self.assertFalse(guest.is_member)

    def test_longer_tariffs_keep_the_quoted_price_and_duration(self):
        staff = User.objects.create_user("79009994444", is_staff=True)
        api = APIClient()
        api.force_authenticate(staff)
        for code, full, days, phone in [
            ("half", 7500, 182, "79009995555"),
            ("year", 15000, 365, "79009996666"),
        ]:
            with self.subTest(code=code):
                guest = User.objects.create_user(phone)
                url = f"/api/staff/members/{guest.pk}/membership/"
                self.assertEqual(api.get(url).data["tariffs"][code]["due"], full)
                quote = api.post(url, {"action": "entry"}, format="json").data
                purchase = {"action": code, "entry_id": quote["entry_id"], "paid": full - 1000}
                self.assertEqual(api.post(url, {**purchase, "paid": 500}, format="json").status_code, 409)
                for _ in range(2):
                    self.assertEqual(api.post(url, purchase, format="json").status_code, 200)
                sale = guest.membership_sales.get()
                self.assertEqual((sale.tariff, sale.paid), (code, full - 1000))
                self.assertEqual(sale.ends_at - sale.starts_at, timedelta(days=days))
                self.assertEqual(api.post(url, {**purchase, "action": "month"}, format="json").status_code, 409)
