// Aviso de inactividad en el navegador (complementa el cierre en el servidor).
// No usa innerHTML: solo muestra/oculta un elemento que ya existe (UTN-07b).
(function () {
  var segundos = Number(document.body.dataset.timeout) || 60;
  var aviso = document.getElementById('aviso-sesion');
  var temporizadorAviso, temporizadorCierre;

  function reiniciar() {
    clearTimeout(temporizadorAviso);
    clearTimeout(temporizadorCierre);
    if (aviso) aviso.hidden = true;
    temporizadorAviso = setTimeout(function () { if (aviso) aviso.hidden = false; }, (segundos - 15) * 1000);
    temporizadorCierre = setTimeout(function () {
      window.location.href = '/login?expirada=1';
    }, segundos * 1000 + 1000);
  }
  // Solo una petición al servidor renueva la sesión; aquí se reinicia
  // el temporizador al cargar cada página.
  reiniciar();
})();
