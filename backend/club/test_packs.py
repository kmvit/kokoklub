from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from members.models import Event, PartnerCode, TopUp, User, account_balance
from .models import EntryPayment, GuestBooking, MembershipSale, VisitPack


class VisitPackTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.member = User.objects.create_user("79005551234")
        self.staff = User.objects.create_user("79005554321", is_staff=True)
        self.sale = MembershipSale.objects.create(member=self.member, cashier=self.staff, starts_at=now,
                                                 ends_at=now + timedelta(days=30), paid=1500)
        self.event = Event.objects.create(title="Вечер", starts_at=now + timedelta(days=3), is_published=True,
                                         resident_price=750, resident_seats=1, invite_seats=1, accepts_pack=True)
        self.api = APIClient()
        self.api.force_authenticate(self.member)
        self.path = f"/api/events/{self.event.pk}/reserve/"
        TopUp.objects.create(member=self.member, created_by=self.staff, amount=2000, reference=uuid4())

    def test_pack_plus_guest_and_partial_cancellation(self):
        pack = VisitPack.objects.create(title="Три визита", visits=3, price=1500, available=True)
        order = {"id": pack.pk, "visits": 3, "price": 1500, "reference": str(uuid4())}
        for _ in range(2):
            self.assertEqual(self.api.post("/api/me/visit-packs/", order, format="json").data["left"], 3)
        self.assertEqual(account_balance(self.member), 500)
        for _ in range(2):
            self.assertEqual(self.api.post(self.path, {"use_pack": True, "plus_guest": True, "price": 0}, format="json").data["visits"], 2)
        guest = GuestBooking.objects.get()
        self.assertEqual(self.sale.invites_left, 0)
        self.api.post(f"/api/me/invitations/{guest.pk}/cancel/")
        self.assertEqual(self.sale.invites_left, 1)
        self.assertEqual(self.sale.visits_left, 2)
        self.assertTrue(self.member.resident_bookings.filter(cancelled_at__isnull=True).exists())

    def test_failed_second_place_rolls_back_first(self):
        self.event.invite_seats = 0
        self.event.save()
        response = self.api.post(self.path, {"plus_guest": True, "price": 750}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(account_balance(self.member), 2000)
        self.assertFalse(self.member.resident_bookings.exists())

    def test_additional_invitation_paid_and_refunded(self):
        path = f"/api/events/{self.event.pk}/guest-place/"
        booking = self.api.post(path, {"payment": "tokens", "price": 750}, format="json").data["bookings"][0]
        self.assertEqual(account_balance(self.member), 1250)
        self.api.post(f'/api/me/invitations/{booking["id"]}/cancel/')
        self.assertEqual(account_balance(self.member), 2000)
        self.assertEqual(self.sale.invites_left, 1)

    def test_partner_code_credit_is_only_the_paid_entry_after_checkin(self):
        guest = User.objects.create_user("79005559876")
        TopUp.objects.create(member=guest, created_by=self.staff, amount=2000, reference=uuid4())
        today = timezone.localtime().replace(hour=23, minute=59, second=59)
        if today <= timezone.now():
            today += timedelta(days=1)
        self.event.starts_at, self.event.organizer = today, self.member
        self.event.guest_seats, self.event.guest_extra = 1, 200
        self.event.save()
        PartnerCode.objects.create(event=self.event, code="concert", limit=1)
        self.api.force_authenticate(guest)
        from unittest.mock import patch
        with patch("members.bookings.timezone.now", return_value=today - timedelta(minutes=5)):
            self.assertEqual(self.api.post(self.path, {"code": "concert", "price": 950}, format="json").status_code, 201)
        self.assertFalse(EntryPayment.objects.exists())
        self.api.force_authenticate(self.staff)
        booking = guest.resident_bookings.get()
        with patch("club.event_desk.timezone.now", return_value=today):
            self.assertEqual(self.api.post(f"/api/staff/members/{guest.pk}/event-desk/", {"action": "resident", "id": booking.pk}, format="json").status_code, 200)
        self.assertEqual(EntryPayment.objects.get().amount, 750)

    def test_walkin_price_stays_paid_after_1300_and_on_repeat_scan(self):
        from unittest.mock import patch
        day = timezone.localtime().replace(hour=11, minute=0, second=0)
        self.sale.starts_at = day - timedelta(days=1)
        self.sale.save()
        self.api.force_authenticate(self.staff)
        url = f"/api/staff/members/{self.member.pk}/event-desk/"
        with patch("club.event_desk.timezone.now", return_value=day):
            data = {"action": "day", "amount": 500, "day": day.date().isoformat()}
            self.assertEqual(self.api.post(url, data, format="json").status_code, 200)
            self.assertEqual(account_balance(self.member), 1500)
        with patch("club.event_desk.timezone.now", return_value=day + timedelta(hours=3)):
            self.assertEqual(self.api.post(url, data, format="json").status_code, 200)
            self.assertEqual(self.member.walkins.count(), 1)
            self.assertEqual(account_balance(self.member), 1500)

        with patch("club.event_desk.timezone.now", return_value=day + timedelta(days=1)):
            self.assertEqual(self.api.post(url, data, format="json").status_code, 409)
            data["day"] = (day + timedelta(days=1)).date().isoformat()
            self.assertEqual(self.api.post(url, data, format="json").data["balance"], "1000.00")
            self.assertEqual(self.member.walkins.count(), 2)

    def test_guest_walkin_debits_once_and_credits_membership(self):
        self.sale.delete()
        self.api.force_authenticate(self.staff)
        url = f"/api/staff/members/{self.member.pk}/event-desk/"
        walkin = self.api.get(url).data["walkin"]
        self.assertEqual(walkin["price"], 1000)
        data = {"action": "day", "amount": 1000, "day": walkin["day"]}
        for _ in range(2):
            result = self.api.post(url, data)
            self.assertEqual(result.data["balance"], "1000.00")
            self.assertTrue(result.data["walkin"]["paid"])
        self.assertEqual(self.member.walkins.count(), 1)
        membership = self.api.get(f"/api/staff/members/{self.member.pk}/membership/")
        self.assertEqual(membership.data["due"], 500)
