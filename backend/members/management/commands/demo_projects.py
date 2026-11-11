from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from members.images import shrink_photo
from members.models import Project, User


EXAMPLES = [
    (
        "Лера Светлова", "Художница", "Свет в окнах", ["Искусство", "Живопись"],
        "Серия акварелей о вечерних окнах и свете в обычных городских дворах.",
        "Автор серии", "in_progress", "Небольшую площадку для выставки и помощь с развеской.",
        "В серии будет 12 работ. Каждая посвящена одному двору, который я рисую с натуры.",
    ),
    (
        "Миша Рудин", "Графический дизайнер", "Знаки района", ["Дизайн", "Типографика"],
        "Визуальный язык для районного книжного обмена. Афиши, наклейки и таблички для полок.",
        "Айдентика и макеты", "complete", "",
        "Из простых геометрических знаков получилась система, которую организаторы могут сами собрать для нового места.",
    ),
    (
        "Саша Мирная", "Музыкальный куратор", "Вечер на виниле", ["Музыка", "События"],
        "Камерная встреча, где участники приносят любимые пластинки и рассказывают, почему их выбрали.",
        "Куратор программы", "idea", "Диджея с проигрывателем и участников с пластинками.",
        "Демо-концепция встречи. Фотографии показывают возможную атмосферу вечера.",
    ),
    (
        "Даня Клёнов", "Керамист", "Посуда с характером", ["Ремесло", "Дизайн"],
        "Небольшая коллекция чашек, где у каждой своя форма, фактура и глазурь.",
        "Автор форм и глазурей", "in_progress", "Мастера с печью для пробного обжига.",
        "Проверяю, как три глазури ложатся на глину с разной фактурой. Следующий этап — пробный обжиг.",
    ),
    (
        "Нина Озёрная", "Режиссёр", "Один день на рынке", ["Кино", "Документалистика"],
        "Короткий документальный фильм о том, как живёт рынок от открытия до закрытия.",
        "Режиссура и монтаж", "in_progress", "Звукорежиссёра для записи голосов и звуков рынка.",
        "Герои — люди, которые каждый день открывают прилавки. Фильм строится на их историях и звуках места.",
    ),
    (
        "Костя Ветров", "Преподаватель", "Мастерская наблюдения", ["Образование", "Фото"],
        "Прогулки с камерой и заданиями для тех, кто хочет внимательнее смотреть на город.",
        "Автор программы", "complete", "Участников для открытого занятия.",
        "Маршрут и задания готовы. На прогулке разбираем отражения, ритм фасадов и случайные детали.",
    ),
]


class Command(BaseCommand):
    help = "Добавить помеченные демонстрационные профили и проекты без доступа ко входу"

    def add_arguments(self, parser):
        parser.add_argument("--image", action="append", type=Path, default=[])

    @transaction.atomic
    def handle(self, *args, **options):
        if len(options["image"]) > 8:
            raise CommandError("Можно передать до 8 изображений.")
        images = []
        for path in options["image"]:
            try:
                with path.open("rb") as image:
                    images.append(shrink_photo(image))
            except (OSError, ValueError) as error:
                raise CommandError(str(error)) from error

        for index, example in enumerate(EXAMPLES):
            name, occupation, title, directions, summary, role, stage, looking_for, description = example
            email = f"project-demo-{index + 1}@example.invalid"
            author = User.objects.filter(email=email).first()
            if author is None:
                phone = next(
                    (f"79000009{number:03d}" for number in range(1000)
                     if not User.objects.filter(phone=f"79000009{number:03d}").exists()),
                    None,
                )
                if phone is None:
                    raise CommandError("Не найден свободный номер для тестового профиля.")
                author = User.objects.create_user(
                    phone=phone, email=email, full_name=f"{name} · Демо",
                    occupation=occupation, consent_at=timezone.now(),
                )
            project, _ = Project.objects.get_or_create(
                owner=author, title=f"{title} · Демо",
                defaults={
                    "directions": directions, "summary": summary, "author_role": role,
                    "stage": stage, "looking_for": looking_for, "description": description,
                },
            )
            if index == 2 and not project.images.exists():
                for image in images:
                    project.images.create(image=image)

        self.stdout.write(self.style.SUCCESS(f"Готово: {len(EXAMPLES)} демонстрационных проектов."))
