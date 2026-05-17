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
        f.setNome(req.nome());
        f.setCpf(req.cpf());
        f.setEmail(req.email());
        f.setCargo(req.cargo());
        f.setSalario(req.salario());
        return toResponse(repo.save(f));
    }

    private FuncionarioResponse toResponse(Funcionario f) {
        return new FuncionarioResponse(f.getId(), f.getNome(), f.getCpf(), f.getEmail(),
                f.getCargo(), f.getSalario(), f.getAtivo(), f.getCriadoEm());
    }
}
