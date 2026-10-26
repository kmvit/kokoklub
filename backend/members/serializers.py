import re

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from club.queries import open_visits

from .models import Activity, Hobby, User


class HobbiesField(serializers.Field):
    """Хобби отдаём и принимаем списком строк, теги создаются на лету."""

    def to_representation(self, value):
        return [h.name for h in value.all()]

    def to_internal_value(self, data):
        if not isinstance(data, list):
            raise serializers.ValidationError("Ожидается список")
        names = []
        for raw in data[:15]:
            name = Hobby.clean_name(str(raw))
            if name and name not in names:
                names.append(name)
        return names


def photo_url(user):
    return user.photo.url if user.photo else None


def in_club(user) -> bool:
    # в каталоге флаг уже посчитан аннотацией (club/queries.py)
    flag = getattr(user, "in_club", None)
    if flag is None:
        flag = open_visits().filter(member=user).exists()
    return flag


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = ["id", "name"]


class MemberShortSerializer(serializers.ModelSerializer):
    """Карточка участника в каталоге и в списке переписок."""

    photo = serializers.SerializerMethodField()
    activity = serializers.CharField(source="activity.name", default=None, read_only=True)
    hobbies = HobbiesField(read_only=True)
    in_club = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "full_name", "photo", "activity", "occupation", "hobbies",
            "status", "status_text", "in_club",
        ]

    def get_photo(self, obj):
        return photo_url(obj)

    def get_in_club(self, obj):
        return in_club(obj)


class MemberDetailSerializer(MemberShortSerializer):
    contacts = serializers.SerializerMethodField()
    member_since = serializers.SerializerMethodField()

    class Meta(MemberShortSerializer.Meta):
        fields = MemberShortSerializer.Meta.fields + [
            "about", "can_help", "looking_for", "contacts", "member_since",
        ]

    def get_contacts(self, obj):
        # Портал открыт всем, а контакты — только своим: членам клуба.
        viewer = self.context["request"].user
        if not viewer.is_authenticated or not (viewer.is_member or viewer == obj):
            return None
        return {
            "phone": f"+{obj.phone}" if obj.show_phone else None,
            "telegram": obj.telegram or None,
        }

    def get_member_since(self, obj):
        card = obj.cards.order_by("issued_at").first()
        return card.issued_at.date() if card else None


class MeSerializer(serializers.ModelSerializer):
    """Анкета и личный кабинет участника."""

    hobbies = HobbiesField(required=False)
    activity = serializers.PrimaryKeyRelatedField(
        queryset=Activity.objects.all(), allow_null=True, required=False,
    )
    photo = serializers.SerializerMethodField()
    consent = serializers.BooleanField(write_only=True, required=False)
    is_member = serializers.SerializerMethodField()
    in_club = serializers.SerializerMethodField()
    profile_complete = serializers.BooleanField(read_only=True)
    has_consent = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "phone", "full_name", "photo", "activity", "occupation", "hobbies",
            "about", "can_help", "looking_for", "telegram", "show_phone",
            "status", "status_text", "consent", "has_consent",
            "is_member", "in_club", "profile_complete", "is_staff", "is_hidden", "unread",
        ]
        read_only_fields = ["phone", "is_staff", "is_hidden"]

    def get_photo(self, obj):
        return photo_url(obj)

    def get_is_member(self, obj):
        return obj.is_member

    def get_in_club(self, obj):
        return in_club(obj)

    def get_has_consent(self, obj):
        return obj.consent_at is not None

    def get_unread(self, obj):
        from chat.models import Message

        return (
            Message.objects.filter(
                Q(conversation__user_a=obj) | Q(conversation__user_b=obj), read_at__isnull=True,
            )
            .exclude(sender=obj)
            .count()
        )

    def validate_full_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Укажите имя")
        return value

    def validate_telegram(self, value):
        value = value.strip().lstrip("@")
        if value.startswith("https://t.me/"):
            value = value.removeprefix("https://t.me/")
        if value and not re.fullmatch(r"[A-Za-z0-9_]{4,32}", value):
            raise serializers.ValidationError("Ник в Telegram — латиница, цифры и _, от 4 символов")
        return value

    def validate(self, attrs):
        if self.instance.consent_at is None and not attrs.get("consent"):
            raise serializers.ValidationError(
                {"consent": "Без согласия на обработку персональных данных анкету не сохранить"}
            )
        return attrs

    def update(self, instance, validated):
        hobbies = validated.pop("hobbies", None)
        if validated.pop("consent", False) and instance.consent_at is None:
            instance.consent_at = timezone.now()
        instance = super().update(instance, validated)
        if hobbies is not None:
            instance.hobbies.set([Hobby.objects.get_or_create(name=n)[0] for n in hobbies])
        return instance
