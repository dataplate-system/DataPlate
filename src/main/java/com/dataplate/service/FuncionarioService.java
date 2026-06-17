package com.dataplate.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.dataplate.dto.FuncionarioRequest;
import com.dataplate.dto.FuncionarioResponse;
import com.dataplate.entity.Funcionario;
import com.dataplate.repository.FuncionarioRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class FuncionarioService {
    private final FuncionarioRepository repo;

    @Transactional(readOnly = true)
    public List<FuncionarioResponse> listar() {
        return repo.findByAtivoTrue().stream().map(this::toResponse).toList();
    }

    @Transactional
    public FuncionarioResponse criar(FuncionarioRequest req) {
        Funcionario f = new Funcionario();
        applyRequest(f, req);
        Funcionario salvo = repo.save(f);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("FUN", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
    }

    @Transactional
    public FuncionarioResponse atualizar(Long id, FuncionarioRequest req) {
        Funcionario f = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Funcionario nao encontrado"));
        applyRequest(f, req);
        return toResponse(repo.save(f));
    }

    @Transactional
    public void excluir(Long id) {
        Funcionario f = repo.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Funcionario não encontrado"));
        f.setAtivo(false);
        repo.save(f);
    }

    private void applyRequest(Funcionario f, FuncionarioRequest req) {
        f.setCodigo(normalizeCodigo(req.codigo()));
        f.setNome(req.nome().trim());
        f.setCpf(req.cpf().trim());
        f.setTelefone(blankToNull(req.telefone()));
        f.setCargo(req.cargo().trim());
        f.setSalario(req.salario());
    }

    private FuncionarioResponse toResponse(Funcionario f) {
        return new FuncionarioResponse(f.getId(), codigoOrDefault(f.getCodigo(), "FUN", f.getId()),
                f.getNome(), f.getCpf(), f.getTelefone(),
                f.getCargo(), f.getSalario(), f.getAtivo(), f.getCriadoEm());
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
