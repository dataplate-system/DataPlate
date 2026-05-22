package com.dataplate.service;

import com.dataplate.dto.FornecedorRequest;
import com.dataplate.dto.FornecedorResponse;
import com.dataplate.entity.Fornecedor;
import com.dataplate.repository.FornecedorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        f.setCodigo(normalizeCodigo(req.codigo()));
        f.setRazaoSocial(req.razaoSocial());
        f.setCnpj(req.cnpj());
        f.setEspecialidade(req.especialidade());
        f.setTelefone(req.telefone());
        f.setEmail(req.email());
        Fornecedor salvo = repo.save(f);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("FOR", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
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

    private String codigoOrDefault(String codigo, String prefixo, Long id) {
        return codigo != null && !codigo.isBlank() ? codigo : formatCodigo(prefixo, id);
    }

    private String formatCodigo(String prefixo, Long id) {
        return prefixo + "-" + String.format("%03d", id);
    }
}
