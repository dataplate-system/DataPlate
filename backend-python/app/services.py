from datetime import datetime, timedelta
from email.message import EmailMessage
from hashlib import sha256
from html import escape as escape_html
import logging
import smtplib
from secrets import randbelow
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import EmailChangeToken, PasswordResetToken, User
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthPasswordResetStartRequest, AuthPasswordResetStartResponse, AuthRefreshRequest, AuthRegisterRequest, AuthResponse, DemoContactEmailRequest
from app.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password

logger = logging.getLogger(__name__)


def login(db: Session, request: AuthLoginRequest) -> AuthResponse:
    user = _get_user_by_cpf(db, request.cpf)
    if user is None or not user.ativo or not verify_password(request.senha, user.senha_hash):
        raise _bad_credentials("CPF ou senha invalidos")
    return _to_auth_response(user)


def refresh(db: Session, request: AuthRefreshRequest) -> AuthResponse:
    try:
        user_id = decode_refresh_token(request.refreshToken)
    except InvalidTokenError:
        raise _bad_credentials("Refresh token invalido") from None

    user = db.get(User, user_id)
    if user is None or not user.ativo:
        raise _bad_credentials("Refresh token invalido")

    return _to_auth_response(user)


def register(db: Session, request: AuthRegisterRequest) -> AuthResponse:
    nome = request.nome.strip()
    cpf = _only_digits(request.cpf)

    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatorio")
    if len(cpf) != 11:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF invalido")
    if _get_user_by_cpf(db, cpf) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"CPF ja cadastrado: {cpf}")

    user = User(nome=nome, cpf=cpf, senha_hash=hash_password(request.senha), role=request.role.value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_auth_response(user)


def request_password_reset(
    db: Session,
    request: AuthPasswordResetStartRequest,
    background_tasks: BackgroundTasks,
) -> AuthPasswordResetStartResponse:
    """A resposta e igual para qualquer CPF: um token sem registro falha depois como codigo invalido.

    O e-mail sai em segundo plano, para o tempo de resposta tambem nao revelar se o CPF existe.
    """
    settings = get_settings()
    user = _get_user_by_cpf(db, request.cpf)
    reset_token = uuid4()
    pode_receber = user is not None and user.ativo and (user.email or settings.password_reset_debug_code)
    if not pode_receber:
        return AuthPasswordResetStartResponse(resetToken=reset_token)

    code = f"{randbelow(1_000_000):06d}"
    db.add(PasswordResetToken(
        id=reset_token,
        user_id=user.id,
        code_hash=_password_reset_code_hash(code),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    ))
    db.commit()
    if settings.password_reset_debug_code:
        return AuthPasswordResetStartResponse(resetToken=reset_token, debugCode=code)

    background_tasks.add_task(_enviar_codigo_em_segundo_plano, user.email, code)
    return AuthPasswordResetStartResponse(resetToken=reset_token)


def verify_password_reset_code(db: Session, reset_token: UUID, code: str) -> PasswordResetToken:
    token = db.get(PasswordResetToken, reset_token)
    if token is None or token.used_at is not None or datetime.utcnow() > token.expires_at:
        raise _invalid_password_reset_code()
    if token.attempts >= 3:
        raise _invalid_password_reset_code()
    if _password_reset_code_hash(code) != token.code_hash:
        token.attempts += 1
        db.commit()
        raise _invalid_password_reset_code()
    return token


def reset_password(db: Session, request: AuthPasswordResetRequest) -> None:
    token = verify_password_reset_code(db, request.resetToken, request.codigo)
    user = db.get(User, token.user_id)
    if user is None or not user.ativo:
        raise _invalid_password_reset_code()

    user.senha_hash = hash_password(request.novaSenha)
    token.used_at = datetime.utcnow()
    db.commit()


def change_own_password(db: Session, user: User, new_password: str) -> None:
    user.senha_hash = hash_password(new_password)
    db.commit()


def request_own_recovery_email_change(db: Session, user: User, email: str) -> None:
    normalized_email = email.strip().lower()
    existing_user = db.scalar(select(User).where(User.email == normalized_email, User.id != user.id))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já está sendo usado por outra conta.",
        )

    agora = datetime.utcnow()
    for token in db.scalars(
        select(EmailChangeToken).where(
            EmailChangeToken.user_id == user.id,
            EmailChangeToken.used_at.is_(None),
        )
    ):
        token.used_at = agora

    code = f"{randbelow(1_000_000):06d}"
    token = EmailChangeToken(
        id=uuid4(),
        user_id=user.id,
        email=normalized_email,
        code_hash=_email_change_code_hash(code),
        expires_at=agora + timedelta(minutes=10),
    )
    db.add(token)
    db.commit()
    try:
        _send_email_change_code(normalized_email, code)
    except HTTPException:
        token.used_at = datetime.utcnow()
        db.commit()
        raise


def confirm_own_recovery_email_change(db: Session, user: User, code: str) -> None:
    agora = datetime.utcnow()
    token = db.scalar(
        select(EmailChangeToken)
        .where(
            EmailChangeToken.user_id == user.id,
            EmailChangeToken.used_at.is_(None),
        )
        .order_by(EmailChangeToken.created_at.desc())
        .limit(1)
    )
    if token is None or token.expires_at < agora or token.attempts >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de confirmação inválido ou expirado.",
        )
    if _email_change_code_hash(code) != token.code_hash:
        token.attempts += 1
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código de confirmação inválido ou expirado.",
        )

    existing_user = db.scalar(select(User).where(User.email == token.email, User.id != user.id))
    if existing_user is not None:
        token.used_at = agora
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já está sendo usado por outra conta. Solicite a alteração novamente.",
        )

    user.email = token.email
    token.used_at = agora
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este e-mail já está sendo usado por outra conta. Solicite a alteração novamente.",
        ) from None


def _email_change_code_hash(code: str) -> str:
    secret = get_settings().effective_password_reset_secret
    return sha256(f"{secret}:email-change:{code}".encode("utf-8")).hexdigest()


def _send_email_change_code(email: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "DataPlate - confirme seu novo e-mail de recuperação"
    message["To"] = email
    message.set_content(
        f"Use o código {code} para confirmar este endereço como seu e-mail de recuperação do DataPlate.\n\n"
        "O código expira em 10 minutos. Se você não solicitou esta alteração, ignore este e-mail."
    )
    message.add_alternative(
        _email_layout(
            "",
            f"""
            <h1 style="margin:0 0 12px;text-align:center;color:#193b30;font-size:24px;line-height:1.3;">Confirme seu e-mail</h1>
            <p style="margin:0 0 16px;text-align:center;color:#394b45;font-size:16px;line-height:1.6;">Use o código abaixo para confirmar este endereço como seu e-mail de recuperação.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr><td align="center" bgcolor="#f0f3ef" style="border-radius:15px;padding:17px 12px 13px;">
                <div style="color:#193b30;font-size:29px;font-weight:bold;letter-spacing:3px;line-height:1.3;">{escape_html(code)}</div>
                <div style="margin-top:5px;color:#718078;font-size:13px;letter-spacing:.5px;">CÓDIGO DE CONFIRMAÇÃO</div>
              </td></tr>
            </table>
            <p style="margin:18px 0;color:#a9600b;text-align:center;font-size:16px;font-weight:bold;">Expira em 10 minutos</p>
            <p style="margin:0;color:#394b45;font-size:14px;line-height:1.6;">Se você não solicitou esta alteração, ignore este e-mail. Seu endereço atual permanece ativo.</p>
            """,
            "DataPlate | Segurança e privacidade para seu negócio.",
        ),
        subtype="html",
    )
    _send_smtp_email(
        message,
        "Envio de e-mail de confirmação não configurado",
        "Não foi possível enviar o código de confirmação. Verifique as configurações SMTP.",
        "Falha ao enviar o código de confirmação de alteração de e-mail.",
    )


def send_demo_contact_email(request: DemoContactEmailRequest) -> None:
    settings = get_settings()
    preferencia = "E-mail" if request.preferencia == "email" else "Telefone"

    # Aviso para a equipe: obrigatorio, o pedido so conta como enviado se ele sair.
    aviso = EmailMessage()
    aviso["Subject"] = f"DataPlate - novo pedido de demonstração: {request.nome}"
    aviso["To"] = settings.demo_leads_email or settings.smtp_from_email or settings.smtp_user or ""
    aviso["Reply-To"] = request.email
    aviso.set_content(
        "Novo pedido de demonstração pela página inicial.\n\n"
        f"Nome: {request.nome}\n"
        f"E-mail: {request.email}\n"
        f"Telefone: {request.telefone}\n"
        f"Prefere contato por: {preferencia}\n"
    )
    _send_smtp_email(
        aviso,
        "Envio de e-mail indisponível. Verifique a configuração SMTP.",
        "Não foi possível enviar a mensagem. Tente novamente.",
        "Falha ao enviar aviso de solicitação de demonstração para a equipe.",
    )

    if request.preferencia != "email":
        return

    # Confirmacao para o interessado: se falhar, o pedido ja chegou na equipe (erro so vai para o log).
    confirmacao = EmailMessage()
    confirmacao["Subject"] = "DataPlate - recebemos seu pedido de demonstração"
    confirmacao["To"] = request.email
    texto_confirmacao = (
        f"Olá, {request.nome}!\n\n"
        "Primeiramente, obrigado por solicitar uma demonstração do DataPlate.\n\n"
        "É um prazer entrar em contato. Somos da equipe do DataPlate, plataforma que une cardápio digital por QR Code, pedidos em tempo real para a cozinha, controle de mesas e reservas, e um painel com indicadores para a gestão do restaurante.\n\n"
        "Gostaríamos de convidar você para uma demonstração gratuita e sem compromisso, na qual mostramos na prática como o sistema funciona no dia a dia e como ele pode se adaptar às necessidades do seu negócio.\n\n"
        "Duração: cerca de 20 minutos\n"
        "Formato: online ou presencial, como for mais conveniente para você\n"
        "Opções de horário: o que melhor se encaixar na sua agenda, é só nos informar!\n\n"
        "Agradecemos desde já a atenção e ficamos no aguardo do seu retorno.\n\n"
        "Atenciosamente,\n"
        "Equipe DataPlate\n"
        "Telefone: 99 99999-9999 / E-mail: contato@dataplate.com.br"
    )
    confirmacao.set_content(texto_confirmacao)
    confirmacao.add_alternative(
        _email_layout(
            "GESTÃO INTELIGENTE PARA SEU NEGÓCIO",
            f"""
            <div style="display:inline-block;background:#d9f3e5;color:#087443;border-radius:20px;padding:5px 10px;font-size:14px;">
              DEMONSTRAÇÃO SOLICITADA
            </div>
            <h1 style="margin:18px 0 14px;color:#193b30;font-size:25px;line-height:1.3;">Olá, {escape_html(request.nome)}!</h1>
            <p style="margin:0 0 14px;color:#394b45;font-size:16px;line-height:1.6;">Obrigado por demonstrar interesse no DataPlate!</p>
            <p style="margin:0 0 18px;color:#394b45;font-size:16px;line-height:1.6;">Queremos apresentar como nossa plataforma pode simplificar a gestão do seu estabelecimento.</p>
            <p style="margin:0 0 14px;color:#17231f;font-size:16px;line-height:1.5;"><strong>Conheça os detalhes da demonstração:</strong></p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;color:#394b45;font-size:16px;">
              <tr><td width="30" valign="top" style="padding:8px 0;color:#315d4c;font-size:19px;">&#9711;</td><td style="padding:8px 0;line-height:1.5;">Duração: aproximadamente 20 minutos</td></tr>
              <tr><td width="30" valign="top" style="padding:8px 0;color:#315d4c;font-size:18px;">&#9635;</td><td style="padding:8px 0;line-height:1.5;">Formato: online ou presencial</td></tr>
              <tr><td width="30" valign="top" style="padding:8px 0;color:#315d4c;font-size:18px;">&#9636;</td><td style="padding:8px 0;line-height:1.5;">Horário: conforme sua disponibilidade</td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:separate;">
              <tr><td align="center" bgcolor="#193b30" style="border-radius:11px;padding:17px 12px;">
                <a href="mailto:contato@dataplate.com.br" style="color:#ffffff;text-decoration:none;font-size:17px;font-weight:bold;">Entre em contato conosco</a>
              </td></tr>
            </table>
            <p style="margin:16px 0 0;text-align:center;color:#394b45;font-size:14px;">Equipe DataPlate</p>
            <p style="margin:12px 0 0;text-align:center;color:#7a8781;font-size:12px;">Gestão sem complicação.</p>
            """,
            "",
        ),
        subtype="html",
    )
    try:
        _send_smtp_email(
            confirmacao,
            "Envio de e-mail indisponível. Verifique a configuração SMTP.",
            "Não foi possível enviar a confirmação.",
            "Falha ao enviar confirmação de solicitação de demonstração.",
        )
    except HTTPException:
        pass


def _only_digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def _password_reset_code_hash(code: str) -> str:
    secret = get_settings().effective_password_reset_secret
    return sha256(f"{secret}:{code}".encode("utf-8")).hexdigest()


def _invalid_password_reset_code() -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo de recuperacao invalido ou expirado")


def _enviar_codigo_em_segundo_plano(email: str, code: str) -> None:
    try:
        _send_password_reset_email(email, code)
    except HTTPException as error:
        logger.error("Codigo de recuperacao nao enviado: %s", error.detail)


def _send_password_reset_email(email: str, code: str) -> None:
    message = EmailMessage()
    message["Subject"] = "DataPlate - código para redefinir sua senha"
    message["To"] = email
    message.set_content(
        f"Recebemos uma solicitação para redefinir sua senha.\n\n"
        f"Utilize este código para continuar: {code}\n\n"
        "Ele expira em 10 minutos. Se você não solicitou essa recuperação, ignore este e-mail. "
        "Sua conta permanece protegida."
    )
    message.add_alternative(
        _email_layout(
            "",
            f"""
            <div style="margin:0 auto 14px;width:68px;height:68px;border-radius:50%;background:#eef3ef;color:#315d4c;text-align:center;line-height:68px;font-size:32px;">&#x2713;</div>
            <h1 style="margin:0 0 12px;text-align:center;color:#193b30;font-size:24px;line-height:1.3;">Recuperação de senha</h1>
            <p style="margin:0 0 16px;text-align:center;color:#394b45;font-size:16px;line-height:1.6;">Recebemos uma solicitação para redefinir sua senha.</p>
            <p style="margin:0 0 14px;text-align:center;color:#394b45;font-size:16px;line-height:1.6;">Utilize o código abaixo para continuar:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
              <tr><td align="center" bgcolor="#f0f3ef" style="border-radius:15px;padding:17px 12px 13px;">
                <div style="color:#193b30;font-size:29px;font-weight:bold;letter-spacing:3px;line-height:1.3;">{escape_html(code)}</div>
                <div style="margin-top:5px;color:#718078;font-size:13px;letter-spacing:.5px;">SEU CÓDIGO DE RECUPERAÇÃO</div>
              </td></tr>
            </table>
            <p style="margin:18px 0;color:#a9600b;text-align:center;font-size:16px;font-weight:bold;">&#x24D8;&nbsp; Expira em 10 minutos</p>
            <p style="margin:0;color:#394b45;font-size:14px;line-height:1.6;">Se você não solicitou essa recuperação, ignore este e-mail. Sua conta permanece protegida.</p>
            """,
            "DataPlate | Segurança e privacidade para seu negócio.",
        ),
        subtype="html",
    )
    _send_smtp_email(
        message,
        "Envio de e-mail de recuperação não configurado",
        "Não foi possível enviar o e-mail de recuperação. Verifique as configurações SMTP.",
        "Falha ao enviar o e-mail de recuperação de senha.",
    )


def _email_layout(subtitle: str, content: str, footer: str) -> str:
    subtitle_html = (
        f'<div style="margin-top:6px;color:#ffffff;font-size:14px;">{subtitle}</div>'
        if subtitle
        else ""
    )
    footer_html = (
        f'<tr><td style="padding:18px 12px 0;text-align:center;color:#7a8781;font-size:12px;line-height:1.5;">{footer}</td></tr>'
        if footer
        else ""
    )
    return f"""\
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e9eee9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#e9eee9" style="border-collapse:collapse;">
    <tr><td align="center" style="padding:16px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;border-collapse:separate;">
        <tr><td align="center" bgcolor="#193b30" style="border-radius:15px;padding:18px 16px;color:#ffffff;">
          <div style="font-size:28px;font-weight:bold;line-height:1.3;">DataPlate</div>
          {subtitle_html}
        </td></tr>
        <tr><td style="padding-top:10px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:separate;border-radius:15px;">
            <tr><td style="padding:16px;color:#193b30;">{content}</td></tr>
            {footer_html}
            <tr><td style="height:16px;line-height:16px;">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_smtp_email(
    message: EmailMessage,
    configuration_error: str,
    failure_detail: str,
    failure_log: str,
) -> None:
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_password:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=configuration_error)
    message["From"] = settings.smtp_from_email or settings.smtp_user
    try:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception(failure_log)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=failure_detail,
        ) from None


def _get_user_by_cpf(db: Session, cpf: str) -> User | None:
    # O banco guarda o CPF so com digitos; aceita entrada com ou sem mascara.
    return db.scalar(select(User).where(User.cpf == _only_digits(cpf)))


def _to_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        token=create_access_token(user),
        refreshToken=create_refresh_token(user),
        id=user.id,
        nome=user.nome,
        cpf=user.cpf,
        role=user.role,
    )


def _bad_credentials(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)
