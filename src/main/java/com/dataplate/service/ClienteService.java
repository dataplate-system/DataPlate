package com.dataplate.service;

import com.dataplate.dto.ClienteRequest;
import com.dataplate.dto.ClienteResponse;
import com.dataplate.entity.Cliente;
import com.dataplate.repository.ClienteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ClienteService {
    private final ClienteRepository repo;

    @Transactional(readOnly = true)
    public List<ClienteResponse> listar() {
        return repo.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public ClienteResponse criar(ClienteRequest req) {
        Cliente c = new Cliente();
        c.setCodigo(normalizeCodigo(req.codigo()));
        c.setNome(req.nome());
        c.setCpf(req.cpf());
        c.setEmail(req.email());
        c.setTelefone(req.telefone());
        c.setEndereco(req.endereco());
        Cliente salvo = repo.save(c);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("CLI", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
    }

    private ClienteResponse toResponse(Cliente c) {
        return new ClienteResponse(c.getId(), codigoOrDefault(c.getCodigo(), "CLI", c.getId()),
                c.getNome(), c.getCpf(), c.getEmail(),
                c.getTelefone(), c.getEndereco(), c.getAtivo(), c.getCriadoEm());
    }

    private String normalizeCodigo(String codigo) {
        if (codigo == null || codigo.isBlank()) return null;
        return codigo.trim().toUpperCase();
    }

    private String codigoOrDefault(String codigo, String prefixo, Long id) {
        return codigo != null && !codigo.isBlank() ? codigo : formatCodigo(prefixo, id);
    }

    private String formatCodigo(String prefixo, Long id) {
        return prefixo + "-" + String.format("%03d", id);
    }
}
