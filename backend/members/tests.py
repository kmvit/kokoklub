from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from club.models import Card

from .models import Activity, LoginCode, User
from .phone import normalize_phone


def make_member(phone="79001112233", name="Анна", card=True, **extra):
    user = User.objects.create_user(phone, full_name=name, consent_at=timezone.now(), **extra)
    if card:
        Card.objects.create(member=user, uid=f"04AA{phone[-8:]}")
    return user


class PhoneTests(TestCase):
    def test_formats(self):
        for raw in ["+7 (900) 123-45-67", "89001234567", "9001234567"]:
            self.assertEqual(normalize_phone(raw), "79001234567")
        with self.assertRaises(ValueError):
            normalize_phone("12345")


class SmsLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()

    def _request_code(self, phone="+7 900 111-22-33"):
        with mock.patch("members.auth.send_sms") as send, mock.patch("members.auth.secrets.randbelow", return_value=4321):
            res = self.api.post("/api/auth/code/", {"phone": phone}, format="json")
        return res, send

    def test_code_login_creates_account(self):
        res, send = self._request_code()
        self.assertEqual(res.status_code, 200)
        self.assertIn("4321", send.call_args.args[1])
        res = self.api.post("/api/auth/verify/", {"phone": "89001112233", "code": "4321"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertTrue(User.objects.filter(phone="79001112233").exists())
        # код одноразовый
        res = self.api.post("/api/auth/verify/", {"phone": "89001112233", "code": "4321"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_resend_throttled(self):
        self._request_code()
        res, send = self._request_code()
        self.assertEqual(res.status_code, 429)
        send.assert_not_called()

    def test_wrong_code_attempts_limited(self):
        self._request_code()
        for _ in range(5):
            res = self.api.post("/api/auth/verify/", {"phone": "79001112233", "code": "0000"}, format="json")
            self.assertEqual(res.data["detail"], "Неверный код")
        res = self.api.post("/api/auth/verify/", {"phone": "79001112233", "code": "4321"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(LoginCode.objects.get().attempts, 5)

    def test_staff_login_requires_staff(self):
        User.objects.create_user("79005550000", password="secret-pass-1")
        res = self.api.post("/api/auth/staff/", {"phone": "79005550000", "password": "secret-pass-1"}, format="json")
        self.assertEqual(res.status_code, 400)
        User.objects.filter(phone="79005550000").update(is_staff=True)
        res = self.api.post("/api/auth/staff/", {"phone": "79005550000", "password": "secret-pass-1"}, format="json")
        self.assertEqual(res.status_code, 200)


class ProfileTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def test_consent_required(self):
        user = User.objects.create_user("79001112233")
        self.api.force_authenticate(user)
        res = self.api.patch("/api/me/", {"full_name": "Анна"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.api.patch(
            "/api/me/",
            {"full_name": " Анна  Смирнова ", "consent": True, "hobbies": ["Йога", "йога ", "бег"],
             "telegram": "@anna_s", "activity": Activity.objects.first().pk},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["full_name"], "Анна Смирнова")
        self.assertEqual(sorted(res.data["hobbies"]), ["бег", "йога"])
        self.assertEqual(res.data["telegram"], "anna_s")
        self.assertTrue(res.data["profile_complete"])
        self.assertFalse(res.data["is_member"])


class CatalogTests(TestCase):
    def setUp(self):
        self.api = APIClient()

    def test_only_members_with_card_visible(self):
        visible = make_member("79001110001", "С картой")
        make_member("79001110002", "Без карты", card=False)
        make_member("79001110003", "Скрытый", is_hidden=True)
        res = self.api.get("/api/members/")
        self.assertEqual([m["id"] for m in res.data], [visible.pk])

    def test_contacts_only_for_members(self):
        target = make_member("79001110001", "Цель", telegram="target", show_phone=True)
        res = self.api.get(f"/api/members/{target.pk}/")
        self.assertIsNone(res.data["contacts"])
        self.api.force_authenticate(make_member("79001110002", "Член клуба"))
        res = self.api.get(f"/api/members/{target.pk}/")
        self.assertEqual(res.data["contacts"], {"phone": "+79001110001", "telegram": "target"})

    def test_filter_by_activity_and_search(self):
        design = Activity.objects.get(name="Дизайн")
        a = make_member("79001110001", "Анна", activity=design, can_help="сделаю сайт")
        make_member("79001110002", "Борис")
        self.assertEqual([m["id"] for m in self.api.get(f"/api/members/?activity={design.pk}").data], [a.pk])
        self.assertEqual([m["id"] for m in self.api.get("/api/members/?q=сайт").data], [a.pk])
