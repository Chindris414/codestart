"""Tests for autosaved exercise drafts: save, restore, reset and import."""

import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import Exercise, ExerciseDraft
from .test_api import build_published_track

User = get_user_model()

DRAFT_URL = "/api/tracks/python-basics/modules/intro/lessons/practice/exercises/print-hi/draft/"
MY_DRAFTS_URL = "/api/me/drafts/?lesson=python-basics/intro/practice"
IMPORT_URL = "/api/me/drafts/import/"

IMPORT_ITEM = {
    "lesson": "python-basics/intro/practice",
    "exercise": "print-hi",
    "code": "print('from the browser')",
}


class DraftApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        (
            cls.track,
            cls.module1,
            cls.module2,
            cls.sample,
            cls.locked,
            cls.last,
        ) = build_published_track()
        cls.exercise = Exercise.objects.get(slug="print-hi")
        cls.student = User.objects.create_user(
            email="student@example.com", password="correct-horse-battery"
        )
        cls.other = User.objects.create_user(
            email="other@example.com", password="correct-horse-battery"
        )

    def log_in(self, user=None):
        self.client.force_login(user or self.student)

    def put_draft(self, code, url=DRAFT_URL):
        return self.client.put(url, json.dumps({"code": code}), content_type="application/json")

    def import_drafts(self, drafts):
        return self.client.post(
            IMPORT_URL, json.dumps({"drafts": drafts}), content_type="application/json"
        )

    def saved_code(self, user=None):
        draft = ExerciseDraft.objects.filter(user=user or self.student, exercise=self.exercise).first()
        return draft.code if draft else None

    # -- login is required -------------------------------------------------

    def test_every_draft_endpoint_requires_login(self):
        responses = [
            self.client.get(MY_DRAFTS_URL),
            self.put_draft("x = 1"),
            self.client.delete(DRAFT_URL),
            self.import_drafts([IMPORT_ITEM]),
        ]
        for response in responses:
            self.assertEqual(response.status_code, 401)
        self.assertEqual(ExerciseDraft.objects.count(), 0)

    # -- save and restore --------------------------------------------------

    def test_saved_draft_comes_back_in_the_lesson_drafts(self):
        self.log_in()
        response = self.put_draft("print('hi')")
        self.assertEqual(response.status_code, 200)
        self.assertIn("saved_at", response.json())

        data = self.client.get(MY_DRAFTS_URL).json()
        self.assertEqual(data["drafts"]["print-hi"]["code"], "print('hi')")
        self.assertIn("saved_at", data["drafts"]["print-hi"])

    def test_saving_again_updates_the_same_row(self):
        self.log_in()
        self.put_draft("v1")
        self.put_draft("v2")
        self.assertEqual(ExerciseDraft.objects.count(), 1)
        self.assertEqual(self.saved_code(), "v2")

    def test_lesson_without_drafts_returns_an_empty_mapping(self):
        self.log_in()
        self.assertEqual(self.client.get(MY_DRAFTS_URL).json(), {"drafts": {}})

    def test_drafts_query_needs_a_full_lesson_path(self):
        self.log_in()
        for lesson in ("", "python-basics", "python-basics/intro", "a/b/c/d"):
            response = self.client.get(f"/api/me/drafts/?lesson={lesson}")
            self.assertEqual(response.status_code, 400, lesson)
        response = self.client.get("/api/me/drafts/?lesson=python-basics/intro/nope")
        self.assertEqual(response.status_code, 404)

    # -- validation --------------------------------------------------------

    def test_rejects_bad_bodies(self):
        self.log_in()
        bad = [
            self.client.put(DRAFT_URL, "not json", content_type="application/json"),
            self.client.put(DRAFT_URL, json.dumps({}), content_type="application/json"),
            self.client.put(DRAFT_URL, json.dumps({"code": 7}), content_type="application/json"),
            self.put_draft("x" * 100_001),
        ]
        for response in bad:
            self.assertEqual(response.status_code, 400)
        self.assertEqual(ExerciseDraft.objects.count(), 0)

    def test_get_is_not_allowed_on_the_draft_url(self):
        self.log_in()
        self.assertEqual(self.client.get(DRAFT_URL).status_code, 405)

    def test_unknown_or_unpublished_exercises_are_404(self):
        self.log_in()
        self.track.is_published = False
        self.track.save()
        self.assertEqual(self.put_draft("x").status_code, 404)
        self.track.is_published = True
        self.track.save()
        missing = DRAFT_URL.replace("print-hi", "nope")
        self.assertEqual(self.put_draft("x", url=missing).status_code, 404)

    # -- learners only ever touch their own drafts -------------------------

    def test_drafts_are_private_to_their_owner(self):
        ExerciseDraft.objects.create(user=self.other, exercise=self.exercise, code="other's work")

        self.log_in()
        self.assertEqual(self.client.get(MY_DRAFTS_URL).json(), {"drafts": {}})

        self.put_draft("mine")
        self.client.delete(DRAFT_URL)
        self.assertIsNone(self.saved_code())
        self.assertEqual(self.saved_code(user=self.other), "other's work")

    # -- reset (delete) ----------------------------------------------------

    def test_delete_removes_the_draft_and_is_idempotent(self):
        self.log_in()
        self.put_draft("to be reset")
        self.assertEqual(self.client.delete(DRAFT_URL).status_code, 200)
        self.assertIsNone(self.saved_code())
        self.assertEqual(self.client.delete(DRAFT_URL).status_code, 200)

    # -- import at login: newest wins ---------------------------------------

    def test_import_fills_an_empty_slot(self):
        self.log_in()
        response = self.import_drafts([{**IMPORT_ITEM, "saved_at": timezone.now().isoformat()}])
        self.assertEqual(response.json(), {"imported": 1, "skipped": 0})
        self.assertEqual(self.saved_code(), "print('from the browser')")

    def test_import_replaces_an_older_server_draft(self):
        self.log_in()
        self.put_draft("old server code")
        newer = (timezone.now() + timedelta(minutes=5)).isoformat()
        response = self.import_drafts([{**IMPORT_ITEM, "saved_at": newer}])
        self.assertEqual(response.json(), {"imported": 1, "skipped": 0})
        self.assertEqual(self.saved_code(), "print('from the browser')")

    def test_import_keeps_a_newer_server_draft(self):
        self.log_in()
        self.put_draft("newer server code")
        older = (timezone.now() - timedelta(days=1)).isoformat()
        response = self.import_drafts([{**IMPORT_ITEM, "saved_at": older}])
        self.assertEqual(response.json(), {"imported": 0, "skipped": 1})
        self.assertEqual(self.saved_code(), "newer server code")

    def test_import_without_a_usable_timestamp_never_overwrites(self):
        self.log_in()
        self.put_draft("server code")
        no_timestamp = dict(IMPORT_ITEM)
        naive = {**IMPORT_ITEM, "saved_at": "2099-01-01T00:00:00"}  # no timezone
        response = self.import_drafts([no_timestamp, naive])
        self.assertEqual(response.json(), {"imported": 0, "skipped": 2})
        self.assertEqual(self.saved_code(), "server code")

    def test_import_skips_junk_items_without_failing(self):
        self.log_in()
        response = self.import_drafts(
            [
                "not a dict",
                {"lesson": "python-basics/intro", "exercise": "print-hi", "code": "x"},
                {**IMPORT_ITEM, "exercise": "nope"},
                {**IMPORT_ITEM, "code": 7},
                IMPORT_ITEM,  # the one good item (no server draft yet)
            ]
        )
        self.assertEqual(response.json(), {"imported": 1, "skipped": 4})
        self.assertEqual(self.saved_code(), "print('from the browser')")

    def test_import_rejects_a_malformed_body(self):
        self.log_in()
        for body in ("not json", json.dumps({}), json.dumps({"drafts": "nope"})):
            response = self.client.post(IMPORT_URL, body, content_type="application/json")
            self.assertEqual(response.status_code, 400, body)

    def test_import_caps_the_number_of_items(self):
        self.log_in()
        response = self.import_drafts([IMPORT_ITEM] * 60)
        data = response.json()
        self.assertEqual(data["imported"] + data["skipped"], 50)
