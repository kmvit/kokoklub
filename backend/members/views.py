from django.conf import settings
from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from club.queries import with_club_flags

from .images import shrink_photo
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
        User.objects.filter(is_active=True, is_hidden=False, consent_at__isnull=False)
        .exclude(full_name="")
        .select_related("activity")
        .prefetch_related("hobbies")
    )
    return with_club_flags(qs)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


class MyPhotoView(APIView):
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
        return Response({"menu_url": settings.MENU_URL or None})


class ActivityListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ActivitySerializer
    queryset = Activity.objects.all()
    pagination_class = None


class HobbyListView(APIView):
    """Популярные хобби — подсказки в анкете и фильтр каталога."""

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

    def get(self, request, pk):
        member = get_object_or_404(catalog_queryset(), pk=pk)
        return Response(MemberDetailSerializer(member, context={"request": request}).data)


class EventsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        from django.utils import timezone
        return Response(list(Event.objects.filter(is_published=True, starts_at__gte=timezone.now()).values(
            "id", "title", "description", "starts_at", "location",
        )))


def visible_projects():
    return (
        Project.objects.filter(owner__in=catalog_queryset())
        .select_related("owner")
        .prefetch_related("images")
    )


class ProjectsView(APIView):
    def get(self, request):
        return Response(ClubProjectSerializer(visible_projects(), many=True).data)


class ProjectDetailView(APIView):
    def get(self, request, pk):
        return Response(ClubProjectSerializer(get_object_or_404(visible_projects(), pk=pk)).data)


class ProjectImagesView(APIView):
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
    @method_decorator(never_cache)
    def get(self, request):
        return Response({
            "balance": format(account_balance(request.user), ".2f"),
            "topups": list(request.user.topups.values("id", "amount", "created_at")[:100]),
        })
