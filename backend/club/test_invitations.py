from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from members.models import Event, User
from .models import MembershipSale


class InvitationTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.member = User.objects.create_user("79009996677")
        self.other = User.objects.create_user("79009996678")
        self.sale = MembershipSale.objects.create(
            member=self.member, cashier=self.other, starts_at=self.now,
            ends_at=self.now + timedelta(days=30), paid=1500,
        )
        self.event = Event.objects.create(title="Встреча", starts_at=self.now + timedelta(days=3),
                                          invite_seats=1, is_published=True)
        self.url = f"/api/events/{self.event.pk}/guest-place/"
        self.api = APIClient()
        self.api.force_authenticate(self.member)

    def test_booking_and_early_cancellation_can_be_retried(self):
        result = self.api.post(self.url)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data["left"], 0)
        self.assertEqual(self.api.post(self.url).data, result.data)
        cancel = f'/api/me/invitations/{result.data["bookings"][0]["id"]}/cancel/'
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.post(cancel).status_code, 404)
        self.api.force_authenticate(self.member)
        self.assertEqual(self.api.post(cancel).data["left"], 1)
        self.assertEqual(self.api.post(self.url).status_code, 201)
        self.assertEqual(self.api.post(cancel).data["left"], 0)

    def test_late_cancellation_releases_only_the_place(self):
        result = self.api.post(self.url)
        cancel = f'/api/me/invitations/{result.data["bookings"][0]["id"]}/cancel/'
        with patch("club.invitations.timezone.now", return_value=self.event.starts_at - timedelta(hours=24)):
            self.assertEqual(self.api.post(cancel).data["left"], 0)
        self.assertFalse(self.event.guest_bookings.filter(cancelled_at__isnull=True).exists())

    def test_zero_quota_and_missing_membership(self):
        self.event.invite_seats = 0
        self.event.save()
        self.assertEqual(self.api.post(self.url).status_code, 409)
        self.assertEqual(self.sale.invites_left, 1)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.post(self.url).status_code, 403)

    def test_staff_checkin_preserves_original_arrival_and_prevents_cancellation(self):
        self.event.starts_at = timezone.localtime(self.event.starts_at).replace(hour=18)
        self.event.save(update_fields=["starts_at"])
        result = self.api.post(self.url)
        booking_id = result.data["bookings"][0]["id"]
        listing = f"/api/staff/members/{self.member.pk}/guest-arrivals/"
        checkin = f"{listing}{booking_id}/"
        self.assertEqual(self.api.post(checkin).status_code, 403)
        staff = User.objects.create_user("79009996679", is_staff=True)
        self.api.force_authenticate(staff)
        self.assertEqual(self.api.get(listing).data, [])
        self.assertEqual(self.api.post(checkin).status_code, 404)
        with patch("club.invitations.timezone.now", return_value=self.event.starts_at - timedelta(minutes=1)):
            self.assertEqual(self.api.get(listing).data[0]["id"], booking_id)
            first = self.api.post(checkin).data
            self.assertFalse(first["already_arrived"])
            again = self.api.post(checkin).data
            self.assertTrue(again["already_arrived"])
            self.assertEqual(first["arrived_at"], again["arrived_at"])
            self.api.force_authenticate(self.member)
            self.assertEqual(self.api.post(f"/api/me/invitations/{booking_id}/cancel/").status_code, 409)
        self.assertEqual(self.event.guest_bookings.get().checked_in_by, staff)
        self.assertEqual(self.sale.invites_left, 0)

    def test_cancelled_booking_cannot_be_used_for_entry(self):
        booking_id = self.api.post(self.url).data["bookings"][0]["id"]
        self.api.post(f"/api/me/invitations/{booking_id}/cancel/")
        self.event.starts_at = self.now
        self.event.save()
        staff = User.objects.create_user("79009996679", is_staff=True)
        self.api.force_authenticate(staff)
        path = f"/api/staff/members/{self.member.pk}/guest-arrivals/"
        self.assertEqual(self.api.get(path).data, [])
        self.assertEqual(self.api.post(f"{path}{booking_id}/").status_code, 404)
