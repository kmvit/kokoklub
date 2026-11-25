from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import OnlinePayment, account_balance
from .payments import signature
from .tests import make_member


@override_settings(TBANK_TERMINAL="test-terminal", TBANK_PASSWORD="mock-secret",
                   TBANK_PUBLIC_ORIGIN="https://club.example", TBANK_TAXATION="", TBANK_ITEM_TAX="")
class PaymentTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.member = make_member()
        self.api.force_authenticate(self.member)
        self.url = "/api/me/payments/tbank/"

    @override_settings(TBANK_PASSWORD="11111111111111")
    def test_signature_matches_bank_example(self):
        params = {"TerminalKey": "MerchantTerminalKey", "Amount": 19200, "OrderId": "00000",
                  "Description": "Подарочная карта на 1000 рублей", "Receipt": {}, "DATA": {}}
        self.assertEqual(signature(params), "72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2")

    def test_checkout_retries_reuse_order(self):
        def init(order, user):
            return {"TerminalKey": "test-terminal", "OrderId": str(order.order_id), "Amount": 150000,
                    "Success": True, "ErrorCode": "0", "Status": "NEW", "PaymentId": "1223",
                    "PaymentURL": "https://pay.example/test"}

        payload = {"reference": str(uuid4()), "amount": 1500}
        with patch("members.payments.init_at_bank", side_effect=init) as bank:
            for _ in range(2):
                self.assertEqual(self.api.post(self.url, payload, format="json").data["payment_url"], "https://pay.example/test")
            bank.assert_called_once()
        self.assertEqual(self.api.post(self.url, {**payload, "amount": 2000}, format="json").status_code, 409)
        self.assertEqual(account_balance(self.member), 0)

    def test_only_matching_confirmed_notification_credits_once(self):
        order = OnlinePayment.objects.create(member=self.member, reference=uuid4(), order_id=uuid4(),
                                             amount=500, payment_id="1743")
        url = "/api/payments/tbank/notify/"
        self.api.force_authenticate(None)
        payload = {"TerminalKey": "test-terminal", "PaymentId": "1743", "OrderId": str(order.order_id),
                   "Amount": 50000, "Success": True, "ErrorCode": "0", "Status": "AUTHORIZED"}

        def notify(**changes):
            body = {**payload, **changes}
            body["Token"] = signature(body)
            return self.api.post(url, body, format="json")

        self.assertEqual(self.api.post(url, payload, format="json").status_code, 403)
        self.assertEqual(notify().content, b"OK")
        self.assertEqual(account_balance(self.member), 0)
        self.assertEqual(notify(Status="CONFIRMED", Amount=50100).status_code, 409)
        self.assertEqual(notify(Status="CONFIRMED", PaymentId="2222").status_code, 409)
        for _ in range(2):
            self.assertEqual(notify(Status="CONFIRMED").content, b"OK")
        self.assertEqual(notify().content, b"OK")
        order.refresh_from_db()
        self.assertEqual(order.status, "CONFIRMED")
        self.assertEqual(account_balance(self.member), 500)
        self.assertEqual(notify(Status="PARTIAL_REFUNDED", Amount=10000).content, b"OK")
        order.refresh_from_db()
        self.assertTrue(order.needs_review)

    @override_settings(TBANK_TEST=True, TBANK_TAXATION="usn_income", TBANK_ITEM_TAX="none")
    def test_init_sends_kopecks_and_receipt_to_test_environment(self):
        import io
        import json
        from .payments import init_at_bank
        order = OnlinePayment.objects.create(member=self.member, amount=345, order_id=uuid4(), reference=uuid4())
        with patch("members.payments.urlopen", return_value=io.BytesIO(b'{"Success":true}')) as http:
            self.assertTrue(init_at_bank(order, self.member)["Success"])
        req = http.call_args.args[0]
        self.assertEqual(req.full_url, "https://rest-api-test.tinkoff.ru/v2/Init")
        payload = json.loads(req.data)
        self.assertEqual(payload["Amount"], 34500)
        self.assertEqual(payload["Receipt"]["Items"][0]["Amount"], 34500)
        self.assertEqual(payload["Token"], signature(payload))
        self.assertNotIn("Password", payload)
        self.assertTrue(payload["SuccessURL"].endswith("/#cabinet"))
