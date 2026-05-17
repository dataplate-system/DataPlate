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
        f.setRazaoSocial(req.razaoSocial());
        f.setCnpj(req.cnpj());
        f.setEspecialidade(req.especialidade());
        f.setTelefone(req.telefone());
        f.setEmail(req.email());
        return toResponse(repo.save(f));
    }

    private FornecedorResponse toResponse(Fornecedor f) {
        return new FornecedorResponse(f.getId(), f.getRazaoSocial(), f.getCnpj(), f.getEspecialidade(),
                f.getTelefone(), f.getEmail(), f.getAtivo(), f.getCriadoEm());
    }
}
