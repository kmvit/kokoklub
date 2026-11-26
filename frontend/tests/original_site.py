import os
import sys
import tempfile
import threading
from datetime import timedelta
from pathlib import Path
from uuid import uuid4
from wsgiref.simple_server import make_server, WSGIRequestHandler
import mimetypes

project = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project / "backend"))
os.environ.update(DJANGO_SETTINGS_MODULE="config.settings", DB_ENGINE="sqlite", DATABASE_URL="", POSTGRES_URL="",
                  DJANGO_ALLOWED_HOSTS="127.0.0.1", DJANGO_SECRET_KEY="isolated-browser-test-secret-not-used-elsewhere")
from django.conf import settings
temp = tempfile.TemporaryDirectory(prefix="koko-browser-")
settings.DATABASES["default"]["NAME"] = str(Path(temp.name) / "qa.sqlite3")
import django
django.setup()
from django.core.management import call_command
from django.utils import timezone
from django.core.wsgi import get_wsgi_application
from members.models import User, Event, TopUp
from club.models import MembershipSale
from playwright.sync_api import sync_playwright, expect
call_command("migrate", verbosity=0)
now = timezone.now()
staff = User.objects.create_user("79001110001", email="staff@example.org", password="Example12345", is_staff=True, is_superuser=True)
user = User.objects.create_user("79001110002", email="user@example.org", password="Example12345", full_name="Ирина", consent_at=now)
MembershipSale.objects.create(member=user, cashier=staff, starts_at=now, ends_at=now+timedelta(days=30), paid=1500, included_visits=1)
walkin_guest = User.objects.create_user("79001110003", full_name="Гость без карты")
TopUp.objects.create(member=walkin_guest, created_by=staff, amount=1500, reference=uuid4())
TopUp.objects.create(member=user, created_by=staff, amount=1500, reference=uuid4())
Event.objects.create(title="Браузерная встреча", starts_at=now+timedelta(days=3), is_published=True,
                     accepts_pack=True, resident_seats=1, invite_seats=1, resident_price=500)
Event.objects.create(title="Вечер организатора", starts_at=now, is_published=True, organizer=user)
app = get_wsgi_application()
root = project / "frontend/dist"
def dispatch(env, start):
    path = env["PATH_INFO"]
    if path.startswith(("/api/", "/admin/")):
        return app(env,start)
    file = (root/path.lstrip("/")).resolve()
    if root not in file.parents and file != root:
        start("404 Not Found", []); return [b""]
    if not file.is_file():
        file = root / ("portal/index.html" if path.startswith("/portal/") else "index.html")
    start("200 OK", [("Content-Type", mimetypes.guess_type(file)[0] or "application/octet-stream")])
    return [file.read_bytes()]
class Quiet(WSGIRequestHandler):
    def log_message(self, *args): pass
server = make_server("127.0.0.1", 0, dispatch, handler_class=Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROME_BIN") or None,
                                 headless=True, args=["--disable-background-networking"])
    context = browser.new_context(viewport={"width":390,"height":844}, timezone_id="Europe/Moscow")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    def login(page, email):
        page.goto(base)
        page.get_by_role("button",name="Войти",exact=True).first.click()
        page.get_by_label("Почта",exact=True).fill(email)
        page.get_by_label("Пароль",exact=True).fill("Example12345")
        page.locator("form").get_by_role("button",name="Войти").click()
    page.set_default_timeout(8000)
    login(page, "user@example.org")
    expect(page.get_by_role("heading",name="Ирина")).to_be_visible()
    page.goto(base+"/#afisha")
    page.get_by_role("button",name="Забронировать место",exact=True).click()
    page.get_by_label("Использовать один пакетный визит",exact=False).check()
    page.get_by_label("Добавить гостя",exact=False).check()
    page.get_by_role("button",name="Подтвердить бронь").click()
    expect(page.get_by_text("Ваше место забронировано")).to_be_visible()
    expect(page.get_by_text("визитов 0 · пригласительных 0",exact=False)).to_be_visible()
    staffpage = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, timezone_id="Europe/Moscow").new_page()
    staffpage.set_default_timeout(7000)
    staffpage.on("response", lambda r: print("HTTP",r.status,r.url,flush=True) if r.status >= 400 else None)
    staffpage.on("pageerror", lambda e: errors.append(str(e)))
    login(staffpage,"staff@example.org")
    expect(staffpage.get_by_text("Кабинет кассира")).to_be_visible()
    staffpage.get_by_role("link", name="Найти гостя", exact=True).click()
    staffpage.get_by_role("searchbox").fill(walkin_guest.phone[-4:])
    staffpage.get_by_role("link", name="Гость без карты", exact=False).click()
    expect(staffpage.get_by_role("heading", name="Гость без карты")).to_be_visible()
    assert staffpage.evaluate("document.documentElement.scrollWidth <= innerWidth")
    staffpage.get_by_role("button", name="Вход со счёта · 1000 токенов").click()
    staffpage.get_by_role("dialog").get_by_role("button", name="Подтвердить списание", exact=True).click()
    expect(staffpage.get_by_text("Вход на сегодня учтён")).to_be_visible()
    expect(staffpage.get_by_role("heading", name="Счёт гостя: 500,00 ₽")).to_be_visible()
    staffpage.reload()
    expect(staffpage.get_by_text("Вход на сегодня учтён")).to_be_visible()
    expect(staffpage.get_by_role("button", name="Вход со счёта", exact=False)).to_have_count(0)
    staffpage.get_by_text("Выбрать тариф", exact=True).click()
    staffpage.get_by_role("button", name="Оформить карту «Месяц» · 500 ₽").click()
    staffpage.get_by_role("button", name="Оплата получена").click()
    expect(staffpage.get_by_text("Сейчас в клубе", exact=True).last).to_be_visible()
    expect(staffpage.get_by_role("heading", name="Счёт гостя: 500,00 ₽")).to_be_visible()
    staffpage.get_by_role("button", name="Пополнить счёт").click()
    staffpage.get_by_label("Сумма, ₽").fill("250")
    staffpage.get_by_label("Оплата этой суммы получена на кассе").check()
    staffpage.get_by_role("button", name="Подтвердить зачисление", exact=False).click()
    expect(staffpage.get_by_role("heading", name="Счёт гостя: 750,00 ₽")).to_be_visible()
    staffpage.get_by_role("link", name="Привязать карту", exact=True).click()
    staffpage.get_by_label("UID метки").fill("53AB1234567890")
    staffpage.get_by_role("button", name="Подтвердить привязку").click()
    expect(staffpage.get_by_role("heading", name="Карта привязана")).to_be_visible()
    staffpage.get_by_role("link", name="В клубе", exact=True).click()
    staffpage.get_by_role("button", name="Отметить выход: Гость без карты").click()
    expect(staffpage.get_by_text("Пока никого.", exact=False)).to_be_visible()
    staffpage.goto(base + f"/#staff/guests/{user.pk}")
    expect(staffpage.get_by_text("Место резидента оплачено",exact=False)).to_be_visible()
    expect(staffpage.get_by_role("heading",name="Гостевые места резидента")).to_be_visible()
    page.get_by_role("button",name="Отменить гостевое место").click()
    page.get_by_role("button",name="Подтвердить отмену").click()
    expect(page.get_by_text("визитов 0 · пригласительных 1",exact=False)).to_be_visible()
    expect(page.get_by_text("Ваше место забронировано")).to_be_visible()
    staffpage.reload()
    expect(staffpage.get_by_text("Место резидента оплачено",exact=False)).to_be_visible()
    expect(staffpage.get_by_role("heading",name="Гостевые места резидента")).to_have_count(0)
    staffpage.get_by_role("button",name="Отметить бесплатный вход организатора").click()
    staffpage.get_by_role("button",name="Подтвердить",exact=True).click()
    expect(staffpage.get_by_text("На еду осталось 1000 кредитов.",exact=False)).to_be_visible()
    page.goto(base+"/#feed")
    page.get_by_label("Сообщение резидентам",exact=True).fill("Клубная новость")
    page.get_by_role("button",name="Опубликовать").click()
    expect(page.get_by_text("Клубная новость",exact=True)).to_be_visible()
    page.get_by_role("tab",name="Темы резидентов").click()
    page.get_by_role("button",name="Знакомство",exact=False).first.click()
    page.get_by_label("О чём ветка").fill("Большая встреча")
    page.get_by_label("Первое сообщение").fill("Читаем вместе")
    page.get_by_role("button",name="Создать ветку").click()
    expect(page.get_by_text("Читаем вместе",exact=True)).to_be_visible()
    for path, heading in [("library","Медиатека"),("members","Картотека"),("cabinet","Кабинет"),("records","Записи"),("host","Предложить встречу"),("org","Мои встречи"),("shop","Пакетные визиты")]:
        page.goto(base+"/#"+path)
        expect(page.get_by_role("heading",name=heading,exact=False).first).to_be_visible()
    page.goto(base+"/#menu")
    page.get_by_label("Что добавить",exact=True).fill("Кофе с кардамоном")
    page.get_by_role("button",name="Предложить",exact=True).click()
    expect(page.get_by_text("Кофе с кардамоном",exact=True)).to_be_visible()
    page.goto(base+"/#cabinet")
    expect(page.get_by_text("Гостевое место · Браузерная встреча · 1 пригласительный")).to_be_visible()
    expect(page.get_by_text("Возврат за гостя · Браузерная встреча · 1 пригласительный")).to_be_visible()
    expect(page.get_by_text("Бронь · Браузерная встреча · 1 пакетный визит")).to_be_visible()
    staffpage.goto(base+"/#bar")
    expect(staffpage.get_by_role("heading",name="Заказы и оценки")).to_be_visible()
    staffpage.locator("select[name=user]").select_option(str(user.pk))
    staffpage.locator("input[name=items]").first.check()
    staffpage.get_by_role("button",name="Записать заказ").click()
    expect(staffpage.get_by_text("Заказ записан.",exact=False)).to_be_visible()
    page.reload()
    page.get_by_role("button",name="Оценить",exact=True).click()
    page.locator("label[for=st-service-5]").click()
    page.get_by_role("button",name="Отправить оценку").click()
    staffpage.goto(base+"/#team")
    expect(staffpage.get_by_text("Пять звёзд за обслуживание",exact=False).first).to_be_visible()
    staffpage.goto(base+"/#admin")
    staffpage.get_by_role("button",name="Добавить встречу").click()
    staffpage.get_by_label("Название",exact=True).fill("Новая встреча из программы")
    staffpage.get_by_label("Начало по Москве").fill((timezone.localtime(now)+timedelta(days=5)).strftime("%Y-%m-%dT19:00"))
    staffpage.get_by_label("Мест резидентов").fill("3")
    staffpage.get_by_label("Цена резидента в кредитах").fill("100")
    staffpage.get_by_role("button",name="Сохранить в афише").click()
    expect(staffpage.get_by_role("heading",name="Новая встреча из программы")).to_be_visible()
    page.goto(base+"/#afisha")
    expect(page.locator(".agenda").get_by_text("Новая встреча из программы",exact=True)).to_be_visible()
    public = browser.new_context(viewport={"width":390,"height":844}).new_page()
    public.goto(base+"/#host")
    public.get_by_label("Как называется встреча").fill("Заявка гостя")
    public.get_by_label("О встрече",exact=True).fill("Встреча дизайнеров")
    public.get_by_label("Как вас зовут").fill("Анна")
    public.get_by_label("Телефон или Telegram").fill("@anna")
    public.locator('form[data-form=idea] input[type=checkbox]').check()
    public.locator('form[data-form=idea] button').click()
    expect(public.get_by_text("Предложение отправлено.",exact=False)).to_be_visible()
    assert not errors,errors
    browser.close()
server.shutdown()
print("Original site browser integration checks passed.")
