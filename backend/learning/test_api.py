"""Tests for the learner-facing track/module/lesson API."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import Exercise, Lesson, Module, Track

User = get_user_model()

SECRET_SOLUTION = "print('the secret solution')"
SECRET_HIDDEN_TEST = "def test_hidden_secret(): ..."


def build_published_track():
    """A published track: module 1 has a sample lesson and a locked exercise
    lesson (with secrets), module 2 has one more lesson."""
    track = Track.objects.create(slug="python-basics", title="Python Basics", is_published=True)
    module1 = Module.objects.create(track=track, slug="intro", title="Intro", order=1)
    module2 = Module.objects.create(track=track, slug="loops", title="Loops", order=2)
    sample = Lesson.objects.create(
        module=module1,
        slug="hello",
        title="Hello",
        body="# Hello\n\nSay hi.",
        order=1,
        is_sample=True,
    )
    locked = Lesson.objects.create(
        module=module1,
        slug="practice",
        title="Practice",
        lesson_type=Lesson.Type.EXERCISE,
        body="Secret practice text.",
        order=2,
    )
    Exercise.objects.create(
        lesson=locked,
        slug="print-hi",
        title="Print hi",
        instructions="Print `hi`.",
        starter_code="# start\n",
        solution_code=SECRET_SOLUTION,
        visible_tests="def test_visible(): ...",
        hidden_tests=SECRET_HIDDEN_TEST,
    )
    last = Lesson.objects.create(module=module2, slug="for-loops", title="For loops", order=1)
    return track, module1, module2, sample, locked, last


class TrackApiTests(TestCase):
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
        cls.hidden_track = Track.objects.create(slug="drafts", title="Drafts", is_published=False)
        hidden_module = Module.objects.create(track=cls.hidden_track, slug="wip", title="WIP", order=1)
        Lesson.objects.create(module=hidden_module, slug="draft", title="Draft", order=1, is_sample=True)
        cls.student = User.objects.create_user(email="student@example.com", password="correct-horse-battery")

    def log_in(self):
        self.client.force_login(self.student)

    def get(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, path)
        return response.json()

    # -- track list ------------------------------------------------------

    def test_track_list_shows_only_published_tracks(self):
        data = self.get("/api/tracks/")
        self.assertEqual([t["slug"] for t in data["tracks"]], ["python-basics"])
        self.assertEqual(data["tracks"][0]["module_count"], 2)
        self.assertEqual(data["tracks"][0]["lesson_count"], 3)

    # -- unpublished tracks ----------------------------------------------

    def test_unpublished_track_is_404_everywhere_even_when_logged_in(self):
        self.log_in()
        for path in (
            "/api/tracks/drafts/",
            "/api/tracks/drafts/modules/wip/",
            "/api/tracks/drafts/modules/wip/lessons/draft/",
        ):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_missing_objects_are_404(self):
        for path in (
            "/api/tracks/nope/",
            "/api/tracks/python-basics/modules/nope/",
            "/api/tracks/python-basics/modules/intro/lessons/nope/",
            # lesson exists, but under another module
            "/api/tracks/python-basics/modules/loops/lessons/hello/",
        ):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    # -- track and module pages ------------------------------------------

    def test_track_detail_marks_locked_lessons_for_visitors(self):
        data = self.get("/api/tracks/python-basics/")
        lessons = {l["slug"]: l for m in data["modules"] for l in m["lessons"]}
        self.assertFalse(lessons["hello"]["locked"])
        self.assertTrue(lessons["hello"]["is_sample"])
        self.assertTrue(lessons["practice"]["locked"])
        self.assertTrue(lessons["for-loops"]["locked"])
        self.assertEqual([m["slug"] for m in data["modules"]], ["intro", "loops"])

    def test_track_detail_unlocks_everything_when_logged_in(self):
        self.log_in()
        data = self.get("/api/tracks/python-basics/")
        locked = [l["slug"] for m in data["modules"] for l in m["lessons"] if l["locked"]]
        self.assertEqual(locked, [])

    def test_module_detail_lists_its_lessons_with_breadcrumb(self):
        data = self.get("/api/tracks/python-basics/modules/intro/")
        self.assertEqual(data["track"]["slug"], "python-basics")
        self.assertEqual(data["module"]["slug"], "intro")
        self.assertEqual([l["slug"] for l in data["lessons"]], ["hello", "practice"])

    # -- lesson page -------------------------------------------------------

    def test_visitor_can_read_a_sample_lesson(self):
        data = self.get("/api/tracks/python-basics/modules/intro/lessons/hello/")
        self.assertFalse(data["lesson"]["locked"])
        self.assertIn("Say hi.", data["lesson"]["body"])
        self.assertIsNone(data["previous"])
        self.assertEqual(data["next"]["lesson"], "practice")

    def test_visitor_gets_title_but_no_body_for_a_locked_lesson(self):
        data = self.get("/api/tracks/python-basics/modules/intro/lessons/practice/")
        self.assertTrue(data["lesson"]["locked"])
        self.assertEqual(data["lesson"]["title"], "Practice")
        self.assertNotIn("body", data["lesson"])
        self.assertNotIn("exercises", data["lesson"])

    def test_logged_in_user_can_read_every_lesson(self):
        self.log_in()
        data = self.get("/api/tracks/python-basics/modules/intro/lessons/practice/")
        self.assertFalse(data["lesson"]["locked"])
        self.assertEqual(data["lesson"]["body"], "Secret practice text.")
        exercise = data["lesson"]["exercises"][0]
        self.assertEqual(exercise["starter_code"], "# start\n")
        self.assertEqual(exercise["visible_tests"], "def test_visible(): ...")

    def test_previous_and_next_cross_module_boundaries(self):
        self.log_in()
        data = self.get("/api/tracks/python-basics/modules/intro/lessons/practice/")
        self.assertEqual(data["previous"], {"module": "intro", "lesson": "hello", "title": "Hello"})
        self.assertEqual(data["next"], {"module": "loops", "lesson": "for-loops", "title": "For loops"})
        data = self.get("/api/tracks/python-basics/modules/loops/lessons/for-loops/")
        self.assertEqual(data["previous"]["lesson"], "practice")
        self.assertIsNone(data["next"])

    # -- secrets never leave the server ------------------------------------

    def test_solutions_and_hidden_tests_never_appear_in_any_response(self):
        paths = (
            "/api/tracks/",
            "/api/tracks/python-basics/",
            "/api/tracks/python-basics/modules/intro/",
            "/api/tracks/python-basics/modules/intro/lessons/practice/",
        )
        for logged_in in (False, True):
            if logged_in:
                self.log_in()
            for path in paths:
                text = self.client.get(path).content.decode()
                self.assertNotIn(SECRET_SOLUTION, text, path)
                self.assertNotIn(SECRET_HIDDEN_TEST, text, path)
                self.assertNotIn("solution_code", text, path)
                self.assertNotIn("hidden_tests", text, path)

    def test_endpoints_are_read_only(self):
        self.assertEqual(self.client.post("/api/tracks/").status_code, 405)
