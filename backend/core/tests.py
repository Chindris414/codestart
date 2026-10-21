from django.test import TestCase


class HealthTests(TestCase):
    def test_health_reports_api_and_database_ok(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "database": "ok"})