"""Limite de tentativas em memoria.

Sem dependencia externa e valido para um unico processo da API, como no Docker
local. Com varios processos, os contadores precisariam ir para um servico comum.
"""
import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status


class LimitadorTentativas:
    def __init__(self, maximo: int, janela_segundos: int) -> None:
        self.maximo = maximo
        self.janela_segundos = janela_segundos
        self._eventos: dict[str, deque[float]] = {}
        self._trava = threading.Lock()

    def _podar(self, chave: str, agora: float) -> deque[float]:
        eventos = self._eventos.get(chave, deque())
        while eventos and eventos[0] <= agora - self.janela_segundos:
            eventos.popleft()
        if eventos:
            self._eventos[chave] = eventos
        else:
            self._eventos.pop(chave, None)
        return eventos

    def segundos_restantes(self, chave: str) -> int:
        agora = time.monotonic()
        with self._trava:
            eventos = self._podar(chave, agora)
            if len(eventos) < self.maximo:
                return 0
            return max(1, math.ceil(eventos[0] + self.janela_segundos - agora))

    def registrar(self, chave: str) -> None:
        agora = time.monotonic()
        with self._trava:
            eventos = self._podar(chave, agora)
            eventos.append(agora)
            self._eventos[chave] = eventos

    def limpar(self, chave: str | None = None) -> None:
        with self._trava:
            if chave is None:
                self._eventos.clear()
            else:
                self._eventos.pop(chave, None)


# Falhas de login no mesmo CPF e origem, e falhas de qualquer CPF na mesma origem.
login_por_cpf = LimitadorTentativas(maximo=5, janela_segundos=300)
login_por_origem = LimitadorTentativas(maximo=30, janela_segundos=300)
# Cada pedido de codigo envia um e-mail, entao toda solicitacao conta.
recuperacao_por_cpf = LimitadorTentativas(maximo=3, janela_segundos=900)
recuperacao_por_origem = LimitadorTentativas(maximo=20, janela_segundos=900)
pedidos_qr_por_mesa = LimitadorTentativas(maximo=20, janela_segundos=600)


def origem_da_requisicao(request: Request) -> str:
    return request.client.host if request.client else "desconhecida"


def exigir_disponivel(limitador: LimitadorTentativas, chave: str, mensagem: str) -> None:
    restante = limitador.segundos_restantes(chave)
    if restante:
        minutos = max(1, math.ceil(restante / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"{mensagem} Tente novamente em {minutos} min.",
            headers={"Retry-After": str(restante)},
        )
