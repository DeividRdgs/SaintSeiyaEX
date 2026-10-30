/* Contagem regressiva do banner "Novo Servidor" (index.html .home-dl-count).
   A data de abertura fica no atributo data-abre (ISO com fuso de Brasília, -03:00).
   Antes da hora mostra dias/horas/min/seg; depois esconde a contagem e mostra "Servidor aberto!". */
(function () {
  var box = document.getElementById('homeDlCount');
  if (!box) return;
  var alvo = Date.parse(box.getAttribute('data-abre'));
  if (isNaN(alvo)) return;
  var campos = {
    d: box.querySelector('[data-cd="d"]'),
    h: box.querySelector('[data-cd="h"]'),
    m: box.querySelector('[data-cd="m"]'),
    s: box.querySelector('[data-cd="s"]')
  };
  var relogio = box.querySelector('.home-dl-count-clock');
  var aberto = box.querySelector('.home-dl-count-open');
  var dois = function (n) { return n < 10 ? '0' + n : String(n); };
  var timer;

  function tique() {
    var falta = Math.floor((alvo - Date.now()) / 1000);
    if (falta <= 0) {
      box.classList.add('is-open');
      relogio.hidden = true;
      aberto.hidden = false;
      clearInterval(timer);
      return;
    }
    campos.d.textContent = Math.floor(falta / 86400);
    campos.h.textContent = dois(Math.floor(falta % 86400 / 3600));
    campos.m.textContent = dois(Math.floor(falta % 3600 / 60));
    campos.s.textContent = dois(falta % 60);
    // sem dias restantes, esconde a casa dos dias
    campos.d.parentNode.hidden = falta < 86400;
  }

  tique();
  timer = setInterval(tique, 1000);
})();
