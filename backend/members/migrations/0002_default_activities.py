from django.db import migrations

# Стартовый справочник: клуб поправит его в админке под своих людей.
ACTIVITIES = [
    "Разработка и IT",
    "Дизайн",
    "Маркетинг и реклама",
    "SMM и контент",
    "Фото и видео",
    "Музыка",
    "Искусство",
    "Архитектура и интерьеры",
    "Продажи",
    "Финансы и бухгалтерия",
    "Юриспруденция",
    "Предпринимательство",
    "Образование",
    "Медицина и здоровье",
    "Спорт и фитнес",
    "Ресторанный бизнес",
    "Строительство и недвижимость",
    "Студент",
    "Другое",
]


def forwards(apps, schema_editor):
    Activity = apps.get_model("members", "Activity")
    for i, name in enumerate(ACTIVITIES):
        Activity.objects.get_or_create(name=name, defaults={"order": (i + 1) * 10})


class Migration(migrations.Migration):
    dependencies = [("members", "0001_initial")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
