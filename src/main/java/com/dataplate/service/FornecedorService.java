package com.dataplate.service;

import com.dataplate.dto.FornecedorRequest;
import com.dataplate.dto.FornecedorResponse;
import com.dataplate.entity.Fornecedor;
import com.dataplate.repository.FornecedorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FornecedorService {
    private final FornecedorRepository repo;

    @Transactional(readOnly = true)
    public List<FornecedorResponse> listar() {
        return repo.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public FornecedorResponse criar(FornecedorRequest req) {
        Fornecedor f = new Fornecedor();
        applyRequest(f, req);
        Fornecedor salvo = repo.save(f);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("FOR", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
    }

    @Transactional
    public FornecedorResponse atualizar(Long id, FornecedorRequest req) {
        Fornecedor f = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fornecedor nao encontrado"));
        applyRequest(f, req);
        return toResponse(repo.save(f));
    }

    @Transactional
    public void excluir(Long id) {
        if (!repo.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fornecedor nao encontrado");
        }
        repo.deleteById(id);
    }

    private void applyRequest(Fornecedor f, FornecedorRequest req) {
        f.setCodigo(normalizeCodigo(req.codigo()));
        f.setRazaoSocial(req.razaoSocial().trim());
        f.setCnpj(req.cnpj().trim());
        f.setEspecialidade(blankToNull(req.especialidade()));
        f.setTelefone(blankToNull(req.telefone()));
        f.setEmail(blankToNull(req.email()));
    }

    private FornecedorResponse toResponse(Fornecedor f) {
        return new FornecedorResponse(f.getId(), codigoOrDefault(f.getCodigo(), "FOR", f.getId()),
                f.getRazaoSocial(), f.getCnpj(), f.getEspecialidade(),
                f.getTelefone(), f.getEmail(), f.getAtivo(), f.getCriadoEm());
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
