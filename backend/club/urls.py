from django.urls import path

from . import bar, team, views
from .invitations import Ticket, InvitationLink, CancelGuestPlaceView, InvitationView, GuestPlaceView, StaffGuestArrivalsView, StaffGuestCheckInView
from .event_desk import MemberEventDesk
from .packs import VisitPacksView
from .membership import StaffMembershipView

urlpatterns = [
    path("tickets/<uuid:key>/", Ticket.as_view()),
    path("me/invitations/<int:pk>/link/", InvitationLink.as_view()),
    path("team/", team.Team.as_view()),
    path("team/<slug:action>/", team.Team.as_view()),
    path("team/cards/<int:pk>/<slug:action>/", team.Team.as_view()),
    path("team/ideas/<int:pk>/vote/", team.Team.as_view(), {"action":"vote"}),
    path("admin/orders/", bar.Orders.as_view()),
    path("admin/ratings/", bar.Orders.as_view()),
    path("orders/mine/", bar.MyOrders.as_view()),
    path("orders/<int:pk>/rate/", bar.MyOrders.as_view()),
    path("council/", bar.Menu.as_view()),
    path("council/wishes/", bar.Menu.as_view(), {"action":"wish"}),
    path("council/wishes/<int:pk>/want/", bar.Menu.as_view(), {"action":"want"}),
    path("council/<int:pk>/vote/", bar.Menu.as_view(), {"action":"vote"}),
    path("admin/council/", bar.Menu.as_view(), {"action":"open"}),
    path("admin/council/<int:pk>/close/", bar.Menu.as_view(), {"action":"close"}),
    path("admin/council/wishes/<int:pk>/done/", bar.Menu.as_view(), {"action":"done"}),
    path("me/visit-packs/", VisitPacksView.as_view()),
    path("staff/members/<int:pk>/event-desk/", MemberEventDesk.as_view()),
    path("me/invitations/<int:pk>/cancel/", CancelGuestPlaceView.as_view()),
    path("me/invitations/", InvitationView.as_view()),
    path("events/<int:pk>/guest-place/", GuestPlaceView.as_view()),
    path("staff/members/<int:pk>/guest-arrivals/", StaffGuestArrivalsView.as_view()),
    path("staff/members/<int:pk>/guest-arrivals/<int:booking_id>/", StaffGuestCheckInView.as_view()),
    path("staff/members/<int:pk>/membership/", StaffMembershipView.as_view()),
    path("staff/members/<int:pk>/topups/", views.StaffTopUpView.as_view()),
    path("staff/members/", views.StaffMembersView.as_view()),
    path("staff/members/<int:pk>/", views.StaffMemberView.as_view()),
    path("staff/members/<int:pk>/card/", views.MemberCardView.as_view()),
    path("staff/scan/", views.ScanView.as_view()),
    path("staff/card-lookup/", views.CardLookupView.as_view()),
    path("staff/inside/", views.InsideView.as_view()),
    path("staff/visits/<int:pk>/leave/", views.LeaveView.as_view()),
]
