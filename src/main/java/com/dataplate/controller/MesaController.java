package com.dataplate.controller;

import com.dataplate.dto.MesaRequest;
import com.dataplate.dto.MesaResponse;
import com.dataplate.service.MesaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/mesas")
@RequiredArgsConstructor
public class MesaController {
    private final MesaService service;

    @GetMapping
    public List<MesaResponse> listar() {
        return service.listar();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MesaResponse criar(@Valid @RequestBody MesaRequest request) {
        return service.criar(request);
    }

    @PutMapping("/{id}")
    public MesaResponse atualizar(@PathVariable Long id, @Valid @RequestBody MesaRequest request) {
        return service.atualizar(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
