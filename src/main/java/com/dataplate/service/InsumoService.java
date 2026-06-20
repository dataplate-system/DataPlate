package com.dataplate.service;

import com.dataplate.dto.InsumoRequest;
import com.dataplate.dto.InsumoResponse;
import com.dataplate.entity.Insumo;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.InsumoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class InsumoService {
    private final InsumoRepository repo;

    @Transactional(readOnly = true)
    public List<InsumoResponse> listar() {
        return repo.findByAtivoTrue(PageRequest.of(0, 500)).getContent()
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public InsumoResponse criar(InsumoRequest req) {
        Insumo i = Insumo.builder()
                .nome(req.nome())
                .unidade(req.unidade())
                .quantidadeAtual(req.quantidadeAtual())
                .quantidadeMinima(req.quantidadeMinima())
                .custoUnitario(req.custoUnitario())
                .build();
        return toResponse(repo.save(i));
    }

    @Transactional
    public InsumoResponse atualizar(Long id, InsumoRequest req) {
        Insumo i = repo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Insumo nao encontrado: " + id));
        i.setNome(req.nome());
        i.setUnidade(req.unidade());
        i.setQuantidadeAtual(req.quantidadeAtual());
        i.setQuantidadeMinima(req.quantidadeMinima());
        i.setCustoUnitario(req.custoUnitario());
        return toResponse(repo.save(i));
    }

    @Transactional
    public void excluir(Long id) {
        Insumo i = repo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Insumo nao encontrado: " + id));
        i.setAtivo(false);
        repo.save(i);
    }

    private InsumoResponse toResponse(Insumo i) {
        return new InsumoResponse(i.getId(), i.getNome(), i.getUnidade(),
                i.getQuantidadeAtual(), i.getQuantidadeMinima(), i.getCustoUnitario(), i.getAtivo());
    }
}