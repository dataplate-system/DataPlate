import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.leads import router


class LeadContactEmailTest(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.settings = patch(
            "app.services.get_settings",
            return_value=SimpleNamespace(
                smtp_user="sender@example.com",
                smtp_password="app-password",
                smtp_host="smtp.example.com",
                smtp_port=465,
                smtp_from_email="noreply@example.com",
            ),
        )
        self.settings.start()
        self.smtp = patch("app.services.smtplib.SMTP_SSL")
        self.smtp_factory = self.smtp.start()
        self.smtp_client = self.smtp_factory.return_value.__enter__.return_value

    def tearDown(self):
        self.smtp.stop()
        self.settings.stop()
        self.client.close()

    def test_sends_confirmation_to_submitted_email(self):
        response = self.client.post(
            "/api/leads/demo-contact-email",
            json={"nome": " Ana ", "email": " ana@example.com "},
        )

        self.assertEqual(response.status_code, 204, response.text)
        self.smtp_factory.assert_called_once_with("smtp.example.com", 465, timeout=15)
        self.smtp_client.login.assert_called_once_with("sender@example.com", "app-password")
        email = self.smtp_client.send_message.call_args.args[0]
        self.assertEqual(email["To"], "ana@example.com")
        self.assertEqual(email["From"], "noreply@example.com")
        self.assertIn("Olá, Ana!", email.get_content())
        self.assertIn("pedido de demonstração", email["Subject"])

    def test_rejects_invalid_email_without_sending(self):
        response = self.client.post(
            "/api/leads/demo-contact-email",
            json={"nome": "Ana", "email": "endereco-invalido"},
        )

        self.assertEqual(response.status_code, 422)
        self.smtp_factory.assert_not_called()

    def test_reports_smtp_failure(self):
        self.smtp_factory.side_effect = OSError("SMTP unavailable")

        response = self.client.post(
            "/api/leads/demo-contact-email",
            json={"nome": "Ana", "email": "ana@example.com"},
        )

        self.assertEqual(response.status_code, 503)
        self.assertIn("Não foi possível enviar", response.json()["detail"])
