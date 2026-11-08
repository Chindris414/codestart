from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse

from .models import Exercise, Lesson, Module, Track

User = get_user_model()


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

    def test_order_is_a_sort_key_so_duplicates_are_allowed(self):
        """`order` is not unique; two items may share a position."""
        track, module, *_ = build_track()
        Module.objects.create(track=track, slug="strings", title="Strings", order=1)
        Lesson.objects.create(module=module, slug="while-loops", title="While loops", order=1)
        self.assertEqual(track.modules.count(), 2)
        self.assertEqual(module.lessons.count(), 2)

    def test_items_sharing_a_position_sort_by_id(self):
        """Ties must be broken deterministically, not left to the database."""
        _, module, first, _ = build_track()
        second = Lesson.objects.create(
            module=module, slug="while-loops", title="While loops", order=1
        )
        self.assertEqual(list(module.lessons.all()), [first, second])

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


class AdminReorderTests(TestCase):
    """Reordering lessons by hand in the admin has to actually work.

    While `order` was unique per module, each inline form checked itself
    against the database on its own, so a straight swap of two positions was
    rejected before it ever reached the database.
    """

    def setUp(self):
        self.track, self.module, self.first, _ = build_track()
        self.second = Lesson.objects.create(
            module=self.module, slug="while-loops", title="While loops", order=2
        )
        admin_user = User.objects.create_superuser("admin@example.com", "pw-for-tests-only")
        self.client.force_login(admin_user)

    def swap_payload(self):
        """Module change form with the two lessons' order values exchanged."""
        return {
            "track": str(self.track.pk),
            "slug": self.module.slug,
            "title": self.module.title,
            "description": self.module.description,
            "order": str(self.module.order),
            "lessons-TOTAL_FORMS": "2",
            "lessons-INITIAL_FORMS": "2",
            "lessons-MIN_NUM_FORMS": "0",
            "lessons-MAX_NUM_FORMS": "1000",
            "lessons-0-id": str(self.first.pk),
            "lessons-0-module": str(self.module.pk),
            "lessons-0-slug": self.first.slug,
            "lessons-0-title": self.first.title,
            "lessons-0-lesson_type": self.first.lesson_type,
            "lessons-0-estimated_minutes": str(self.first.estimated_minutes),
            "lessons-0-order": "2",  # was 1
            "lessons-1-id": str(self.second.pk),
            "lessons-1-module": str(self.module.pk),
            "lessons-1-slug": self.second.slug,
            "lessons-1-title": self.second.title,
            "lessons-1-lesson_type": self.second.lesson_type,
            "lessons-1-estimated_minutes": str(self.second.estimated_minutes),
            "lessons-1-order": "1",  # was 2
            "_save": "Save",
        }

    def test_two_lessons_can_swap_order_through_the_admin(self):
        url = reverse("admin:learning_module_change", args=[self.module.pk])
        response = self.client.post(url, self.swap_payload())

        self.assertEqual(response.status_code, 302, "the admin rejected the swap")
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.order, 2)
        self.assertEqual(self.second.order, 1)

    def test_renumbering_to_the_same_position_is_accepted(self):
        """`order` only sorts, so the admin lets two lessons share a position."""
        payload = self.swap_payload()
        payload["lessons-0-order"] = "1"
        payload["lessons-1-order"] = "1"  # both claim position 1

        url = reverse("admin:learning_module_change", args=[self.module.pk])
        response = self.client.post(url, payload)

        self.assertEqual(response.status_code, 302, "the admin rejected the save")
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual((self.first.order, self.second.order), (1, 1))
        # The tie is broken by id, so the listing order is still predictable.
        self.assertEqual(list(self.module.lessons.all()), [self.first, self.second])

    def test_slug_is_still_unique_within_a_module(self):
        """Dropping the order rule must not loosen the slug rule."""
        payload = self.swap_payload()
        payload["lessons-0-order"] = "1"
        payload["lessons-1-order"] = "2"
        payload["lessons-1-slug"] = self.first.slug  # clashes with the other lesson

        url = reverse("admin:learning_module_change", args=[self.module.pk])
        response = self.client.post(url, payload)

        self.assertEqual(response.status_code, 200, "the duplicate slug was accepted")
        self.second.refresh_from_db()
        self.assertEqual(self.second.slug, "while-loops", "nothing should change")


class AdminRegistrationTests(TestCase):
    def test_all_content_models_are_registered_in_admin(self):
        from django.contrib import admin

        for model in (Track, Module, Lesson, Exercise):
            self.assertIn(model, admin.site._registry)
