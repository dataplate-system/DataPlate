from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Funcionario, PedidoStatusHistorico, Role, User
from app.schemas import UserCreateRequest, UserResponse, UserUpdateRequest
from app.security import exigir_perfis, get_usuario_atual, hash_password


PERFIS_OPERACIONAIS = {Role.FUNCIONARIO.value, Role.CAIXA.value, Role.COZINHA.value}
PERFIS_ESSENCIAIS = {
    Role.ADMIN.value: "E necessario manter ao menos um Administrador ativo",
    Role.GERENTE.value: "E necessario manter ao menos um Gerente ativo",
}

router = APIRouter(
    prefix="/api/usuarios",
    tags=["usuarios"],
    dependencies=[Depends(exigir_perfis(Role.ADMIN, Role.GERENTE))],
)


@router.get("", response_model=list[UserResponse])
def listar_usuarios(
    db: Session = Depends(get_db),
    atual: User = Depends(get_usuario_atual),
) -> list[UserResponse]:
    query = select(User).options(joinedload(User.funcionario))
    if _is_gerente(atual):
        query = query.where(User.role.in_(PERFIS_OPERACIONAIS))
    usuarios = db.scalars(query.order_by(User.id).limit(500)).all()
    return [_to_response(usuario) for usuario in usuarios]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def criar_usuario(
    request: UserCreateRequest,
    db: Session = Depends(get_db),
    atual: User = Depends(get_usuario_atual),
) -> UserResponse:
    role = _role_value(request.role)
    if _is_gerente(atual) and role not in PERFIS_OPERACIONAIS:
        raise _gerente_fora_do_escopo()

    cpf = _only_digits(request.cpf)
    if db.scalar(select(User).where(User.cpf == cpf)) is not None:
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")

    funcionario = _obter_funcionario(db, request.funcionarioId)
    _validar_vinculo_funcionario(db, funcionario, None)
    usuario = User(
        nome=request.nome,
        cpf=cpf,
        senha_hash=hash_password(request.senha),
        role=role,
        email=request.email.strip().lower(),
        ativo=True,
        funcionario=funcionario,
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")
    db.refresh(usuario)
    return _to_response(usuario)


@router.put("/{usuario_id}", response_model=UserResponse)
def atualizar_usuario(
    usuario_id: int,
    request: UserUpdateRequest,
    db: Session = Depends(get_db),
    atual: User = Depends(get_usuario_atual),
) -> UserResponse:
    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    novo_role = _role_value(request.role)
    novo_ativo = usuario.ativo if request.ativo is None else request.ativo

    if _is_gerente(atual) and (usuario.role not in PERFIS_OPERACIONAIS or novo_role not in PERFIS_OPERACIONAIS):
        raise _gerente_fora_do_escopo()
    if usuario.id == atual.id and (novo_role != usuario.role or novo_ativo != usuario.ativo):
        raise HTTPException(status_code=400, detail="Voce nao pode alterar o proprio perfil ou situacao")
    _garantir_perfil_essencial(db, usuario, novo_role, novo_ativo)

    cpf = _only_digits(request.cpf)
    outro = db.scalar(select(User).where(User.cpf == cpf, User.id != usuario_id))
    if outro is not None:
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")

    usuario.nome = request.nome
    usuario.cpf = cpf
    usuario.role = novo_role
    usuario.ativo = novo_ativo
    usuario.email = request.email.strip().lower() if request.email else usuario.email
    if "funcionarioId" in request.model_fields_set:
        funcionario = _obter_funcionario(db, request.funcionarioId)
        _validar_vinculo_funcionario(db, funcionario, usuario_id)
        usuario.funcionario = funcionario
    if request.senha is not None:
        usuario.senha_hash = hash_password(request.senha)
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")
    db.refresh(usuario)
    return _to_response(usuario)


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    atual: User = Depends(get_usuario_atual),
) -> Response:
    if _is_gerente(atual):
        raise HTTPException(status_code=403, detail="Gerente nao exclui usuarios; use a inativacao")
    if usuario_id == atual.id:
        raise HTTPException(status_code=400, detail="Voce nao pode excluir a si mesmo")

    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    _garantir_perfil_essencial(db, usuario, None, False)
    possui_registros = db.scalar(
        select(PedidoStatusHistorico.id).where(PedidoStatusHistorico.id_usuario == usuario.id).limit(1)
    )
    if possui_registros is not None:
        raise HTTPException(
            status_code=409,
            detail="Usuario possui registros vinculados; inative-o em vez de excluir",
        )

    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(usuario: User) -> UserResponse:
    return UserResponse(
        id=usuario.id,
        nome=usuario.nome,
        cpf=usuario.cpf,
        role=usuario.role,
        email=usuario.email,
        ativo=bool(usuario.ativo),
        funcionarioId=usuario.funcionario_id,
        funcionarioNome=usuario.funcionario.nome if usuario.funcionario else None,
    )


def _role_value(role: Role | str) -> str:
    return role.value if hasattr(role, "value") else role


def _is_gerente(usuario: User) -> bool:
    return usuario.role == Role.GERENTE.value


def _gerente_fora_do_escopo() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail="Gerente gerencia apenas usuarios dos perfis Atendente, Caixa e Cozinha",
    )


def _garantir_perfil_essencial(db: Session, usuario: User, novo_role: str | None, novo_ativo: bool) -> None:
    mensagem = PERFIS_ESSENCIAIS.get(usuario.role)
    if mensagem is None or not usuario.ativo:
        return
    if novo_role == usuario.role and novo_ativo:
        return
    # Trava os ativos do perfil: operacoes concorrentes nao podem remover os dois ultimos.
    ativos = db.scalars(
        select(User.id)
        .where(User.role == usuario.role, User.ativo.is_(True))
        .with_for_update()
    ).all()
    if not any(usuario_id != usuario.id for usuario_id in ativos):
        raise HTTPException(status_code=409, detail=mensagem)


def _only_digits(value: str) -> str:
    return "".join(char for char in (value or "") if char.isdigit())


def _obter_funcionario(db: Session, funcionario_id: int | None) -> Funcionario | None:
    if funcionario_id is None:
        return None
    funcionario = db.get(Funcionario, funcionario_id)
    if funcionario is None or not funcionario.ativo:
        raise HTTPException(status_code=400, detail="Funcionario nao encontrado ou inativo")
    return funcionario


def _validar_vinculo_funcionario(
    db: Session,
    funcionario: Funcionario | None,
    usuario_id: int | None,
) -> None:
    if funcionario is None:
        return
    query = select(User).where(User.funcionario_id == funcionario.id)
    if usuario_id is not None:
        query = query.where(User.id != usuario_id)
    if db.scalar(query) is not None:
        raise HTTPException(status_code=409, detail="Este funcionario ja esta associado a outro usuario")
