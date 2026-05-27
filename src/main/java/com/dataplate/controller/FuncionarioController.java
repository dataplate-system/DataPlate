package com.dataplate.controller;

import com.dataplate.dto.FuncionarioRequest;
import com.dataplate.dto.FuncionarioResponse;
import com.dataplate.service.FuncionarioService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/funcionarios")
@RequiredArgsConstructor
public class FuncionarioController {
    private static final Logger logger = LoggerFactory.getLogger(FuncionarioController.class);

    private final FuncionarioService service;

    @GetMapping
    public ResponseEntity<List<FuncionarioResponse>> listar() {
        try {
            return ResponseEntity.ok(service.listar());
        } catch (Exception ex) {
            logger.error("Erro ao listar funcionarios", ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erro ao carregar funcionarios", ex);
        }
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FuncionarioResponse criar(@Valid @RequestBody FuncionarioRequest request) {
        try {
            return service.criar(request);
        } catch (Exception ex) {
            logger.error("Erro ao criar funcionario", ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erro ao salvar funcionario", ex);
        }
    }

    @PutMapping("/{id}")
    public FuncionarioResponse atualizar(@PathVariable Long id, @Valid @RequestBody FuncionarioRequest request) {
        try {
            return service.atualizar(id, request);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (DataIntegrityViolationException ex) {
            logger.error("Violacao de dados ao atualizar funcionario", ex);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dados do funcionario ja cadastrados", ex);
        } catch (Exception ex) {
            logger.error("Erro ao atualizar funcionario", ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erro ao atualizar funcionario", ex);
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
