from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import Exercise, Lesson, Module, Track


def build_track():
    track = Track.objects.create(slug="python-fundamentals", title="Python Fundamentals")
    module = Module.objects.create(track=track, slug="loops", title="Loops", order=1)
    lesson = Lesson.objects.create(
        module=module,
        slug="for-loops",
        title="For loops",
        lesson_type=Lesson.Type.EXERCISE,
        order=1,
    )
    exercise = Exercise.objects.create(
        lesson=lesson,
        slug="count-to-ten",
        title="Count to ten",
        starter_code="# your code here\n",
        visible_tests="def test_output():\n    ...\n",
    )
    return track, module, lesson, exercise


class ContentModelTests(TestCase):
    def test_full_hierarchy_can_be_created_and_traversed(self):
        track, module, lesson, exercise = build_track()
        self.assertEqual(list(track.modules.all()), [module])
        self.assertEqual(list(module.lessons.all()), [lesson])
        self.assertEqual(list(lesson.exercises.all()), [exercise])
        self.assertEqual(exercise.lesson.module.track, track)

    def test_tracks_are_unpublished_by_default(self):
        track, *_ = build_track()
        self.assertFalse(track.is_published)
        self.assertTrue(track.enforce_module_order)

    def test_module_slug_unique_per_track_but_reusable_across_tracks(self):
        track, *_ = build_track()
        other = Track.objects.create(slug="web-basics", title="Web Basics")
        Module.objects.create(track=other, slug="loops", title="Loops", order=1)  # fine
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Module.objects.create(track=track, slug="loops", title="Loops again", order=2)

    def test_module_order_unique_per_track(self):
        track, *_ = build_track()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Module.objects.create(track=track, slug="strings", title="Strings", order=1)

    def test_lesson_order_unique_per_module(self):
        _, module, *_ = build_track()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            Lesson.objects.create(module=module, slug="while-loops", title="While loops", order=1)

    def test_modules_and_lessons_come_back_in_order(self):
        track, module, *_ = build_track()
        Module.objects.create(track=track, slug="functions", title="Functions", order=2)
        first, second = track.modules.all()
        self.assertEqual((first.order, second.order), (1, 2))
        Lesson.objects.create(module=module, slug="while-loops", title="While loops", order=2)
        self.assertEqual([lesson.order for lesson in module.lessons.all()], [1, 2])

    def test_deleting_a_track_removes_its_content(self):
        track, *_ = build_track()
        track.delete()
        self.assertEqual(Module.objects.count(), 0)
        self.assertEqual(Lesson.objects.count(), 0)
        self.assertEqual(Exercise.objects.count(), 0)


class AdminRegistrationTests(TestCase):
    def test_all_content_models_are_registered_in_admin(self):
        from django.contrib import admin

        for model in (Track, Module, Lesson, Exercise):
            self.assertIn(model, admin.site._registry)
