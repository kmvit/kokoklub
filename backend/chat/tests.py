from django.test import TestCase
from rest_framework.test import APIClient

from members.tests import make_member


class ChatTests(TestCase):
    def setUp(self):
        self.anna = make_member("79001110001", "Анна")
        self.boris = make_member("79001110002", "Борис")

    def client_for(self, user):
        api = APIClient()
        api.force_authenticate(user)
        return api

    def test_dialog_and_unread(self):
        anna, boris = self.client_for(self.anna), self.client_for(self.boris)
        conv = anna.post("/api/chats/", {"member": self.boris.pk}, format="json").data["id"]
        # повторное открытие — та же переписка, с какой стороны ни зайди
        self.assertEqual(boris.post("/api/chats/", {"member": self.anna.pk}, format="json").data["id"], conv)

        anna.post(f"/api/chats/{conv}/messages/", {"text": "Привет! Нужен сайт"}, format="json")
        anna.post(f"/api/chats/{conv}/messages/", {"text": "Есть время?"}, format="json")
        self.assertEqual(boris.get("/api/me/").data["unread"], 2)
        self.assertEqual(boris.get("/api/chats/").data[0]["unread"], 2)

        res = boris.get(f"/api/chats/{conv}/")
        self.assertEqual([m["text"] for m in res.data["messages"]], ["Привет! Нужен сайт", "Есть время?"])
        self.assertEqual(boris.get("/api/me/").data["unread"], 0)

    def test_outsiders_blocked(self):
        conv = self.client_for(self.anna).post("/api/chats/", {"member": self.boris.pk}, format="json").data["id"]
        stranger = make_member("79001110003", "Чужой")
        self.assertEqual(self.client_for(stranger).get(f"/api/chats/{conv}/").status_code, 404)
        no_card = make_member("79001110004", "Без карты", card=False)
        res = self.client_for(no_card).post("/api/chats/", {"member": self.anna.pk}, format="json")
        self.assertEqual(res.status_code, 403)
