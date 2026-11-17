// Script inicial para a HomePage DataPlate

window.addEventListener('DOMContentLoaded', function () {
  console.log('HomePage DataPlate carregada com sucesso.');

  const track = document.querySelector('.carousel-track');
  const cards = document.querySelectorAll('.depoimento-card');
  const prevButton = document.querySelector('.carousel-btn.prev');
  const nextButton = document.querySelector('.carousel-btn.next');
  const dots = document.querySelectorAll('.carousel-dots button');
  let currentIndex = 0;
  let autoplayInterval;

  if (!track || cards.length === 0) {
    return;
  }

  function showSlide(index) {
    currentIndex = (index + cards.length) % cards.length;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;

    cards.forEach(function (card, cardIndex) {
      card.classList.toggle('active', cardIndex === currentIndex);
    });

    dots.forEach(function (dot, dotIndex) {
      dot.classList.toggle('active', dotIndex === currentIndex);
    });
  }

  function startAutoplay() {
    autoplayInterval = setInterval(function () {
      showSlide(currentIndex + 1);
    }, 9000);
  }

  function resetAutoplay() {
    clearInterval(autoplayInterval);
    startAutoplay();
  }

  if (prevButton) {
    prevButton.addEventListener('click', function () {
      showSlide(currentIndex - 1);
      resetAutoplay();
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', function () {
      showSlide(currentIndex + 1);
      resetAutoplay();
    });
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener('click', function () {
      showSlide(index);
      resetAutoplay();
    });
  });

  startAutoplay();

  const agendarButton = document.querySelector('.Q-Agendar');
  const demonstracaoCard = document.querySelector('#demonstracao');

  if (agendarButton && demonstracaoCard) {
    agendarButton.addEventListener('click', function () {
      demonstracaoCard.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    });
  }
});

const questions = document.querySelectorAll(".faq-question");
questions.forEach(question => {
  question.addEventListener("click", () => {

    const item = question.parentElement;
    
    item.classList.toggle("active");
  });
});

const telefoneInput = document.getElementById('telefone');
if (telefoneInput) {
  telefoneInput.addEventListener('input', function (e) {
    let valor = e.target.value.replace(/\D/g, '');

    if (valor.length > 11) {
      valor = valor.slice(0, 11);
    }

    valor = valor.replace(/^(\d{2})(\d)/g, '($1) $2');
    valor = valor.replace(/(\d{5})(\d)/, '$1-$2');

    e.target.value = valor;
  });
}

const leadForm = document.getElementById('demonstracao');
const leadContactDialog = document.getElementById('leadContactDialog');
const leadContactEmail = document.getElementById('leadContactEmail');
const leadContactEmailValue = document.getElementById('leadContactEmailValue');
const leadContactPhone = document.getElementById('leadContactPhone');
const leadContactPhoneValue = document.getElementById('leadContactPhoneValue');
const leadContactClose = document.getElementById('leadContactClose');
const leadContactMessage = document.getElementById('leadContactMessage');
const leadApiBaseUrl =
  window.DATAPLATE_API_BASE_URL ||
  localStorage.getItem('DATAPLATE_API_BASE_URL') ||
  `http://${location.hostname || 'localhost'}:8081/api`;

if (
  leadForm &&
  leadContactDialog &&
  leadContactEmail &&
  leadContactEmailValue &&
  leadContactPhone &&
  leadContactPhoneValue &&
  leadContactClose &&
  leadContactMessage
) {
  leadForm.addEventListener('submit', function (event) {
    event.preventDefault();

    const email = document.getElementById('leadEmail').value.trim();
    const telefone = telefoneInput.value.trim();

    leadContactEmailValue.textContent = email;
    leadContactPhoneValue.textContent = telefone;
    leadContactMessage.textContent = '';
    leadContactEmail.disabled = false;
    leadContactPhone.disabled = false;
    leadContactDialog.hidden = false;
    leadContactEmail.focus();
  });

  // Envia o pedido para a equipe com o canal escolhido; por e-mail o interessado tambem recebe confirmacao.
  async function enviarPedidoDemonstracao(preferencia) {
    leadContactEmail.disabled = true;
    leadContactPhone.disabled = true;
    leadContactMessage.textContent = 'Enviando pedido...';
    let enviado = false;

    try {
      const response = await fetch(`${leadApiBaseUrl}/leads/demo-contact-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: document.getElementById('leadNome').value.trim(),
          email: document.getElementById('leadEmail').value.trim(),
          telefone: telefoneInput.value.trim(),
          preferencia
        })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        const detail = result?.detail;
        throw new Error(typeof detail === 'string' ? detail : 'Não foi possível enviar a mensagem. Tente novamente.');
      }

      enviado = true;
      leadContactMessage.textContent = preferencia === 'email'
        ? 'Pedido enviado! Confira a confirmação no seu e-mail.'
        : 'Pedido enviado! Entraremos em contato pelo seu telefone.';
    } catch (error) {
      leadContactMessage.textContent = error instanceof TypeError
        ? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
        : error.message;
    } finally {
      // Depois de enviado, mantem bloqueado para evitar pedido duplicado.
      leadContactEmail.disabled = enviado;
      leadContactPhone.disabled = enviado;
    }
  }

  leadContactEmail.addEventListener('click', () => enviarPedidoDemonstracao('email'));
  leadContactPhone.addEventListener('click', () => enviarPedidoDemonstracao('telefone'));

  leadContactClose.addEventListener('click', function () {
    leadContactDialog.hidden = true;
    document.querySelector('.cont').focus();
  });

  leadContactDialog.addEventListener('click', function (event) {
    if (event.target === leadContactDialog) {
      leadContactDialog.hidden = true;
      document.querySelector('.cont').focus();
    }
  });
}

const cnpjInput = document.getElementById('cnpj');
if (cnpjInput) {
  cnpjInput.addEventListener('input', function (e) {
    let valor = e.target.value.replace(/\D/g, '');

    if (valor.length > 14) {
      valor = valor.slice(0, 14);
    }

    valor = valor.replace(/^(\d{2})(\d)/g, '$1.$2');
    valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/g, '$1.$2.$3');
    valor = valor.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/g, '$1.$2.$3/$4');
    valor = valor.replace(/(\d{4})(\d)/, '$1-$2');

    e.target.value = valor;
  });
}