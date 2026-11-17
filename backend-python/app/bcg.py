"""Matriz BCG adaptada ao cardapio.

Sem dados de mercado, a participacao de mercado vira participacao no faturamento
do restaurante e o crescimento do mercado vira a variacao do proprio produto em
relacao ao periodo anterior de mesma duracao.
"""
from decimal import Decimal


ESTRELA = "ESTRELA"
VACA_LEITEIRA = "VACA_LEITEIRA"
INTERROGACAO = "INTERROGACAO"
ABACAXI = "ABACAXI"

ACOES = {
    ESTRELA: "Manter em destaque e garantir estoque.",
    VACA_LEITEIRA: "Preservar preço e margem; usar em combos.",
    INTERROGACAO: "Testar promoção e dar mais visibilidade.",
    ABACAXI: "Reformular, reposicionar ou retirar do cardápio.",
}

# Cresceu ou caiu em relacao ao periodo anterior.
LIMITE_CRESCIMENTO = 0.0


def limite_participacao(quantidade_produtos: int) -> float:
    """Participacao que cada produto teria se o faturamento fosse dividido igualmente."""
    return 100 / quantidade_produtos if quantidade_produtos else 0.0


def crescimento_percentual(atual: Decimal, anterior: Decimal) -> float | None:
    """None indica que nao ha base de comparacao no periodo anterior."""
    if anterior <= 0:
        return None
    return float((atual - anterior) * 100 / anterior)


def classificar(participacao: float, crescimento: float | None, limite: float, vendeu: bool) -> str:
    alta_participacao = vendeu and participacao >= limite
    # Produto novo, sem base de comparacao, conta como crescimento se ja vendeu.
    alto_crescimento = vendeu if crescimento is None else crescimento > LIMITE_CRESCIMENTO
    if alta_participacao:
        return ESTRELA if alto_crescimento else VACA_LEITEIRA
    return INTERROGACAO if alto_crescimento else ABACAXI
