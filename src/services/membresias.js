// Reglas de negocio de las membresías
const PLANES = { MENSUAL: 1, TRIMESTRAL: 3, ANUAL: 12 };   // meses de cada plan
const DIAS_POR_VENCER = 7;                                 // RFD-3.4 y RFD-3.5

// RFD-3.2: vencimiento = inicio + N meses - 1 día. Lo calcula PostgreSQL.
async function calcularVencimiento(cliente, fechaInicio, plan) {
  const { rows } = await cliente.query(
    "SELECT to_char(($1::date + make_interval(months => $2::int) - INTERVAL '1 day')::date, 'YYYY-MM-DD') AS vence",
    [fechaInicio, PLANES[plan]]
  );
  return rows[0].vence;
}

// RN-3.1: un cliente solo puede tener una membresía vigente.
// Se rechaza si el periodo nuevo [inicio, vence] se traslapa con otra membresía del cliente.
async function buscarTraslape(cliente, clienteId, inicio, vence, excluirId = null) {
  const { rows } = await cliente.query(
    `SELECT codigo, to_char(fecha_vencimiento, 'DD/MM/YYYY') AS vence
       FROM membresias
      WHERE cliente_id = $1
        AND daterange(fecha_inicio, fecha_vencimiento, '[]') && daterange($2::date, $3::date, '[]')
        AND ($4::int IS NULL OR id <> $4)
      LIMIT 1`,
    [clienteId, inicio, vence, excluirId]
  );
  return rows[0] || null;
}

module.exports = { PLANES, DIAS_POR_VENCER, calcularVencimiento, buscarTraslape };
