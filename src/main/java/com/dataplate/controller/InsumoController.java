package com.dataplate.controller;

import com.dataplate.dto.InsumoRequest;
import com.dataplate.dto.InsumoResponse;
import com.dataplate.service.InsumoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/insumos")
@RequiredArgsConstructor
public class InsumoController {
    private final InsumoService service;

    @GetMapping
    public List<InsumoResponse> listar() {
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InsumoResponse criar(@Valid @RequestBody InsumoRequest request) {
        return service.criar(request);
    }

    @PutMapping("/{id}")
    public InsumoResponse atualizar(@PathVariable Long id, @Valid @RequestBody InsumoRequest request) {
        return service.atualizar(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
