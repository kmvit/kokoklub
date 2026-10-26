from django.urls import path

from . import views

urlpatterns = [
    path("staff/members/", views.StaffMembersView.as_view()),
    path("staff/members/<int:pk>/", views.StaffMemberView.as_view()),
    path("staff/members/<int:pk>/card/", views.MemberCardView.as_view()),
    path("staff/scan/", views.ScanView.as_view()),
    path("staff/inside/", views.InsideView.as_view()),
    path("staff/visits/<int:pk>/leave/", views.LeaveView.as_view()),
]
