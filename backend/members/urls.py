from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import auth, views

urlpatterns = [
    path("auth/register/", auth.RegisterView.as_view()),
    path("auth/login/", auth.LoginView.as_view()),
    path("auth/logout/", auth.LogoutView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("events/", views.EventsView.as_view()),
    path("projects/", views.ProjectsView.as_view()),
    path("me/account/", views.AccountView.as_view()),
    path("me/", views.MeView.as_view()),
    path("me/photo/", views.MyPhotoView.as_view()),
    path("site/", views.SiteView.as_view()),
    path("activities/", views.ActivityListView.as_view()),
    path("hobbies/", views.HobbyListView.as_view()),
    path("members/", views.MemberListView.as_view()),
    path("members/<int:pk>/", views.MemberDetailView.as_view()),
]
