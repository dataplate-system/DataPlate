package com.dataplate.controller;

import com.dataplate.dto.RestauranteRequest;
import com.dataplate.dto.RestauranteResponse;
import com.dataplate.entity.Restaurante;
import com.dataplate.repository.RestauranteRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/restaurante")
@RequiredArgsConstructor
public class RestauranteController {
    private final RestauranteRepository repository;

    @GetMapping
    public RestauranteResponse obter() {
        return repository.findFirstByAtivoTrue()
                .map(this::toResponse)
                .orElse(new RestauranteResponse(null, "DataPlate Restaurante", "", "", "", ""));
    }

    @PutMapping
    public RestauranteResponse atualizar(@Valid @RequestBody RestauranteRequest request) {
        Restaurante restaurante = repository.findFirstByAtivoTrue()
                .orElseGet(() -> {
                    Restaurante novo = new Restaurante();
                    novo.setAtivo(true);
                    return novo;
                });

        restaurante.setNome(request.nome());
        if (request.cnpj() != null) restaurante.setCnpj(request.cnpj());
        if (request.telefone() != null) restaurante.setTelefone(request.telefone());
        if (request.endereco() != null) restaurante.setEndereco(request.endereco());
        if (request.email() != null) restaurante.setEmail(request.email());

        return toResponse(repository.save(restaurante));
    }

    private RestauranteResponse toResponse(Restaurante r) {
        return new RestauranteResponse(r.getId(), r.getNome(), r.getCnpj(), r.getTelefone(), r.getEndereco(), r.getEmail());
    }
}
