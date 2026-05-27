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
