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

    def test_admin_login_accepts_full_email_address(self):
        response = self.client.get("/admin/login/")
        self.assertContains(response, 'name="username" autofocus maxlength="254"')
        User.objects.create_superuser("79005550000", email="justscoundrel@yandex.ru", password="long-unique-admin-password-2026")
        response = self.client.post("/admin/login/", {
            "username": "justscoundrel@yandex.ru", "password": "long-unique-admin-password-2026",
        })
        self.assertEqual(response.status_code, 302)


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

    def test_guests_cannot_read_profiles(self):
        target = make_member()
        for path in ["/api/members/", f"/api/members/{target.pk}/", "/api/projects/", "/api/me/account/"]:
            self.assertEqual(self.api.get(path).status_code, 401)

    def test_registered_profiles_visible_without_card(self):
        visible = make_member("79001110001", "С картой")
        no_card = make_member("79001110002", "Без карты", card=False)
        make_member("79001110003", "Скрытый", is_hidden=True)
        self.api.force_authenticate(no_card)
        res = self.api.get("/api/members/")
        self.assertCountEqual([m["id"] for m in res.data], [visible.pk, no_card.pk])

    def test_contacts_only_for_members(self):
        target = make_member("79001110001", "Цель", telegram="target", show_phone=True)
        res = self.api.get(f"/api/members/{target.pk}/")
        self.assertEqual(res.status_code, 401)
        self.api.force_authenticate(make_member("79001110002", "Член клуба", card=False))
        res = self.api.get(f"/api/members/{target.pk}/")
        self.assertEqual(res.data["contacts"], {"phone": "+79001110001", "telegram": "target"})

    def test_filter_by_activity_and_search(self):
        self.api.force_authenticate(make_member("79001110009", "Зритель", card=False))
        design = Activity.objects.get(name="Дизайн")
        a = make_member("79001110001", "Анна", activity=design, can_help="сделаю сайт")
        make_member("79001110002", "Борис")
        self.assertEqual([m["id"] for m in self.api.get(f"/api/members/?activity={design.pk}").data], [a.pk])
        self.assertEqual([m["id"] for m in self.api.get("/api/members/?q=сайт").data], [a.pk])


class ClubStructureTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.member = make_member(card=False)
        self.staff = User.objects.create_user("79001112234", is_staff=True)

    def test_public_afisha_only_published_upcoming_events(self):
        from datetime import timedelta
        from .models import Event
        now = timezone.now()
        visible = Event.objects.create(title="Встреча", starts_at=now + timedelta(days=1), is_published=True)
        Event.objects.create(title="Черновик", starts_at=now + timedelta(days=2))
        Event.objects.create(title="Прошлое", starts_at=now - timedelta(days=1), is_published=True)
        res = self.api.get("/api/events/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([event["id"] for event in res.data], [visible.pk])

    def test_projects_saved_through_profile_and_hidden_with_owner(self):
        self.api.force_authenticate(self.member)
        payload = {"projects": [{"title": "Мастерская", "description": "Делаем мебель", "url": "https://example.com"}]}
        res = self.api.patch("/api/me/", payload, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        res = self.api.get("/api/projects/")
        self.assertEqual(res.data[0]["owner"]["id"], self.member.pk)
        self.assertEqual(res.data[0]["title"], "Мастерская")
        self.member.is_hidden = True
        self.member.save()
        self.assertEqual(self.api.get("/api/projects/").data, [])
        self.api.patch("/api/me/", {"projects": []}, format="json")
        self.assertFalse(self.member.projects.exists())

    def test_project_gallery_survives_profile_edits_and_only_owner_can_change_it(self):
        from io import BytesIO
        from tempfile import TemporaryDirectory

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        self.api.force_authenticate(self.member)
        project = self.member.projects.create(title="Галерея")
        image = BytesIO()
        Image.new("RGB", (24, 24)).save(image, "PNG")
        gallery = f"/api/me/projects/{project.pk}/images/"
        detail = f"/api/projects/{project.pk}/"
        with TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            for _ in range(2):
                upload = SimpleUploadedFile("art.png", image.getvalue(), content_type="image/png")
                response = self.api.post(gallery, {"photo": upload}, format="multipart")
                self.assertEqual(response.status_code, 201, response.data)
            cover = response.data[1]["id"]
            response = self.api.patch(f"{gallery}{cover}/", {}, format="json")
            self.assertEqual(response.data[0]["id"], cover)
            response = self.api.patch("/api/me/", {"projects": [{
                "id": project.pk, "title": "Новая галерея", "directions": ["Живопись", "Дизайн"],
                "links": [{"label": "Портфолио", "url": "https://example.com"}],
            }]}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.api.force_authenticate(self.staff)
            response = self.api.get(detail)
            self.assertEqual(response.data["title"], "Новая галерея")
            self.assertEqual(response.data["directions"], ["Живопись", "Дизайн"])
            self.assertEqual(response.data["links"][0]["label"], "Портфолио")
            self.assertEqual(response.data["images"][0]["id"], cover)
            self.assertEqual(self.api.delete(f"{gallery}{cover}/").status_code, 404)
            self.api.force_authenticate(None)
            self.assertEqual(self.api.get(detail).status_code, 401)

    def test_invalid_projects_leave_existing_profile_unchanged(self):
        from .models import Project
        Project.objects.create(owner=self.member, title="Оригинал")
        self.api.force_authenticate(self.member)
        res = self.api.patch("/api/me/", {"full_name": "Новое имя", "projects": [{"title": "X", "url": "javascript:alert(1)"}]}, format="json")
        self.assertEqual(res.status_code, 400)
        self.member.refresh_from_db()
        self.assertEqual(self.member.full_name, "Анна")
        self.assertEqual(self.member.projects.get().title, "Оригинал")

    def test_staff_cash_topup_is_idempotent_and_private(self):
        from uuid import uuid4
        from .models import TopUp
        self.api.force_authenticate(self.staff)
        Card.objects.create(member=self.member, uid="53FB5119230001")
        lookup = self.api.post("/api/staff/card-lookup/", {"uid": "53:FB:51:19:23:00:01"}, format="json")
        self.assertEqual(lookup.data["id"], self.member.pk)
        self.assertEqual(lookup.data["balance"], "0.00")
        payload = {"amount": "1500.50", "reference": str(uuid4()), "payment_received": True}
        path = f"/api/staff/members/{self.member.pk}/topups/"
        self.assertEqual(self.api.post(path, payload, format="json").status_code, 201)
        self.assertEqual(self.api.post(path, payload, format="json").status_code, 200)
        self.assertEqual(TopUp.objects.count(), 1)
        self.assertEqual(self.api.post(path, {**payload, "amount": "2000"}, format="json").status_code, 409)
        self.api.force_authenticate(self.member)
        res = self.api.get("/api/me/account/")
        self.assertEqual(res.data["balance"], "1500.50")
        self.assertEqual(len(res.data["topups"]), 1)
        self.assertEqual(self.api.post(path, payload, format="json").status_code, 403)
        self.api.patch("/api/me/", {"balance": "999999"}, format="json")
        self.assertEqual(self.api.get("/api/me/account/").data["balance"], "1500.50")
        self.api.force_authenticate(make_member("79001112235", card=False))
        self.assertEqual(self.api.get("/api/me/account/").data["balance"], "0.00")
        self.assertEqual(self.api.get("/api/me/account/").data["topups"], [])

    def test_topup_requires_valid_amount_and_cash_confirmation(self):
        from uuid import uuid4
        from .models import TopUp
        self.api.force_authenticate(self.staff)
        path = f"/api/staff/members/{self.member.pk}/topups/"
        for amount in ["0", "-1", "NaN", "1.001", "1000001"]:
            res = self.api.post(path, {"amount": amount, "reference": str(uuid4()), "payment_received": True}, format="json")
            self.assertEqual(res.status_code, 400)
        self.assertEqual(self.api.post(path, {"amount": "100", "reference": str(uuid4()), "payment_received": False}, format="json").status_code, 400)
        self.assertFalse(TopUp.objects.exists())
