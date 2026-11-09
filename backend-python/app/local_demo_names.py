"""Normaliza somente nomes da demonstracao no banco Docker local, sem criar registros."""
import re

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models import Categoria, Cliente, Fornecedor, Funcionario, Insumo, Mesa, Produto, Restaurante, User

CLIENTES = (
    "Mariana Oliveira", "Rafael Almeida", "Juliana Ferreira", "Pedro Martins", "Camila Rodrigues",
    "Felipe Costa", "Gabriela Rocha", "Henrique Melo", "Isabela Silva", "Joao Pereira",
)
INSUMOS = {"Carne bovina": "Carne bovina selecionada", "Alface": "Alface crespa fresca",
           "Massa seca": "Massa artesanal", "Laranja": "Laranja pera", "Chocolate": "Chocolate meio amargo"}


def naturalizar(nome):
    nome = re.sub(r"^Teste 2026\s*-\s*", "", nome or "", flags=re.I)
    nome = re.sub(r"\s*\((?:demo|teste)\)\s*", " ", nome, flags=re.I)
    return re.sub(r"\s+(?:teste|demo)(?:\s+\d+)?$", "", nome, flags=re.I).strip()


def atualizar_nomes(db):
    for usuario in db.scalars(select(User)):
        if usuario.nome.startswith("Demo "):
            usuario.nome = {"ADMIN": "Ricardo Almeida", "COZINHA": "Helena Costa",
                            "FUNCIONARIO": "Lucas Ribeiro"}.get(usuario.role, naturalizar(usuario.nome[5:]))
    for cliente in db.scalars(select(Cliente)):
        match = re.fullmatch(r"Cliente Teste (\d+)", cliente.nome, flags=re.I)
        if match:
            cliente.nome = CLIENTES[(int(match[1]) - 1) % len(CLIENTES)]
        else:
            cliente.nome = naturalizar(cliente.nome)
        if cliente.endereco and "Rua de Testes" in cliente.endereco:
            cliente.endereco = "Rua das Flores, 100 - Sao Paulo/SP"
        if cliente.email and "teste" in cliente.email:
            cliente.email = cliente.nome.lower().replace(" ", ".") + "@example.com"
    for model, campo in ((Funcionario, "nome"), (Produto, "nome"), (Categoria, "nome"),
                         (Insumo, "nome"), (Restaurante, "nome")):
        for registro in db.scalars(select(model)):
            anterior = getattr(registro, campo)
            novo = naturalizar(anterior)
            if model is Insumo and anterior.startswith("Teste 2026 - "):
                novo = INSUMOS.get(novo, novo)
            setattr(registro, campo, novo)
    for fornecedor in db.scalars(select(Fornecedor)):
        nomes = {"Fornecedor Teste Alimentos Ltda": "Alimentos Boa Mesa Ltda","Fornecedor Teste Hortifruti": "Hortifruti Boa Colheita",
                 "Fornecedor Teste Carnes e aves": "Distribuidora Campo Verde",
                 "Fornecedor Teste Bebidas": "Bebidas Serra Azul"}
        fornecedor.razao_social = nomes.get(fornecedor.razao_social, naturalizar(fornecedor.razao_social))
    for mesa in db.scalars(select(Mesa)):
        if mesa.localizacao == "Area de testes 2026":
            mesa.localizacao = ("Salao Principal", "Varanda", "Jardim")[(mesa.numero - 1) % 3]
        elif mesa.localizacao:
            mesa.localizacao = naturalizar(mesa.localizacao)
        if mesa.observacoes and re.fullmatch(r"TESTE-2026-MESA-\d+", mesa.observacoes):
            mesa.observacoes = "Mesa de atendimento " + mesa.observacoes.rsplit("-", 1)[1]
        if mesa.reserva_nome:
            match = re.fullmatch(r"Reserva Teste (\d+)", mesa.reserva_nome)
            mesa.reserva_nome = CLIENTES[(int(match[1]) - 1) % len(CLIENTES)] if match else naturalizar(mesa.reserva_nome)


def main():
    engine = create_engine("postgresql+psycopg://postgres:dataplate_local@db:5432/dataplate")
    with Session(engine) as db, db.begin():
        atualizar_nomes(db)
    print("Nomes locais atualizados; IDs, relacionamentos e valores preservados.")


if __name__ == "__main__":
    main()
