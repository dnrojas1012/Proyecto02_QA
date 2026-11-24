// Validación y saneamiento de entradas (lista blanca). Devuelve { datos, errores }.
function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

const patrones = {
  username: /^[a-zA-Z0-9._-]{3,30}$/,
  identificacion: /^[0-9A-Za-z-]{5,20}$/,
  cedula: /^[0-9A-Za-z-]{5,20}$/,
  telefono: /^[0-9+\- ]{8,20}$/,
  correo: /^[^\s@<>"']{1,64}@[^\s@<>"']{1,100}\.[a-zA-Z]{2,}$/,
  codigo: /^[A-Z0-9-]{3,20}$/,
  nombreRol: /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9 ._-]{3,50}$/,
};

function validarCampo(errores, nombre, valor, patron, mensaje) {
  if (!patron.test(valor)) errores.push(mensaje || `El campo ${nombre} no es válido.`);
}

function validarNombre(errores, valor, etiqueta = 'nombre', max = 100) {
  if (valor.length < 2 || valor.length > max) {
    errores.push(`El ${etiqueta} debe tener entre 2 y ${max} caracteres.`);
  }
}

// Política mínima de contraseñas: 10+ caracteres con letras y números
function validarPassword(errores, valor) {
  if (valor.length < 10 || valor.length > 128 || !/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) {
    errores.push('La contraseña debe tener al menos 10 caracteres, con letras y números.');
  }
}

function entero(valor) {
  const n = Number.parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(valor).trim() ? n : null;
}

module.exports = { texto, patrones, validarCampo, validarNombre, validarPassword, entero };
