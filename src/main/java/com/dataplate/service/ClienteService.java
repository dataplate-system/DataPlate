package com.dataplate.service;

import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.dataplate.dto.ClienteRequest;
import com.dataplate.dto.ClienteResponse;
import com.dataplate.entity.Cliente;
import com.dataplate.repository.ClienteRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ClienteService {
    private final ClienteRepository repo;

    @Transactional(readOnly = true)
    public List<ClienteResponse> listar() {
        return repo.findByAtivoTrue(PageRequest.of(0, 500)).getContent()
                .stream().map(this::toResponse).toList();
    }
    @Transactional
    public ClienteResponse criar(ClienteRequest req) {
        Cliente c = new Cliente();
        applyRequest(c, req);
        Cliente salvo = repo.save(c);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("CLI", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
    }

    @Transactional
    public ClienteResponse atualizar(Long id, ClienteRequest req) {
        Cliente c = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente nao encontrado"));
        applyRequest(c, req);
        return toResponse(repo.save(c));
    }

    @Transactional
    public void excluir(Long id) {
        Cliente c = repo.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cliente não encontrado"));
        c.setAtivo(false); // <-- era deleteById()
        repo.save(c);
    }

    private void applyRequest(Cliente c, ClienteRequest req) {
        c.setCodigo(normalizeCodigo(req.codigo()));
        c.setNome(req.nome().trim());
        c.setCpf(req.cpf().trim());
        c.setEmail(blankToNull(req.email()));
        c.setTelefone(blankToNull(req.telefone()));
        c.setEndereco(blankToNull(req.endereco()));
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

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String codigoOrDefault(String codigo, String prefixo, Long id) {
        return codigo != null && !codigo.isBlank() ? codigo : formatCodigo(prefixo, id);
    }

    private String formatCodigo(String prefixo, Long id) {
        return prefixo + "-" + String.format("%03d", id);
    }
}
