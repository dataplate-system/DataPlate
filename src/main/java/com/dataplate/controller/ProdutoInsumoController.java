package com.dataplate.controller;

import com.dataplate.dto.ProdutoInsumoRequest;
import com.dataplate.dto.ProdutoInsumoResponse;
import com.dataplate.service.ProdutoInsumoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/produtos/{produtoId}/insumos")
@RequiredArgsConstructor
public class ProdutoInsumoController {

    private final ProdutoInsumoService service;

    @GetMapping
    public List<ProdutoInsumoResponse> listar(@PathVariable Long produtoId) {
        return service.listar(produtoId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProdutoInsumoResponse adicionar(
            @PathVariable Long produtoId,
            @Valid @RequestBody ProdutoInsumoRequest request) {
        return service.adicionar(produtoId, request);
    }

    @DeleteMapping("/{insumoId}")
    public ResponseEntity<Void> remover(
            @PathVariable Long produtoId,
            @PathVariable Long insumoId) {
        service.remover(produtoId, insumoId);
        return ResponseEntity.noContent().build();
    }
}
