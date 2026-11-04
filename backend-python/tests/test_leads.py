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
                demo_leads_email="equipe@example.com",
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

    def _post(self, **extra):
        payload = {"nome": " Ana ", "email": " ana@example.com ", "telefone": " (11) 98765-4321 "}
        payload.update(extra)
        return self.client.post("/api/leads/demo-contact-email", json=payload)

    def _sent(self):
        return [call.args[0] for call in self.smtp_client.send_message.call_args_list]

    def test_notifies_team_and_confirms_to_submitted_email(self):
        response = self._post()

        self.assertEqual(response.status_code, 204, response.text)
        self.smtp_factory.assert_called_with("smtp.example.com", 465, timeout=15)
        self.smtp_client.login.assert_called_with("sender@example.com", "app-password")
        aviso, confirmacao = self._sent()
        self.assertEqual(aviso["To"], "equipe@example.com")
        self.assertEqual(aviso["Reply-To"], "ana@example.com")
        self.assertIn("Telefone: (11) 98765-4321", aviso.get_content())
        self.assertIn("Prefere contato por: E-mail", aviso.get_content())
        self.assertEqual(confirmacao["To"], "ana@example.com")
        self.assertEqual(confirmacao["From"], "noreply@example.com")
        self.assertIn("Olá, Ana!", confirmacao.get_content())
        self.assertIn("pedido de demonstração", confirmacao["Subject"])

    def test_phone_preference_only_notifies_team(self):
        response = self._post(preferencia="telefone")

        self.assertEqual(response.status_code, 204, response.text)
        (aviso,) = self._sent()
        self.assertEqual(aviso["To"], "equipe@example.com")
        self.assertIn("Prefere contato por: Telefone", aviso.get_content())

    def test_team_address_falls_back_to_sender(self):
        with patch(
            "app.services.get_settings",
            return_value=SimpleNamespace(
                smtp_user="sender@example.com",
                smtp_password="app-password",
                smtp_host="smtp.example.com",
                smtp_port=465,
                smtp_from_email="noreply@example.com",
                demo_leads_email=None,
            ),
        ):
            response = self._post(preferencia="telefone")

        self.assertEqual(response.status_code, 204, response.text)
        self.assertEqual(self._sent()[0]["To"], "noreply@example.com")

    def test_confirmation_failure_does_not_fail_request(self):
        self.smtp_client.send_message.side_effect = [None, OSError("caixa cheia")]

        response = self._post()

        self.assertEqual(response.status_code, 204, response.text)

    def test_rejects_invalid_email_without_sending(self):
        response = self.client.post(
            "/api/leads/demo-contact-email",
            json={"nome": "Ana", "email": "endereco-invalido", "telefone": "(11) 98765-4321"},
        )

        self.assertEqual(response.status_code, 422)
        self.smtp_factory.assert_not_called()

    def test_reports_smtp_failure(self):
        self.smtp_factory.side_effect = OSError("SMTP unavailable")

        response = self._post()

        self.assertEqual(response.status_code, 503)
        self.assertIn("Não foi possível enviar", response.json()["detail"])
