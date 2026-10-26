from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import auth, views

urlpatterns = [
    path("auth/code/", auth.RequestCodeView.as_view()),
    path("auth/verify/", auth.VerifyCodeView.as_view()),
    path("auth/staff/", auth.StaffLoginView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("me/", views.MeView.as_view()),
    path("me/photo/", views.MyPhotoView.as_view()),
    path("site/", views.SiteView.as_view()),
    path("activities/", views.ActivityListView.as_view()),
    path("hobbies/", views.HobbyListView.as_view()),
    path("members/", views.MemberListView.as_view()),
    path("members/<int:pk>/", views.MemberDetailView.as_view()),
]
