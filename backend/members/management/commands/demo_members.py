"""Тестовые участники для локальной разработки: python manage.py demo_members."""
from django.core.management.base import BaseCommand
from django.utils import timezone

from club.models import Card, Visit
from members.models import Activity, Hobby, User

PEOPLE = [
    ("Анна Смирнова", "Дизайн", "Дизайнер интерфейсов", ["рисование", "йога"], "open",
     "Сделаю дизайн сайта или приложения", "Ищу разработчика на пет-проект"),
    ("Илья Ковалёв", "Разработка и IT", "Frontend-разработчик", ["настолки", "бег"], "busy",
     "Сайты на React, лендинги", "Дизайнера и маркетолога"),
    ("Мария Орлова", "Маркетинг и реклама", "Таргетолог", ["кино", "путешествия"], "open",
     "Настрою рекламу в VK и Директе", "Фотографа для съёмки"),
    ("Денис Белов", "Фото и видео", "Фотограф", ["фото", "велосипед"], "dnd",
     "Портреты, предметка, репортаж", "Моделей для портфолио"),
    ("Ольга Ким", "Юриспруденция", "Юрист по договорам", ["кулинария"], "open",
     "Договоры, регистрация ИП и ООО", "Новых знакомств"),
    ("Тимур Алиев", "Предпринимательство", "Основатель кофейни", ["кофе", "бег"], "open",
     "Расскажу, как открыть кофейню", "SMM-щика и дизайнера меню"),
]


# Учётка персонала для локальной проверки экранов /staff. Только для разработки.
DEMO_STAFF_PHONE = "79990000001"
DEMO_STAFF_PASSWORD = "koko-demo-staff"


class Command(BaseCommand):
    help = "Создать тестовых участников с картами (только для разработки)"

    def add_arguments(self, parser):
        # на публичном сайте демо-персонал не нужен: его пароль лежит в репозитории
        parser.add_argument("--no-staff", action="store_true", help="не создавать учётку персонала")

    def handle(self, *args, **opts):
        for i, (name, activity, occupation, hobbies, status, can_help, looking_for) in enumerate(PEOPLE):
            phone = f"7900000000{i}"
            user = User.objects.filter(phone=phone).first() or User.objects.create_user(phone)
            user.full_name = name
            user.activity = Activity.objects.filter(name=activity).first()
            user.occupation = occupation
            user.status = status
            user.can_help = can_help
            user.looking_for = looking_for
            user.about = f"Привет! Я {name.split()[0]}, люблю {', '.join(hobbies)}."
            user.telegram = f"demo_user_{i}"
            user.consent_at = user.consent_at or timezone.now()
            user.save()
            user.hobbies.set([Hobby.objects.get_or_create(name=h)[0] for h in hobbies])
            if not user.cards.filter(is_active=True).exists():
                Card.objects.create(member=user, uid=f"04D3A0{i:08X}")
            if i % 2 == 0 and not user.visits.filter(left_at__isnull=True).exists():
                Visit.objects.create(member=user, card=user.cards.get(is_active=True))
        done = f"Готово: {len(PEOPLE)} участников, телефоны 79000000000…5"
        if not opts["no_staff"]:
            staff = User.objects.filter(phone=DEMO_STAFF_PHONE).first() or User.objects.create_user(DEMO_STAFF_PHONE)
            staff.is_staff = True
            staff.set_password(DEMO_STAFF_PASSWORD)
            staff.save()
            done += f"; персонал {DEMO_STAFF_PHONE} / {DEMO_STAFF_PASSWORD}"
        self.stdout.write(self.style.SUCCESS(done))
