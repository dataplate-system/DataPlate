"""Atualiza apenas os cenarios identificados da demonstracao no Docker local."""
import json

from sqlalchemy import create_engine, or_, select
from sqlalchemy.orm import Session

from app.models import Pedido, PedidoStatusHistorico, Role, User

CENARIOS = (
    ("Atendente", "Cliente desistiu devido ao tempo de espera muito longo."),
    ("Cozinha", "Ingrediente principal acabou durante o preparo; cliente recusou a substituição."),
    ("Atendente", "Cliente foi embora antes de o pedido ficar pronto."),
    ("Cozinha", "Falha no equipamento impediu a conclusão do preparo no prazo."),
    ("Atendente", "Cliente passou mal e precisou deixar o restaurante."),
    ("Cozinha", "Restrição alimentar informada após o início do preparo, sem alternativa disponível."),
    ("Atendente", "Pedido lançado em duplicidade durante o atendimento."),
    ("Cozinha", "Prato não atingiu o padrão de qualidade e o cliente preferiu cancelar."),
)


def motivo_do_cenario(indice):
    setor, motivo = CENARIOS[indice % len(CENARIOS)]
    return f"[{setor}] {motivo}"


def atualizar_cancelamentos(db):
    registros = db.execute(
        select(PedidoStatusHistorico, Pedido).join(Pedido, Pedido.id == PedidoStatusHistorico.id_pedido)
        .where(PedidoStatusHistorico.status == "CANCELADO",
               or_(Pedido.numero_pedido.startswith("T26-"), Pedido.numero_pedido.startswith("LOCAL-DEMO-")))
        .order_by(PedidoStatusHistorico.id)
    ).all()
    alterados = 0
    genericos = {"", "cenario de teste local", "cenário de teste local"}
    for indice, (historico, pedido) in enumerate(registros):
        motivo = (historico.motivo or "").strip()
        # Motivos digitados pela equipe sao mantidos, inclusive nos pedidos de demonstracao.
        if historico.id_usuario is None and motivo.lower() in genericos:
            historico.motivo = motivo_do_cenario(indice)
            alterados += 1
        elif motivo and not motivo.startswith(("[Atendente] ", "[Cozinha] ", "[Gerente] ", "[Caixa] ")):
            usuario = db.get(User, historico.id_usuario) if historico.id_usuario else None
            setor = {Role.FUNCIONARIO: "Atendente", Role.COZINHA: "Cozinha"}.get(usuario.role) if usuario else None
            if setor:
                historico.motivo = f"[{setor}] {motivo}"[:255]
                alterados += 1
    return alterados


def main():
    engine = create_engine("postgresql+psycopg://postgres:dataplate_local@db:5432/dataplate")
    with Session(engine) as db, db.begin():
        alterados = atualizar_cancelamentos(db)
    print(json.dumps({"cancelamentos_atualizados": alterados, "horarios_e_motivos_manuais_preservados": True}))


if __name__ == "__main__":
    main()
