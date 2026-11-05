from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from club.models import Card

from .models import Activity, User
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


class BootstrapAdminTests(TestCase):
    def test_creates_admin_once_without_resetting_password(self):
        with mock.patch.dict("os.environ", {
            "BOOTSTRAP_ADMIN_PHONE": "89001234567",
            "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
            "BOOTSTRAP_ADMIN_PASSWORD": "long-unique-admin-password-2026",
        }):
            call_command("bootstrap_admin")
            admin = User.objects.get(phone="79001234567")
            self.assertTrue(admin.is_staff and admin.is_superuser)
            self.assertTrue(admin.check_password("long-unique-admin-password-2026"))
            admin.set_password("changed-after-first-login-2026")
            admin.save(update_fields=["password"])
            call_command("bootstrap_admin")
            admin.refresh_from_db()
            self.assertTrue(admin.check_password("changed-after-first-login-2026"))

    def test_does_not_promote_existing_member(self):
        User.objects.create_user("79001234567")
        with mock.patch.dict("os.environ", {
            "BOOTSTRAP_ADMIN_PHONE": "79001234567",
            "BOOTSTRAP_ADMIN_EMAIL": "admin@example.com",
            "BOOTSTRAP_ADMIN_PASSWORD": "long-unique-admin-password-2026",
        }):
            with self.assertRaises(CommandError):
                call_command("bootstrap_admin")
        self.assertFalse(User.objects.get(phone="79001234567").is_staff)


class EmailLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()

    def test_register_and_login(self):
        res = self.api.post("/api/auth/register/", {
            "email": " Guest@Example.com ", "phone": "+7 900 111-22-33",
            "password": "long-unique-member-password-2026", "consent": True,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertIn("access", res.data)
        user = User.objects.get(phone="79001112233")
        self.assertEqual(user.email, "guest@example.com")
        self.assertIsNotNone(user.consent_at)
        res = self.api.post("/api/auth/login/", {"email": "GUEST@example.com", "password": "long-unique-member-password-2026"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)

    def test_registration_requires_phone_and_rejects_duplicate(self):
        data = {"email": "guest@example.com", "password": "long-unique-member-password-2026", "consent": True}
        self.assertEqual(self.api.post("/api/auth/register/", data, format="json").status_code, 400)
        User.objects.create_user("79001112233")
        self.assertEqual(self.api.post("/api/auth/register/", {**data, "phone": "89001112233"}, format="json").status_code, 400)

    def test_wrong_password_is_rejected(self):
        User.objects.create_user("79001112233", email="guest@example.com", password="long-unique-member-password-2026")
        res = self.api.post("/api/auth/login/", {"email": "guest@example.com", "password": "wrong"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_staff_uses_same_login_and_admin_session(self):
        User.objects.create_superuser("79005550000", email="admin@example.com", password="long-unique-admin-password-2026")
        res = self.api.post("/api/auth/login/", {"email": "admin@example.com", "password": "long-unique-admin-password-2026"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.api.get("/admin/").status_code, 200)
        self.api.post("/api/auth/logout/", {}, format="json")
        self.assertEqual(self.api.get("/admin/").status_code, 302)


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
