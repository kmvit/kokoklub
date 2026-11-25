from django.conf import settings
from django.db import transaction
from django.db.models import Case, Count, F, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from club.queries import with_club_flags

from .permissions import IsClubUser, CanAccessOwnProfile
from .images import shrink_photo
from .payments import enabled as online_payments_enabled
from .models import Activity, Hobby, User, Project, ProjectImage, Event, TopUp, account_balance
from .serializers import (
    ActivitySerializer,
    ClubProjectSerializer,
    ProjectImageSerializer,
    MeSerializer,
    MemberDetailSerializer,
    MemberShortSerializer,
)


def catalog_queryset():
    """Кого видно на портале: участники с заполненной анкетой, не скрытые модератором."""
    qs = (
        User.objects.filter(is_active=True, is_staff=False, is_hidden=False, consent_at__isnull=False)
        .exclude(full_name="")
        .select_related("activity")
        .prefetch_related("hobbies")
    )
    return with_club_flags(qs)


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [CanAccessOwnProfile]
    serializer_class = MeSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


class MyPhotoView(APIView):
    permission_classes = [IsClubUser]
    def post(self, request):
        upload = request.FILES.get("photo")
        if not upload:
            return Response({"detail": "Выберите фото"}, status=400)
        if upload.size > 15 * 1024 * 1024:
            return Response({"detail": "Фото больше 15 МБ"}, status=400)
        try:
            photo = shrink_photo(upload)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        user = request.user
        if user.photo:
            user.photo.delete(save=False)
        user.photo.save(photo.name, photo)
        return Response(MeSerializer(user, context={"request": request}).data)

    def delete(self, request):
        if request.user.photo:
            request.user.photo.delete()
        return Response(MeSerializer(request.user, context={"request": request}).data)


class SiteView(APIView):
    """Настройки портала для фронта: меняются в .env без пересборки."""

    permission_classes = [AllowAny]

    def get(self, request):
        from club.membership import TARIFFS

        return Response({"menu_url": settings.MENU_URL or None, "tariffs": {
            key: {"name": key.label, "price": price, "days": days}
            for key, (price, days) in TARIFFS.items()
        }})


class ActivityListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ActivitySerializer
    queryset = Activity.objects.all()
    pagination_class = None


class HobbyListView(APIView):
    """Популярные хобби — подсказки в анкете и фильтр каталога."""
    permission_classes = [IsClubUser]

    def get(self, request):
        names = (
            Hobby.objects.annotate(n=Count("members"))
            .filter(n__gt=0)
            .order_by("-n", "name")
            .values_list("name", flat=True)[:40]
        )
        return Response(list(names))


class MemberListView(generics.ListAPIView):
    """Картотека доступна только вошедшим участникам."""
    permission_classes = [IsClubUser]
    serializer_class = MemberShortSerializer
    pagination_class = None

    def get_queryset(self):
        qs = catalog_queryset()
        p = self.request.query_params
        if q := p.get("q", "").strip():
            qs = qs.filter(
                Q(full_name__icontains=q) | Q(occupation__icontains=q) | Q(about__icontains=q)
                | Q(can_help__icontains=q) | Q(activity__name__icontains=q)
                | Q(hobbies__name__icontains=q)
            ).distinct()
        if activity := p.get("activity"):
            qs = qs.filter(activity_id=activity)
        if hobby := p.get("hobby"):
            qs = qs.filter(hobbies__name=Hobby.clean_name(hobby))
        if status := p.get("status"):
            qs = qs.filter(status=status)
        if p.get("in_club") == "1":
            qs = qs.filter(in_club=True)
        # сначала те, кто сейчас в клубе и готов общаться
        status_order = Case(
            When(status=User.Status.OPEN, then=Value(0)),
            When(status=User.Status.BUSY, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
        return qs.order_by("-in_club", status_order, "full_name")


class MemberDetailView(APIView):
    permission_classes = [IsClubUser]

    def get(self, request, pk):
        member = get_object_or_404(catalog_queryset(), pk=pk)
        return Response(MemberDetailSerializer(member, context={"request": request}).data)


class EventsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from django.utils import timezone
        return Response(list(Event.objects.filter(is_published=True, cancelled_at__isnull=True, starts_at__gte=timezone.now()).annotate(
            resident_free=F("resident_seats") - Count("resident_bookings", filter=Q(resident_bookings__guest=False, resident_bookings__cancelled_at__isnull=True), distinct=True),
            guest_free=F("guest_seats") - Count("resident_bookings", filter=Q(resident_bookings__guest=True, resident_bookings__cancelled_at__isnull=True), distinct=True),
            invite_free=F("invite_seats") - Count("guest_bookings", filter=Q(guest_bookings__cancelled_at__isnull=True), distinct=True),
        ).values("resident_free", "guest_free", "invite_free",
            "id", "title", "description", "starts_at", "location", "invite_seats", "resident_seats", "resident_price", "guest_seats", "guest_extra", "accepts_pack",
        )))


def visible_projects():
    return (
        Project.objects.filter(owner__in=catalog_queryset())
        .select_related("owner")
        .prefetch_related("images")
    )


class ProjectsView(APIView):
    permission_classes = [IsClubUser]
    def get(self, request):
        return Response(ClubProjectSerializer(visible_projects(), many=True).data)


class ProjectTeams(APIView):
    permission_classes = [IsClubUser]

    def get(self, request):
        return Response([{"id":p.pk,"title":p.title,"about":p.description or p.summary,"need":p.looking_for,
                          "give":p.exchange,"owner_name":p.owner.full_name,"status":p.get_stage_display() or "Идея",
                          "members":[p.owner_id] + [u.pk for u in p.helpers.all()],
                          "member_names":[p.owner.full_name] + [u.full_name for u in p.helpers.all() if not u.is_hidden and u.is_active]}
                         for p in visible_projects().prefetch_related("helpers")])

    @transaction.atomic
    def post(self, request, pk=None):
        if not request.user.is_member:
            return Response({"detail":"Проекты ведут резиденты."},status=403)
        if pk:
            project = get_object_or_404(visible_projects(),pk=pk)
            if project.owner_id != request.user.pk:
                project.helpers.add(request.user)
        else:
            class Input(serializers.Serializer):
                title = serializers.CharField(max_length=150)
                about = serializers.CharField(max_length=5000,allow_blank=True,default="")
                need = serializers.CharField(max_length=300,allow_blank=True,default="")
                give = serializers.CharField(max_length=240,allow_blank=True,default="")
            data = Input(data=request.data)
            data.is_valid(raise_exception=True)
            args = data.validated_data
            project = Project.objects.create(owner=request.user,title=args["title"],description=args["about"],summary=args["about"][:240],
                                             looking_for=args["need"],exchange=args["give"],stage=Project.Stage.IDEA)
        return Response({"id":project.pk})


class ProjectDetailView(APIView):
    permission_classes = [IsClubUser]
    def get(self, request, pk):
        return Response(ClubProjectSerializer(get_object_or_404(visible_projects(), pk=pk)).data)


class ProjectImagesView(APIView):
    permission_classes = [IsClubUser]
    @transaction.atomic
    def post(self, request, pk):
        project = get_object_or_404(Project.objects.select_for_update(), pk=pk, owner=request.user)
        upload = request.FILES.get("photo")
        if not upload or upload.size > 10 * 1024 * 1024:
            return Response({"detail": "Выберите изображение до 10 МБ"}, status=400)
        if project.images.count() >= 8:
            return Response({"detail": "Можно добавить до 8 изображений"}, status=400)
        try:
            photo = shrink_photo(upload)
        except ValueError as error:
            return Response({"detail": str(error)}, status=400)
        project.images.create(image=photo)
        return Response(ProjectImageSerializer(project.images.all(), many=True).data, status=201)


class ProjectImageView(APIView):
    permission_classes = [IsClubUser]
    @transaction.atomic
    def patch(self, request, pk, image_id):
        project = get_object_or_404(Project.objects.select_for_update(), pk=pk, owner=request.user)
        image = get_object_or_404(project.images, pk=image_id)
        project.images.filter(is_cover=True).update(is_cover=False)
        image.is_cover = True
        image.save(update_fields=["is_cover"])
        return Response(ProjectImageSerializer(project.images.all(), many=True).data)

    @transaction.atomic
    def delete(self, request, pk, image_id):
        project = get_object_or_404(Project.objects.select_for_update(), pk=pk, owner=request.user)
        get_object_or_404(project.images, pk=image_id).delete()
        return Response(ProjectImageSerializer(project.images.all(), many=True).data)


class AccountView(APIView):
    permission_classes = [IsClubUser]
    @method_decorator(never_cache)
    def get(self, request):
        from club.event_desk import reward_status
        from club.membership import status as membership_status
        from club.models import GuestBooking
        guest_paid = GuestBooking.objects.filter(sale__member=request.user)
        return Response({
            "balance": format(account_balance(request.user), ".2f"),
            "membership": membership_status(request.user),
            "organizer_rewards": reward_status(request.user),
            "online_enabled": online_payments_enabled(),
            "merch": list(request.user.shop_orders.values("id","title","price","created_at").order_by("-pk")[:100]),
            "gifts": list(request.user.redeemed_gifts.filter(purpose="gift_tokens").values("id","amount","redeemed_at").order_by("-redeemed_at")[:100]),
            "online": list(request.user.online_payments.filter(purpose="topup").order_by("-created_at").values("order_id", "amount", "confirmed_at", "status", "needs_review")[:100]),
            "guest_charges": list(guest_paid.order_by("-created_at").values("id", "event__title", "price", "payment", "created_at")[:100]),
            "guest_refunds": list(guest_paid.filter(refunded=True).order_by("-cancelled_at").values("id", "event__title", "price", "payment", "cancelled_at")[:100]),
            "walkins": list(request.user.walkins.order_by("-created_at").values("id", "price", "created_at", "package_sale_id")[:100]),
            "packs": list(request.user.pack_purchases.order_by("-created_at").values("id", "price", "visits", "created_at")[:100]),
            "card_grants": list(request.user.membership_sales.filter(credit_grant__gt=0, starts_at__lte=timezone.now()).order_by("-starts_at").values("id", "credit_grant", "starts_at")[:100]),
            "recordings": list(request.user.recording_purchases.order_by("-created_at").values("id", "recording__title", "created_at", "price")[:100]),
            "charges": list(request.user.resident_bookings.order_by("-created_at").values(
                "id", "event__title", "price", "package_sale_id", "created_at")[:100]),
            "refunds": list(request.user.resident_bookings.filter(refunded=True).order_by("-cancelled_at").values(
                "id", "event__title", "price", "package_sale_id", "cancelled_at")[:100]),
            "topups": list(request.user.topups.values("id", "amount", "created_at")[:100]),
        })
