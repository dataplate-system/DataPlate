// Script inicial para a HomePage DataPlate

window.addEventListener('DOMContentLoaded', function () {
  console.log('HomePage DataPlate carregada com sucesso.');

  const track = document.querySelector('.carousel-track');
  const cards = document.querySelectorAll('.depoimento-card');
  const prevButton = document.querySelector('.carousel-btn.prev');
  const nextButton = document.querySelector('.carousel-btn.next');
  const dots = document.querySelectorAll('.carousel-dots button');
  let currentIndex = 0;

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

  if (prevButton) {
    prevButton.addEventListener('click', function () {
      showSlide(currentIndex - 1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', function () {
      showSlide(currentIndex + 1);
    });
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener('click', function () {
      showSlide(index);
    });
  });
});

const questions = document.querySelectorAll(".faq-question");
questions.forEach(question => {
  question.addEventListener("click", () => {

    const item = question.parentElement;
    
    item.classList.toggle("active");
  });
});