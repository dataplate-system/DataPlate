// src/components/Menu.jsx
import { useEffect, useState } from 'react';

export function Menu() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Busca produtos do backend Java
    fetch('http://localhost:8080/api/produtos')
      .then(res => res.json())
      .then(data => {
        setProdutos(data);
        setCarregando(false);
      })
      .catch(erro => {
        console.error('Erro:', erro);
        setCarregando(false);
      });
  }, []);

  if (carregando) return <p>Carregando cardápio...</p>;
  if (produtos.length === 0) return <p>Nenhum produto disponível</p>;

  return (
    <div className="menu-container">
      <h1>🍽️ Cardápio</h1>
      <div className="produtos-grid">
        {produtos.map(produto => (
          <div key={produto.id} className="produto-card">
            {produto.imagem && (
              <img src={produto.imagem} alt={produto.nome} />
            )}
            {produto.destaque && <span className="destaque">⭐ Destaque</span>}
            
            <h3>{produto.nome}</h3>
            <p className="descricao">{produto.descricao}</p>
            
            <div className="info">
              <span className="preco">R$ {produto.preco.toFixed(2)}</span>
              {produto.tempoPreparo && (
                <span className="tempo">⏱️ {produto.tempoPreparo}min</span>
              )}
            </div>
            
            <button onClick={() => adicionarAoCarrinho(produto.id)}>
              ➕ Adicionar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function adicionarAoCarrinho(produtoId) {
  console.log('Produto adicionado ao carrinho:', produtoId);
}