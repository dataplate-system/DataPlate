import re

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas import CepResponse


router = APIRouter(prefix="/api/cep", tags=["cep"])


@router.get("/buscar/{cep}", response_model=CepResponse)
@router.get("/{cep}", response_model=CepResponse)
def buscar_cep(cep: str) -> CepResponse | JSONResponse:
    if not _cep_valido(cep):
        return _erro(f"CEP invalido: {cep}. Deve conter 8 digitos.")

    cep_limpo = _limpar_cep(cep)
    try:
        response = httpx.get(f"https://viacep.com.br/ws/{cep_limpo}/json/", timeout=10.0)
    except httpx.TimeoutException:
        return _erro("Tempo esgotado ao buscar CEP. Tente novamente.")
    except httpx.HTTPError:
        return _erro("Falha de comunicacao com ViaCEP. Tente novamente.")

    if response.status_code != 200:
        return _erro(f"Erro na API ViaCEP. Status: {response.status_code}")

    try:
        data = response.json()
    except ValueError:
        return _erro("CEP nao encontrado ou servico indisponivel. Tente novamente.")

    if data.get("erro") is True:
        return _erro(f"CEP nao encontrado: {cep_limpo}")

    return CepResponse(
        sucesso=True,
        cep=data.get("cep"),
        logradouro=data.get("logradouro"),
        complemento=data.get("complemento"),
        bairro=data.get("bairro"),
        localidade=data.get("localidade"),
        uf=data.get("uf"),
        ibge=data.get("ibge"),
        gia=data.get("gia"),
        ddd=data.get("ddd"),
        siafi=data.get("siafi"),
    )


def _cep_valido(cep: str) -> bool:
    return len(_limpar_cep(cep)) == 8


def _limpar_cep(cep: str) -> str:
    return re.sub(r"\D", "", cep or "")


def _erro(mensagem: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"sucesso": False, "mensagem": mensagem})
