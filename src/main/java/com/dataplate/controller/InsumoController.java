package com.dataplate.controller;

import com.dataplate.dto.InsumoRequest;
import com.dataplate.dto.InsumoResponse;
import com.dataplate.service.InsumoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
}
