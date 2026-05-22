package com.dataplate.service;

import com.dataplate.dto.FuncionarioRequest;
import com.dataplate.dto.FuncionarioResponse;
import com.dataplate.entity.Funcionario;
import com.dataplate.repository.FuncionarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FuncionarioService {
    private final FuncionarioRepository repo;

    @Transactional(readOnly = true)
    public List<FuncionarioResponse> listar() {
        return repo.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public FuncionarioResponse criar(FuncionarioRequest req) {
        Funcionario f = new Funcionario();
        f.setCodigo(normalizeCodigo(req.codigo()));
        f.setNome(req.nome());
        f.setCpf(req.cpf());
        f.setTelefone(req.telefone());
        f.setCargo(req.cargo());
        f.setSalario(req.salario());
        Funcionario salvo = repo.save(f);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(formatCodigo("FUN", salvo.getId()));
            salvo = repo.save(salvo);
        }
        return toResponse(salvo);
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

    private String codigoOrDefault(String codigo, String prefixo, Long id) {
        return codigo != null && !codigo.isBlank() ? codigo : formatCodigo(prefixo, id);
    }

    private String formatCodigo(String prefixo, Long id) {
        return prefixo + "-" + String.format("%03d", id);
    }
}
