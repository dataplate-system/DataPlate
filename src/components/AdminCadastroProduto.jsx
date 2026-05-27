// src/components/AdminCadastroProduto.jsx
import { useState } from 'react';

export function AdminCadastroProduto() {
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    preco: '',
    idCategoria: '',
    tempoPreparo: '',
    destaque: false,
    ativo: true,
    imagem: ''
  });
  const [mensagem, setMensagem] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSalvar = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          preco: parseFloat(formData.preco),
          idCategoria: parseInt(formData.idCategoria),
          tempoPreparo: formData.tempoPreparo ? parseInt(formData.tempoPreparo) : null
        })
      });

      if (response.ok) {
        setMensagem('✅ Produto cadastrado com sucesso!');
        setFormData({
          nome: '', descricao: '', preco: '', idCategoria: '',
          tempoPreparo: '', destaque: false, ativo: true, imagem: ''
        });
        setTimeout(() => setMensagem(''), 3000);
      } else {
        setMensagem('❌ Erro ao cadastrar');
      }
    } catch (erro) {
      setMensagem(`❌ Erro: ${erro}`);
    }
  };

  return (
    <div className="admin-form">
      <h2>📦 Cadastrar Novo Produto</h2>
      
      <input 
        type="text" 
        name="nome" 
        placeholder="Nome do produto"
        value={formData.nome}
        onChange={handleChange}
      />
      
      <textarea 
        name="descricao" 
        placeholder="Descrição"
        value={formData.descricao}
        onChange={handleChange}
      />
      
      <input 
        type="number" 
        name="preco" 
        placeholder="Preço (R$)"
        step="0.01"
        value={formData.preco}
        onChange={handleChange}
      />
      
      <input 
        type="number" 
        name="idCategoria" 
        placeholder="ID da Categoria"
        value={formData.idCategoria}
        onChange={handleChange}
      />
      
      <input 
        type="number" 
        name="tempoPreparo" 
        placeholder="Tempo de preparo (minutos)"
        value={formData.tempoPreparo}
        onChange={handleChange}
      />
      
      <input 
        type="text" 
        name="imagem" 
        placeholder="URL da imagem"
        value={formData.imagem}
        onChange={handleChange}
      />
      
      <label className="checkbox">
        <input 
          type="checkbox" 
          name="destaque"
          checked={formData.destaque}
          onChange={handleChange}
        />
        Marcar como destaque
      </label>
      
      <button onClick={handleSalvar} className="btn-salvar">
        💾 Salvar Produto
      </button>
      
      {mensagem && <p className="mensagem">{mensagem}</p>}
    </div>
  );
}