# DataPlate — Contexto

Sistema de gestão para restaurantes. Backend Spring Boot + Frontend HTML/CSS/JS vanilla.

---

## Arquitetura

```
DataPlate/
├── src/main/java/com/dataplate/
│   ├── config/          # SecurityConfig, WebSocketConfig, StaticResourceConfig
│   ├── controller/      # REST controllers (@RestController)
│   ├── service/         # Regras de negócio
│   ├── repository/      # Spring Data JPA (interfaces)
│   ├── entity/          # Entidades JPA (mapeadas no banco)
│   ├── dto/             # Records de request/response
│   ├── security/        # JWT (JwtService, JwtAuthenticationFilter)
│   └── exception/       # GlobalExceptionHandler, exceções customizadas
├── src/main/resources/
│   └── application.properties   # Config local (lê .env automaticamente)
│   └── application-prod.properties  # Config produção (Render)
├── database/
│   └── schema.sql       # DDL do banco — SEMPRE editar aqui ao criar tabelas
├── frontend/
│   ├── pages/           # adm.html, user.html, index.html
│   ├── JavaScript/      # adm.js, user.js, script.js
│   ├── Css/             # Estilos
│   └── images/          # Assets
└── dev-start.ps1        # Script de início local (Windows)
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Spring Boot 4.0.6, Java 21 |
| Banco | PostgreSQL (Supabase — mesmo banco em dev e prod) |
| ORM | Hibernate / Spring Data JPA |
| Auth | JWT (access + refresh token) |
| Frontend | HTML + CSS + JS vanilla (sem framework) |
| WebSocket | STOMP sobre WebSocket |

---

## Como criar uma nova funcionalidade (padrão do projeto)

### 1. Banco de dados — como as tabelas são criadas

**Nunca criar tabelas diretamente no painel do Supabase.**

O projeto tem dois mecanismos que funcionam juntos:

**Tabelas com `@Entity` (maioria das tabelas):**
O Hibernate cria/atualiza automaticamente via `ddl-auto=update`. Basta criar a classe `@Entity` e rodar `dev-start.ps1` — a tabela aparece no Supabase sem precisar fazer mais nada.

**Tabelas sem `@Entity` (ex: `restaurante`, `categoria`, `mesa`, `status_pedido`):**
São tabelas de configuração/lookup que não têm entidade Java. Essas ficam no `database/schema.sql` com `CREATE TABLE IF NOT EXISTS`. O Spring Boot executa o `schema.sql` automaticamente após o Hibernate, a cada inicialização.

**Dados iniciais (seed):**
Qualquer tabela que precise de registros padrão deve ter um `INSERT ... WHERE NOT EXISTS` no `schema.sql`:

```sql
INSERT INTO nome_tabela (campo)
SELECT 'valor_padrao'
WHERE NOT EXISTS (SELECT 1 FROM nome_tabela WHERE campo = 'valor_padrao');
```

**Regra prática para nova funcionalidade:** criar a `@Entity` → Hibernate resolve a tabela. Só adicionar algo no `schema.sql` se precisar de dados iniciais ou se a tabela não tiver entidade Java correspondente.

### 2. Entidade JPA — `src/main/java/com/dataplate/entity/`

```java
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
@Entity
@Table(name = "nome_tabela")
public class NomeEntidade {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String campo;

    @Builder.Default          // OBRIGATÓRIO quando tem valor padrão + @Builder
    @Column(nullable = false)
    private Boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @PrePersist
    protected void onCreate() {
        if (criadoEm == null) criadoEm = LocalDateTime.now();
        if (ativo == null) ativo = true;
    }
}
```

> **Regra importante:** Sempre usar `@Builder.Default` em campos com valor padrão (`= true`, `= false`, `= 0`). Sem isso o Lombok ignora o valor.

### 3. Repository — `src/main/java/com/dataplate/repository/`

```java
public interface NomeRepository extends JpaRepository<NomeEntidade, Long> {
    // Spring Data cria as queries automaticamente
    List<NomeEntidade> findByAtivoTrue();
    Optional<NomeEntidade> findByCampo(String campo);
}
```

### 4. DTOs — `src/main/java/com/dataplate/dto/`

Usar `record` para request e response:

```java
// Request (entrada)
public record NomeRequest(
    @NotBlank String campo,
    @NotNull Double valor
) {}

// Response (saída)
public record NomeResponse(Long id, String campo, Boolean ativo) {}
```

### 5. Service — `src/main/java/com/dataplate/service/`

```java
@Service
@RequiredArgsConstructor
public class NomeService {
    private final NomeRepository repository;

    @Transactional
    public NomeResponse criar(NomeRequest req) {
        NomeEntidade entidade = NomeEntidade.builder()
            .campo(req.campo())
            .build();
        return toResponse(repository.save(entidade));
    }

    @Transactional(readOnly = true)
    public List<NomeResponse> listar() {
        return repository.findAll().stream().map(this::toResponse).toList();
    }

    private NomeResponse toResponse(NomeEntidade e) {
        return new NomeResponse(e.getId(), e.getCampo(), e.getAtivo());
    }
}
```

### 6. Controller — `src/main/java/com/dataplate/controller/`

```java
@RestController
@RequestMapping("/api/nome")
@RequiredArgsConstructor
public class NomeController {
    private final NomeService service;

    @GetMapping
    public List<NomeResponse> listar() {
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public NomeResponse criar(@Valid @RequestBody NomeRequest request) {
        return service.criar(request);
    }
}
```

### 7. Segurança — liberar endpoint no `SecurityConfig.java`

Adicionar em `securityFilterChain`:
```java
.requestMatchers("/api/nome/**").permitAll()   // sem autenticação
// ou
.requestMatchers("/api/nome/**").authenticated() // requer login
```

---

## Regras de CORS

Origens permitidas localmente (configuradas em `application.properties`):
- `http://localhost:5500`, `http://127.0.0.1:5500` — Live Server VS Code
- `http://localhost:8080`, `http://127.0.0.1:8080` — Spring Boot direto
- `http://localhost:5173` — Vite dev server

Para adicionar nova origem: editar `dataplate.allowed-origins` em `application.properties`.

---

## Autenticação JWT

- Endpoint de login: `POST /api/auth/login` → retorna `{ accessToken, refreshToken }`
- Endpoint de registro: `POST /api/auth/register`
- Header nas requisições protegidas: `Authorization: Bearer <accessToken>`
- Roles disponíveis: `ADMIN`, `COZINHA`, `FUNCIONARIO` (enum `Role.java`)

---

## Frontend — como o JS chama a API

O `API_BASE_URL` é detectado automaticamente:
- Acessado via `localhost` ou `127.0.0.1` → usa `http://<host>:8080/api`
- Em produção → usa `https://dataplate.onrender.com/api`

Para chamar a API no frontend:
```javascript
// GET
const dados = await getJson('/nome');

// POST
const criado = await postJson('/nome', { campo: 'valor' });

// PUT
const atualizado = await putJson('/nome/1', { campo: 'novo' });
```

Essas funções estão definidas em `adm.js` e já incluem o token JWT automaticamente.

---

## Ambiente local — como rodar

```powershell
powershell -ExecutionPolicy Bypass -File .\dev-start.ps1
```

**Pré-requisitos:**
1. JDK 21 instalado (qualquer distribuição)
2. Arquivo `.env` criado a partir de `.env.example` com as credenciais do banco

O script detecta o Java automaticamente, carrega o `.env` e inicia o Spring Boot.

---

## Variáveis de ambiente (`.env`)

| Variável | Descrição |
|---|---|
| `DB_HOST` | Host do PostgreSQL |
| `DB_PORT` | Porta (padrão: 5432) |
| `DB_NAME` | Nome do banco |
| `DB_USER` | Usuário do banco |
| `DB_PASSWORD` | Senha do banco |
| `JWT_SECRET` | Chave secreta para assinar tokens JWT |

---

## O que NÃO fazer

- **Não criar tabelas diretamente no painel do Supabase** — usar `@Entity` (Hibernate cria) ou `schema.sql` (para tabelas sem entidade)
- **Não adicionar `CREATE TABLE` no `schema.sql` para tabelas que já têm `@Entity`** — o Hibernate cuida disso via `ddl-auto=update`
- **Não usar `@Builder` com campos de valor padrão sem `@Builder.Default`**
- **Não adicionar endpoints sem liberar no `SecurityConfig`**
- **Não commitar o arquivo `.env`** — ele está no `.gitignore` por segurança
- **Não duplicar registros no schema.sql** — usar sempre `IF NOT EXISTS` e `WHERE NOT EXISTS`
