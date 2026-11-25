from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from unittest import skipUnless
from uuid import uuid4

from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Event, TopUp, account_balance
from .tests import make_member


@skipUnless(connection.vendor == "postgresql", "Требуются блокировки PostgreSQL")
class BookingRaceTests(TransactionTestCase):
    def test_two_people_book_last_place(self):
        people = [make_member("79005551234"), make_member("79005554321")]
        event = Event.objects.create(title="Последнее место", starts_at=timezone.now() + timedelta(days=1),
                                     is_published=True, resident_price=500, resident_seats=1)
        for user in people:
            TopUp.objects.create(member=user, created_by=user, amount=500, reference=uuid4())
        gate = Barrier(2)

        def book(user):
            close_old_connections()
            try:
                api = APIClient()
                api.force_authenticate(user)
                gate.wait(timeout=10)
                return api.post(f"/api/events/{event.pk}/reserve/", {"price": 500}, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            codes = sorted(executor.map(book, people))
        self.assertEqual(codes, [201, 409])
        self.assertEqual(event.resident_bookings.count(), 1)
        self.assertEqual(sum(account_balance(user) for user in people), 500)
