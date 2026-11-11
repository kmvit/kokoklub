"""Заполняет сайт примерами, привязанными к демонстрационным профилям."""
import sys
from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from chat.models import Conversation, Message
from club.models import Card, Visit
from members.models import Activity, Event, Hobby, TopUp, User


EVENTS = [
    (2, 19, "Вечер на виниле", "Слушаем пластинки и обмениваемся историями о любимых альбомах."),
    (4, 18, "Открытая мастерская", "Художники покажут эскизы и расскажут, как работают над серией."),
    (7, 19, "Киноклуб: короткий метр", "Смотрим короткометражки и обсуждаем их после показа."),
    (10, 16, "Прогулка с камерой", "Собираемся в клубе и отправляемся искать интересные детали в городе."),
]

PROFILES = [
    ("Искусство", "Рисую городские дворы акварелью.", "Помогу подобрать работы для небольшой выставки.", "Площадку для выставки", "акварель"),
    ("Дизайн", "Делаю айдентику для культурных проектов.", "Помогу с афишей и навигацией.", "Партнёров для книжного обмена", "типографика"),
    ("Музыка", "Собираю пластинки и составляю программы для камерных вечеров.", "Подберу музыку для встречи.", "Участников винилового вечера", "винил"),
    ("Ремесло", "Работаю с глиной и глазурями.", "Расскажу, как сделать первую чашку.", "Мастерскую с печью", "керамика"),
    ("Кино", "Снимаю короткие документальные фильмы.", "Помогу собрать черновой монтаж.", "Звукорежиссёра", "кинопоказы"),
    ("Образование", "Веду фотопрогулки и мастерские.", "Подскажу упражнения для начинающих фотографов.", "Участников фотопрогулок", "фотография"),
]


class Command(BaseCommand):
    help = "Добавить демо-афишу, анкеты, проекты, переписку, карты и историю счёта"

    def add_arguments(self, parser):
        parser.add_argument("--enable-login", action="store_true",
                            help="Прочитать пароль демонстрационного пользователя из stdin")

    @transaction.atomic
    def handle(self, *args, **options):
        password = sys.stdin.readline().strip() if options["enable_login"] else None
        if options["enable_login"] and len(password) < 20:
            raise CommandError("Передайте пароль длиной от 20 символов через stdin.")

        call_command("demo_projects", stdout=self.stdout)
        people = [User.objects.get(email=f"project-demo-{i}@example.invalid") for i in range(1, 7)]
        for user, (activity, about, can_help, looking_for, hobby) in zip(people, PROFILES):
            if not user.full_name.endswith(" · Демо") or user.is_staff or user.is_superuser:
                raise CommandError("Найден профиль, который нельзя использовать как демонстрационный.")
            user.activity = Activity.objects.get_or_create(name=activity)[0]
            user.about = about
            user.can_help = can_help
            user.looking_for = looking_for
            user.save(update_fields=["activity", "about", "can_help", "looking_for"])
            user.hobbies.add(Hobby.objects.get_or_create(name=hobby)[0])

        now = timezone.now()
        moscow = ZoneInfo("Europe/Moscow")
        today = now.astimezone(moscow).date()
        for days, hour, title, description in EVENTS:
            event, _ = Event.objects.get_or_create(
                title=f"{title} · Демо",
                defaults={
                    "description": f"{description} Это пример афиши, мероприятие тестовое.",
                    "starts_at": datetime.combine(today + timedelta(days=days), time(hour), moscow),
                    "location": "Коко клуб · тестовое событие",
                    "is_published": True,
                },
            )
            if event.starts_at <= now:
                event.starts_at = datetime.combine(today + timedelta(days=days), time(hour), moscow)
                event.save(update_fields=["starts_at"])

        viewer, designer, curator = people[:3]
        if password:
            viewer.set_password(password)
            viewer.save(update_fields=["password"])

        for number, user in enumerate((viewer, designer, curator), start=1):
            uid = f"F0DE00000000{number:02X}"
            card = Card.objects.filter(uid=uid, member=user, is_active=True).first()
            if card is None and not user.cards.filter(is_active=True).exists():
                card = Card.objects.create(uid=uid, member=user)
            if card and not user.visits.exists():
                Visit.objects.create(member=user, card=card, entered_at=now - timedelta(days=1),
                                     left_at=now - timedelta(days=1) + timedelta(hours=2))
            if card and user == curator and not user.visits.filter(left_at__isnull=True).exists():
                Visit.objects.create(member=user, card=card, entered_at=now)

        for index, amount in enumerate(("1000.00", "450.00")):
            TopUp.objects.get_or_create(
                reference=uuid5(NAMESPACE_URL, f"kokoklub:demo:account:{index}"),
                defaults={"member": viewer, "created_by": designer, "amount": Decimal(amount)},
            )

        chat = Conversation.between(viewer, designer)
        if not chat.messages.exists():
            Message.objects.bulk_create([
                Message(conversation=chat, sender=viewer,
                        text="Привет! Посмотрела «Знаки района». Можем обсудить афишу для выставки?",
                        created_at=now - timedelta(minutes=32), read_at=now),
                Message(conversation=chat, sender=designer,
                        text="Да, с удовольствием. Покажи пару работ, и я предложу варианты.",
                        created_at=now - timedelta(minutes=21)),
            ])
            chat.updated_at = now - timedelta(minutes=21)
            chat.save(update_fields=["updated_at"])

        self.stdout.write(self.style.SUCCESS("Готово: 4 демо-события, 6 профилей с проектами, переписка, карты, визиты и счёт."))
