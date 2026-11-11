from rest_framework.permissions import BasePermission


class IsClubUser(BasePermission):
    """Участник портала; служебные аккаунты не участвуют в жизни клуба."""
    message = "Этот раздел доступен только участникам клуба, не персоналу."

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and not request.user.is_staff)


class CanAccessOwnProfile(IsClubUser):
    def has_permission(self, request, view):
        # GET нужен всем ролям для определения текущей сессии на фронтенде.
        return bool(request.user.is_authenticated and (
            request.method in ("GET", "HEAD", "OPTIONS") or not request.user.is_staff
        ))
