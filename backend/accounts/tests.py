import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

User = get_user_model()

GOOD_PASSWORD = "Learn-to-code-2026!"


class AuthApiTests(TestCase):
    """Sign up, log in, log out and 'me' behave as designed."""

    def post_json(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type="application/json")

    def me(self):
        return self.client.get("/api/auth/me").json()["user"]

    # --- Sign up ---------------------------------------------------------

    def test_signup_creates_user_and_logs_in(self):
        res = self.post_json("/api/auth/signup", {
            "name": "Ana", "email": "Ana@Example.com", "password": GOOD_PASSWORD,
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["user"]["email"], "ana@example.com")  # stored lowercase
        self.assertTrue(User.objects.filter(email="ana@example.com").exists())
        self.assertEqual(self.me()["email"], "ana@example.com")           # logged in

    def test_signup_rejects_weak_password(self):
        res = self.post_json("/api/auth/signup", {
            "email": "ana@example.com", "password": "12345678",
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("password", res.json()["errors"])
        self.assertFalse(User.objects.exists())

    def test_signup_rejects_invalid_email(self):
        res = self.post_json("/api/auth/signup", {
            "email": "not-an-email", "password": GOOD_PASSWORD,
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("email", res.json()["errors"])

    def test_signup_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        res = self.post_json("/api/auth/signup", {
            "email": "ANA@example.com", "password": GOOD_PASSWORD,
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("email", res.json()["errors"])

    def test_new_user_is_not_staff(self):
        self.post_json("/api/auth/signup", {
            "email": "ana@example.com", "password": GOOD_PASSWORD,
        })
        user = User.objects.get(email="ana@example.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_password_is_stored_hashed(self):
        user = User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        self.assertNotEqual(user.password, GOOD_PASSWORD)
        self.assertTrue(user.check_password(GOOD_PASSWORD))

    # --- Log in / log out ------------------------------------------------

    def test_login_with_correct_password(self):
        User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        res = self.post_json("/api/auth/login", {
            "email": "ana@example.com", "password": GOOD_PASSWORD,
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.me()["email"], "ana@example.com")

    def test_login_with_wrong_password(self):
        User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        res = self.post_json("/api/auth/login", {
            "email": "ana@example.com", "password": "wrong-password",
        })
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"], "Invalid email or password.")
        self.assertIsNone(self.me())

    def test_login_unknown_email_gives_same_error(self):
        res = self.post_json("/api/auth/login", {
            "email": "nobody@example.com", "password": GOOD_PASSWORD,
        })
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"], "Invalid email or password.")

    def test_login_requires_post(self):
        res = self.client.get("/api/auth/login")
        self.assertEqual(res.status_code, 405)

    def test_logout(self):
        user = User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        self.client.force_login(user)
        res = self.client.post("/api/auth/logout")
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(self.me())


class CsrfTests(TestCase):
    """Django's test client skips CSRF checks by default; these clients enforce them."""

    def setUp(self):
        User.objects.create_user(email="ana@example.com", password=GOOD_PASSWORD)
        self.body = json.dumps({"email": "ana@example.com", "password": GOOD_PASSWORD})

    def test_post_without_csrf_token_is_rejected(self):
        client = Client(enforce_csrf_checks=True)
        res = client.post("/api/auth/login", data=self.body, content_type="application/json")
        self.assertEqual(res.status_code, 403)

    def test_post_with_csrf_token_is_accepted(self):
        client = Client(enforce_csrf_checks=True)
        client.get("/api/auth/csrf")
        token = client.cookies["csrftoken"].value
        res = client.post(
            "/api/auth/login",
            data=self.body,
            content_type="application/json",
            headers={"X-CSRFToken": token},
        )
        self.assertEqual(res.status_code, 200)