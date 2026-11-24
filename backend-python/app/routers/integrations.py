from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt, encrypt, mask
from app.db import get_db
from app.models import IntegrationAudit, IntegrationConfig, User
from app.schemas import IntegrationConfigUpdate
from app.security import exigir_admin


router = APIRouter(prefix="/api/integrations", tags=["integrations"])

_CAMPOS = {
    "ifood_token": ("ifood_token", "ifood"),
    "ifood_restaurant_id": ("ifood_restaurant_id", "ifood"),
    "pix_key": ("pix_key", "pagamentos"),
    "pagseguro_token": ("pagseguro_token", "pagamentos"),
    "google_maps_api_key": ("google_maps_api_key", "google-maps"),
    "marketing_email": ("marketing_email", "marketing"),
}
_SEGREDOS = {"ifood_token", "pix_key", "pagseguro_token", "google_maps_api_key"}
_CAMPOS_POR_PROVEDOR = {
    "ifood": {"ifood_token", "ifood_restaurant_id"},
    "pagamentos": {"pix_key", "pagseguro_token"},
    "google-maps": {"google_maps_api_key"},
    "marketing": {"marketing_email"},
}
_ALIAS = {
    "ifood_token": "ifoodToken",
    "ifood_restaurant_id": "ifoodRestauranteId",
    "pix_key": "chavePix",
    "pagseguro_token": "pagseguroToken",
    "google_maps_api_key": "googleMapsKey",
    "marketing_email": "emailMarketing",
}


def _configuracao(db: Session) -> IntegrationConfig | None:
    return db.get(IntegrationConfig, 1)


def _resposta(config: IntegrationConfig | None) -> dict:
    dados = {}
    for campo, (atributo, _) in _CAMPOS.items():
        valor = getattr(config, atributo, None) if config else None
        if campo in _SEGREDOS and valor is not None:
            valor = mask(decrypt(valor))
        dados[_ALIAS[campo]] = valor
    dados["updatedAt"] = config.updated_at.isoformat() if config and config.updated_at else None
    dados["status"] = {}
    for provedor, campos in {
        "ifood": ("ifood_token", "ifood_restaurant_id"),
        "pagamentos": ("pix_key", "pagseguro_token"),
        "google-maps": ("google_maps_api_key",),
        "marketing": ("marketing_email",),
    }.items():
        configurado = config is not None and (
            all(getattr(config, campo) for campo in campos) if provedor == "ifood"
            else any(getattr(config, campo) for campo in campos)
        )
        dados["status"][provedor] = "Conectado" if configurado else "Não configurado"
    return dados


@router.get("", dependencies=[Depends(exigir_admin)])
def listar_integracoes(db: Session = Depends(get_db)) -> dict:
    return _resposta(_configuracao(db))


@router.put("/{provider}", dependencies=[Depends(exigir_admin)])
def atualizar_integracoes(
    provider: str,
    request: IntegrationConfigUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_admin),
) -> dict:
    campos_permitidos = _CAMPOS_POR_PROVEDOR.get(provider)
    if campos_permitidos is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provedor de integração não encontrado")

    enviados = request.model_dump(exclude_unset=True, by_alias=False)
    campos_invalidos = set(enviados) - campos_permitidos
    if campos_invalidos:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O provedor não aceita esses campos")

    config = _configuracao(db)
    if not any(valor is not None for valor in enviados.values()):
        return _resposta(config)
    if config is None:
        config = IntegrationConfig(id=1, updated_by=usuario.id)
        db.add(config)
        db.flush()

    alterados = []
    for campo, valor in enviados.items():
        if valor is None:
            continue
        atributo, dono = _CAMPOS[campo]
        anterior = getattr(config, atributo)
        valor_texto = str(valor)
        anterior_claro = decrypt(anterior) if campo in _SEGREDOS and anterior is not None else anterior
        if anterior_claro == valor_texto:
            continue
        setattr(config, atributo, encrypt(valor_texto) if campo in _SEGREDOS else valor_texto)
        alterados.append(IntegrationAudit(user_id=usuario.id, provider=dono, field=atributo))

    if alterados:
        config.updated_at = datetime.now(timezone.utc)
        config.updated_by = usuario.id
        db.add_all(alterados)
        db.commit()
        db.refresh(config)
    return _resposta(config)


@router.post("/{provider}/test", dependencies=[Depends(exigir_admin)])
def testar_integracao(
    provider: str,
    db: Session = Depends(get_db),
) -> dict[str, bool | str]:
    config = _configuracao(db)
    if provider == "ifood":
        if not config or not config.ifood_token or not config.ifood_restaurant_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Configure o token e o ID do restaurante iFood antes do teste")
        url = f"https://merchant-api.ifood.com.br/merchant/v1.0/merchants/{quote(config.ifood_restaurant_id, safe='')}"
        headers = {"Authorization": f"Bearer {decrypt(config.ifood_token)}"}
        params = None
        mensagem_ok = "Conexão com o iFood estabelecida."
    elif provider == "google-maps":
        if not config or not config.google_maps_api_key:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Configure a chave do Google Maps antes do teste")
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        headers = {}
        params = {"address": "São Paulo, Brasil", "key": decrypt(config.google_maps_api_key)}
        mensagem_ok = "Conexão com o Google Maps estabelecida."
    elif provider in _CAMPOS_POR_PROVEDOR:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail=f"O teste de conexão para {provider} ainda não está disponível")
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provedor de integração não encontrado")

    try:
        resposta = httpx.get(url, headers=headers, params=params, timeout=5.0)
    except httpx.HTTPError:
        return {"sucesso": False, "mensagem": "Não foi possível alcançar a API do provedor."}
    if not resposta.is_success:
        return {"sucesso": False, "mensagem": f"O provedor respondeu com HTTP {resposta.status_code}."}
    if provider == "google-maps":
        try:
            estado_google = resposta.json().get("status")
        except ValueError:
            estado_google = None
        if estado_google != "OK":
            return {"sucesso": False, "mensagem": "O Google Maps rejeitou a chave ou a solicitação de teste."}
    return {"sucesso": True, "mensagem": mensagem_ok}
