from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from club.models import GuestBooking, MembershipSale
from .models import DiscussionReply, Event, OnlinePayment, ShopOrder, ShopProduct, ShelfBallot, ShelfItem, TopUp, User, account_balance
from .payments import signature
from .tests import make_member


class OriginalSiteTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.member = make_member()
        self.other = make_member("79001111022")
        self.staff = User.objects.create_user("79001111033", is_staff=True)
        self.api.force_authenticate(self.member)
        now = timezone.now()
        self.sale = MembershipSale.objects.create(member=self.member,cashier=self.staff,paid=1500,
            starts_at=now,ends_at=now+timedelta(days=30),included_visits=2)
        self.event = Event.objects.create(title="Встреча",starts_at=now+timedelta(days=3),is_published=True,
            resident_price=500,resident_seats=2,invite_seats=1,accepts_pack=True)
        TopUp.objects.create(member=self.member,created_by=self.staff,amount=1000,reference=uuid4())

    def post(self,path,data=None):
        return self.api.post("/api/"+path,data or {},format="json")

    def test_independent_places_and_resource_history(self):
        self.assertEqual(self.post(f"events/{self.event.pk}/reserve/",{"price":0,"use_pack":True,"plus_guest":True}).status_code,201)
        guest = GuestBooking.objects.get()
        ticket = self.post(f"me/invitations/{guest.pk}/link/").data["ticket"]
        self.api.force_authenticate(self.other)
        self.assertEqual(self.post(f"tickets/{ticket}/").status_code,403)
        self.assertEqual(self.post(f"me/invitations/{guest.pk}/cancel/").status_code,404)
        self.api.force_authenticate(self.staff)
        url = f"/api/staff/members/{self.member.pk}/guest-arrivals/?scope=upcoming"
        self.assertFalse(self.api.get(url).data[0]["can_check_in"])
        self.assertEqual(self.post(f"tickets/{ticket}/").status_code,404)
        self.api.force_authenticate(self.member)
        self.post(f"me/invitations/{guest.pk}/cancel/")
        self.assertEqual(self.api.get(f"/api/tickets/{ticket}/").status_code,404)
        self.assertEqual((self.sale.visits_left,self.sale.invites_left),(1,1))
        history = self.api.get("/api/me/account/").data
        self.assertEqual(history["guest_refunds"][0]["payment"],"invite")
        self.assertEqual(history["charges"][0]["package_sale_id"],self.sale.pk)
        event = self.api.get("/api/events/").data[0]
        self.assertEqual((event["resident_free"],event["invite_free"]),(1,1))

    def test_private_questionnaire_and_forum(self):
        self.api.patch("/api/me/questionnaire/",{"answers":{"music":"Private"},"hidden":["music"]},format="json")
        post = self.post("stream/",{"text":"Private discussion","poll":["Yes","No"]})
        self.assertEqual(post.status_code,201)
        key = post.data["id"]
        self.assertEqual(self.post(f"threads/c_{key}/",{"text":"Reply"}).status_code,201)
        self.api.force_authenticate(self.other)
        rows = self.api.get("/api/directory/").data["list"]
        self.assertNotIn("music", next(row["anketa"] for row in rows if row["id"] == str(self.member.pk)))
        self.assertEqual(self.post(f"stream/{key}/poll/",{"opt":1}).status_code,200)
        self.assertEqual(self.post(f"admin/fmsgs/{DiscussionReply.objects.get().pk}/hide/").status_code,403)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get("/api/stream/").data["posts"],[])
        self.assertEqual(self.api.get(f"/api/threads/c_{key}/").status_code,404)

    def test_shelf_shop_and_event_permissions(self):
        item = ShelfItem.objects.create(kind="film",title="Кино")
        ShelfBallot.objects.create(kind="film",event=self.event)
        self.assertEqual(self.post("library/pick/",{"event":self.event.pk,"item":item.pk}).status_code,200)
        product = ShopProduct.objects.create(title="Винил",price=750)
        data = {"reference":str(uuid4()),"price":750}
        for _ in range(2):
            self.assertLess(self.post(f"shop/{product.pk}/order/",data).status_code,300)
        self.assertEqual(ShopOrder.objects.count(),1)
        self.assertEqual(account_balance(self.member),250)
        self.api.force_authenticate(self.staff)
        self.assertEqual(self.post(f"staff/schedule/{self.event.pk}/",{"action":"cancel"}).status_code,403)
        self.assertEqual(self.post("library/pick/",{"event":self.event.pk,"item":item.pk}).status_code,403)

    def test_confirmed_gift_is_credited_only_to_recipient(self):
        order = OnlinePayment.objects.create(member=self.member,purpose="gift_tokens",order_id=uuid4(),reference=uuid4(),amount=800,payment_id="421")
        body = {"TerminalKey":"local-test","OrderId":str(order.order_id),"PaymentId":"421","Success":True,
                "Status":"CONFIRMED","Amount":80000,"ErrorCode":"0"}
        self.api.force_authenticate(None)
        with self.settings(TBANK_TERMINAL="local-test",TBANK_PASSWORD="test-only"):
            body["Token"] = signature(body)
            for _ in range(2):
                self.assertEqual(self.post("payments/tbank/notify/",body).status_code,200)
        order.refresh_from_db()
        self.assertTrue(order.gift_code)
        self.assertEqual(account_balance(self.member),1000)
        self.api.force_authenticate(self.other)
        for _ in range(2):
            self.assertEqual(self.post("gift/redeem/",{"code":order.gift_code}).status_code,200)
        self.assertEqual(account_balance(self.other),800)

    def test_card_checkout_credits_admission_and_duplicate_notification_once(self):
        from unittest.mock import patch
        from club.models import EntryPayment, Visit
        from .payments import card_quote
        guest = User.objects.create_user("79001111444")
        admission = EntryPayment.objects.create(visit=Visit.objects.create(member=guest),amount=1000,cashier=self.staff)
        self.api.force_authenticate(guest)
        quote = card_quote(guest, "month")
        self.assertEqual((quote["due"],quote["entry"]),(500,admission.pk))
        with self.settings(TBANK_TERMINAL="local-test",TBANK_PASSWORD="test-only",TBANK_PUBLIC_ORIGIN="https://club.example"):
            def bank(order, member):
                return {"Success":True,"ErrorCode":"0","TerminalKey":"local-test","OrderId":str(order.order_id),
                        "Amount":50000,"PaymentId":"5432","PaymentURL":"https://pay.example/test"}
            with patch("members.payments.init_at_bank",side_effect=bank):
                result = self.post("me/payments/tbank/",{"reference":str(uuid4()),"amount":500,"purpose":"card_month","quote":quote})
                self.assertEqual(result.status_code,200)
            self.assertFalse(guest.membership_sales.exists())
            self.api.force_authenticate(None)
            body = {"Success":True,"ErrorCode":"0","TerminalKey":"local-test","PaymentId":"5432","Status":"CONFIRMED",
                    "OrderId":str(result.data["order"]),"Amount":50000}
            body["Token"] = signature(body)
            for _ in range(2):
                self.assertEqual(self.post("payments/tbank/notify/",body).status_code,200)
            self.assertEqual(guest.membership_sales.get().entry_payment_id,admission.pk)
            self.assertEqual(account_balance(guest),0)

    def test_transferred_visit_keeps_resource_and_does_not_duplicate(self):
        target = MembershipSale.objects.create(member=self.other,cashier=self.staff,paid=1500,starts_at=self.sale.starts_at,
                                              ends_at=self.sale.ends_at)
        body = {"member":self.other.pk,"quantity":1,"reference":str(uuid4())}
        for _ in range(2):
            self.assertLess(self.post("packs/give/",body).status_code,300)
        self.assertEqual((self.sale.visits_left,target.visits_left),(1,1))
        self.api.force_authenticate(self.other)
        self.assertEqual(self.post("packs/give/",body).status_code,400)

    def test_order_rating_and_team_role_boundaries(self):
        from club.bar import ITEMS
        from club.models import TeamCard
        self.api.force_authenticate(self.staff)
        ref = str(uuid4())
        data = {"reference":ref,"user":self.member.pk,"items":[next(iter(ITEMS))]}
        self.assertEqual(self.post("admin/orders/",data).status_code,200)
        self.assertEqual(self.post("team/spend/",{"reference":ref,"rub":1,"title":"test"}).status_code,403)
        order = self.member.bar_orders.get()
        self.api.force_authenticate(self.other)
        self.assertEqual(self.post(f"orders/{order.pk}/rate/",{"service":5}).status_code,404)
        self.api.force_authenticate(self.member)
        for _ in range(2):
            self.assertEqual(self.post(f"orders/{order.pk}/rate/",{"service":5}).status_code,200)
        self.assertEqual(TeamCard.objects.filter(order=order).count(),1)
        self.assertEqual(self.api.get("/api/team/").status_code,403)
