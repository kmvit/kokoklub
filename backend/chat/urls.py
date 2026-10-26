from django.urls import path

from . import views

urlpatterns = [
    path("chats/", views.ConversationListView.as_view()),
    path("chats/<int:pk>/", views.ConversationView.as_view()),
    path("chats/<int:pk>/messages/", views.MessageCreateView.as_view()),
]
