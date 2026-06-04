package com.dataplate.service;

import com.dataplate.dto.MesaRequest;
import com.dataplate.dto.MesaResponse;
import com.dataplate.entity.Mesa;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.MesaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class MesaService {
    private static final long DEFAULT_RESTAURANTE_ID = 1L;

    private final MesaRepository repository;

    @Transactional(readOnly = true)
    public List<MesaResponse> listar() {
        return repository.findByAtivoTrueOrderByNumeroAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public MesaResponse criar(MesaRequest request) {
        Mesa mesa = new Mesa();
        mesa.setIdRestaurante(DEFAULT_RESTAURANTE_ID);
        applyRequest(mesa, request);
        return toResponse(repository.save(mesa));
    }

    @Transactional
    public MesaResponse atualizar(Long id, MesaRequest request) {
        Mesa mesa = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + id));
        applyRequest(mesa, request);
        return toResponse(repository.save(mesa));
    }

    @Transactional
    public void excluir(Long id) {
        Mesa mesa = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + id));
        mesa.setAtivo(false);
        repository.save(mesa);
    }

    private void applyRequest(Mesa mesa, MesaRequest request) {
        mesa.setNumero(request.numero());
        mesa.setCapacidade(request.capacidade());
        mesa.setStatus(normalizeStatus(request.status()));
        mesa.setLocalizacao(blankToNull(request.localizacao()));
        if (mesa.getAtivo() == null) mesa.setAtivo(true);
    }

    private String normalizeStatus(String status) {
        String value = status == null ? "livre" : status.trim().toLowerCase();
        return switch (value) {
            case "disponivel", "disponível", "livre" -> "livre";
            case "reservada", "reservado" -> "reservada";
            case "ocupada", "ocupado" -> "ocupada";
            case "manutencao", "manutenção" -> "manutencao";
            default -> value;
        };
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private MesaResponse toResponse(Mesa mesa) {
        return new MesaResponse(
                mesa.getId(),
                mesa.getNumero(),
                mesa.getCapacidade(),
                mesa.getStatus(),
                mesa.getLocalizacao(),
                mesa.getAtivo()
        );
    }
}
