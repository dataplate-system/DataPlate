package com.dataplate.controller;

import com.dataplate.dto.CategoriaRequest;
import com.dataplate.dto.CategoriaResponse;
import com.dataplate.entity.Categoria;
import com.dataplate.entity.Restaurante;
import com.dataplate.exception.ErrorResponse;
import com.dataplate.repository.CategoriaRepository;
import com.dataplate.repository.RestauranteRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/categorias")
@RequiredArgsConstructor
public class CategoriaController {

    private final CategoriaRepository repository;
    private final RestauranteRepository restauranteRepository;

    @GetMapping
    public List<CategoriaResponse> listar() {
        return repository.findByAtivoTrueOrderByOrdemAscNomeAsc().stream()
                .map(c -> new CategoriaResponse(c.getId(), c.getNome(), c.getDescricao(), c.getOrdem()))
                .toList();
    }

    @PostMapping
    public ResponseEntity<?> criar(@Valid @RequestBody CategoriaRequest request) {
        String nome = request.nome().trim();
        if (nome.isEmpty()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Nome da categoria é obrigatório."));
        }
        if (repository.findByNomeIgnoreCaseAndAtivoTrue(nome).isPresent()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Essa categoria já existe."));
        }

        Long idRestaurante = restauranteRepository.findAll(PageRequest.of(0, 1)).getContent().stream()
                .findFirst().map(Restaurante::getId).orElse(null);
        if (idRestaurante == null) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Nenhum restaurante cadastrado no banco."));
        }

        short ordem = request.ordem() != null ? request.ordem() : proximaOrdem();

        try {
            Categoria salvo = repository.save(Categoria.builder()
                    .idRestaurante(idRestaurante)
                    .nome(nome)
                    .descricao(request.descricao())
                    .ordem(ordem)
                    .ativo(true)
                    .build());
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(new CategoriaResponse(salvo.getId(), salvo.getNome(), salvo.getDescricao(), salvo.getOrdem()));
        } catch (DataIntegrityViolationException e) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Essa categoria já existe."));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> excluir(@PathVariable Long id) {
        return repository.findById(id)
                .<ResponseEntity<?>>map(categoria -> {
                    categoria.setAtivo(false);
                    repository.save(categoria);
                    return ResponseEntity.noContent().build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    private short proximaOrdem() {
        int max = repository.findByAtivoTrueOrderByOrdemAscNomeAsc().stream()
                .map(Categoria::getOrdem)
                .filter(o -> o != null)
                .mapToInt(Short::intValue)
                .max()
                .orElse(0);
        return (short) (max + 1);
    }
}
