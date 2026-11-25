import json
from collections import Counter
from pathlib import Path

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, Message
from .program import open_ideas
from .community import IsResident
from .models import ClubPost, Discussion, DiscussionReply, PollVote, TopicPreference

CONFIG = json.loads(Path(__file__).with_name("forum_topics.json").read_text())
TOPICS = {item["k"]: item for item in CONFIG["topics"]}


def moderator(user):
    return user.has_perm("members.change_discussion")


def resident(user):
    return user.is_authenticated and user.is_member


def name(user):
    return user.full_name or ("Команда клуба" if user.is_staff else "Резидент")


def posts_for(user):
    rows = ClubPost.objects.filter(visible=True, author__is_hidden=False, author__is_active=True)
    return rows if resident(user) or moderator(user) else rows.filter(author__is_staff=True)


def toggle(rel, user):
    on = not rel.filter(pk=user.pk).exists()
    if on:
        rel.add(user)
    else:
        rel.remove(user)
    return on


class FeedInput(serializers.Serializer):
    text = serializers.CharField(max_length=2400)
    title = serializers.CharField(required=False, allow_blank=True, max_length=140)
    poll_q = serializers.CharField(required=False, allow_blank=True, max_length=140)
    poll = serializers.ListField(child=serializers.CharField(max_length=100, allow_blank=True), max_length=12, required=False)
    pinned = serializers.BooleanField(default=False)


class Stream(APIView):
    permission_classes = [AllowAny]

    def get(self, request, action=None, pk=None):
        if action or pk:
            return self.http_method_not_allowed(request)
        user = request.user
        rows = posts_for(user).select_related("author").prefetch_related("likes", "votes", "respondents").order_by("-created_at")[:120]
        posts, offers = [], []
        for p in rows:
            row = {"id": str(p.pk), "ts": p.created_at, "by_name": name(p.author), "text": p.text, "title": p.title,
                   "club": p.author.is_staff, "pinned": p.pinned, "mine": user in p.likes.all(),
                   "reacts": {"Нравится": len(p.likes.all())}}
            if p.kind == "offer":
                offers.append({**row, "mine": user.pk == p.author_id, "wants": len(p.respondents.all()),
                               "wanted": user in p.respondents.all()})
                continue
            row["mine"] = "Нравится" if row["mine"] else None
            if p.kind == "poll":
                votes = {v.member_id: v.option if v.option is not None else int(not v.support) for v in p.votes.all()}
                counts = Counter(votes.values())
                row["poll"] = {"q": p.poll_question or p.text, "total": len(votes), "mine": votes.get(user.pk),
                               "options": [{"t": text, "n": counts[i]} for i, text in enumerate(p.poll_choices or ["За", "Против"])]}
            posts.append(row)
        return Response({"posts": posts, "offers": offers, "ideas": open_ideas(user), "can_post": resident(user) or moderator(user),
                         "can_vote": resident(user), "can_react": resident(user), "admin": moderator(user)})

    @transaction.atomic
    def post(self, request, action=None, pk=None):
        user = request.user
        if not resident(user) and not (action is None and moderator(user)):
            raise PermissionDenied()
        if action is None or action == "offer":
            body = FeedInput(data=request.data)
            body.is_valid(raise_exception=True)
            args = body.validated_data
            choices = [v for v in args.get("poll", []) if v]
            if choices and len(set(choices)) < 2:
                raise serializers.ValidationError("Добавьте два разных варианта.")
            post = ClubPost.objects.create(author=user, kind="offer" if action == "offer" else "poll" if choices else "note",
                text=args["text"], title=args.get("title", ""), poll_question=args.get("poll_q", ""),
                poll_choices=choices, pinned=moderator(user) and args["pinned"])
            return Response({"id": str(post.pk)}, status=201)
        post = get_object_or_404(posts_for(user).select_for_update(), pk=pk)
        if action == "react":
            toggle(post.likes, user)
        elif action == "poll" and post.kind == "poll":
            option = request.data.get("opt")
            if type(option) is not int or not 0 <= option < len(post.poll_choices or ["За", "Против"]):
                raise serializers.ValidationError("Выберите вариант из списка.")
            PollVote.objects.update_or_create(post=post, member=user, defaults={"support": option == 0, "option": option})
        elif action == "want" and post.kind == "offer" and post.author_id != user.pk:
            if not post.respondents.filter(pk=user.pk).exists():
                conv = Conversation.between(user, post.author)
                conv = Conversation.objects.select_for_update().get(pk=conv.pk)
                if conv.introduction_by_id and conv.consent != "accepted":
                    raise serializers.ValidationError("Дождитесь согласия на знакомство в переписке.")
                if not conv.introduction_by_id:
                    conv.introduction_by = user
                    conv.save(update_fields=["introduction_by"])
                Message.objects.create(conversation=conv, sender=user, text=f"Интересует ваше предложение «{post.title}».")
                post.respondents.add(user)
        elif action == "close" and post.kind == "offer" and post.author_id == user.pk:
            post.visible = False
            post.save(update_fields=["visible"])
        else:
            raise PermissionDenied()
        return Response({"ok": True})


class ReplyInput(serializers.Serializer):
    text = serializers.CharField(max_length=2000)
    reply_to = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class NewThread(ReplyInput):
    title = serializers.CharField(max_length=140)


class ForumAccess(IsResident):
    def has_permission(self, request, view):
        return super().has_permission(request, view) or (request.method == "GET" and moderator(request.user))


class Forum(APIView):
    permission_classes = [ForumAccess]

    def get(self, request, topic=None):
        if topic and topic != "all" and topic not in TOPICS:
            raise serializers.ValidationError("Неизвестная тема.")
        rows = Discussion.objects.filter(post__isnull=True, author__is_active=True, author__is_hidden=False)
        if topic and topic != "all":
            rows = rows.filter(topic=topic)
        threads = []
        for th in rows.select_related("author").prefetch_related("replies__author").order_by("-pinned", "-created_at"):
            messages = [m for m in th.replies.all() if not m.hidden and m.author.is_active and not m.author.is_hidden]
            threads.append({"id": str(th.pk), "topic": th.topic, "topic_name": TOPICS[th.topic]["name"], "by": name(th.author),
                            "title": th.title, "pinned": th.pinned, "n": len(messages), "last": messages[-1].created_at if messages else th.created_at,
                            "texts": " ".join(m.text for m in messages), "first": messages[0].text[:120] if messages else ""})
        if topic:
            return Response({"topic": TOPICS.get(topic), "threads": threads})
        stars = set(TopicPreference.objects.filter(member=request.user).values_list("topic", flat=True))
        return Response({"week": CONFIG["week"], "topics": [{**info, "star": k in stars, "score": int(k in stars),
            "msgs": sum(t["n"] for t in threads if t["topic"] == k), "threads": sum(t["topic"] == k for t in threads)} for k, info in TOPICS.items()]})

    @transaction.atomic
    def post(self, request, topic=None, star=False):
        if topic not in TOPICS:
            raise serializers.ValidationError("Неизвестная тема.")
        if star:
            row, created = TopicPreference.objects.get_or_create(topic=topic, member=request.user)
            if not created:
                row.delete()
            return Response({"star": created})
        data = NewThread(data=request.data)
        data.is_valid(raise_exception=True)
        th = Discussion.objects.create(topic=topic, title=data.validated_data["title"], author=request.user)
        DiscussionReply.objects.create(discussion=th, author=request.user, text=data.validated_data["text"])
        return Response({"id": str(th.pk)}, status=201)


class Thread(APIView):
    permission_classes = [AllowAny]

    def target(self, key, user, create=False):
        if key.startswith("c_"):
            post = get_object_or_404(posts_for(user), pk=key[2:])
            if create:
                return Discussion.objects.get_or_create(post=post, defaults={"topic":"comments", "title":post.title or post.text[:100], "author":post.author})[0]
            return Discussion.objects.filter(post=post).first()
        if not resident(user) and not moderator(user):
            raise PermissionDenied()
        return get_object_or_404(Discussion, pk=key, post__isnull=True, author__is_hidden=False, author__is_active=True)

    def get(self, request, key):
        user = request.user
        th = self.target(key, user)
        msgs = []
        if th:
            rows = th.replies.filter(author__is_hidden=False, author__is_active=True).select_related("author", "reply_to__author").prefetch_related("likes")
            for m in rows.order_by("pk"):
                reply = m.reply_to
                msgs.append({"id": str(m.pk), "name": name(m.author), "text": "" if m.hidden else m.text, "mine": user.pk == m.author_id,
                             "reply": {"name": name(reply.author), "text": reply.text[:140]} if reply and not reply.hidden and reply.author.is_active and not reply.author.is_hidden else None,
                             "ts": m.created_at, "hidden": m.hidden, "reacts":{"Нравится":len(m.likes.all())}, "my":"Нравится" if user in m.likes.all() else None})
        topic = th.topic if th else "comments"
        return Response({"thread":{"id":key, "title":th.title if th else "", "topic":topic, "topic_name":TOPICS.get(topic, {}).get("name","Комментарии"), "pinned":bool(th and th.pinned)},
                         "msgs":msgs,"can_write":resident(user),"admin":moderator(user)})

    @transaction.atomic
    def post(self, request, key):
        if not resident(request.user):
            raise PermissionDenied()
        data = ReplyInput(data=request.data)
        data.is_valid(raise_exception=True)
        thread = self.target(key, request.user, True)
        pk = data.validated_data.get("reply_to")
        reply = get_object_or_404(thread.replies, pk=pk, hidden=False) if pk else None
        DiscussionReply.objects.create(discussion=thread, author=request.user, text=data.validated_data["text"], reply_to=reply)
        return Response(status=201)


class ModerateDiscussion(APIView):
    @transaction.atomic
    def post(self, request, pk, action):
        if action in ("hide", "pin") and not moderator(request.user):
            raise PermissionDenied()
        if action == "pin":
            th = get_object_or_404(Discussion.objects.select_for_update(), pk=pk)
            th.pinned = not th.pinned
            th.save(update_fields=["pinned"])
            return Response({"pinned": th.pinned})
        msg = get_object_or_404(DiscussionReply.objects.select_for_update(), pk=pk, author__is_active=True, author__is_hidden=False)
        if action == "hide":
            msg.hidden = not msg.hidden
            msg.save(update_fields=["hidden"])
            return Response({"hidden":msg.hidden})
        if not resident(request.user) or msg.hidden or (msg.discussion.post_id and not posts_for(request.user).filter(pk=msg.discussion.post_id).exists()):
            raise PermissionDenied()
        if action == "report":
            msg.reports.add(request.user)
        elif action == "react":
            toggle(msg.likes, request.user)
        else:
            raise serializers.ValidationError("Неизвестное действие.")
        return Response({"ok":True})
