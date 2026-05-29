const TELEFONO_REGEX = /^\d{8}$/;
const EVENTO_ESTATUS = ['pendiente', 'realizado'];
const EMPLEADO_TIPOS = ['TECNICO', 'SUPERVISOR'];
const EMPLEADO_ESTADOS = ['ACTIVO', 'INACTIVO'];
const COLOR_HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

function validateEmpleado(body, partial = false) {
  const errors = [];
  const nombre = body.nombre !== undefined ? String(body.nombre).trim() : undefined;
  const telefono = body.telefono !== undefined ? String(body.telefono).trim() : undefined;
  const tipo = body.tipo !== undefined ? String(body.tipo).trim().toUpperCase() : undefined;
  const estado = body.estado !== undefined ? String(body.estado).trim().toUpperCase() : undefined;
  const clave = body.clave !== undefined ? String(body.clave) : undefined;
  const color = body.color !== undefined ? String(body.color).trim() : undefined;

  if (!partial || nombre !== undefined) {
    if (!nombre || nombre.length === 0) errors.push('El nombre es obligatorio.');
  }
  if (!partial || telefono !== undefined) {
    if (!telefono || !TELEFONO_REGEX.test(telefono)) {
      errors.push('El teléfono debe tener exactamente 8 dígitos.');
    }
  }
  if (!partial || tipo !== undefined) {
    const value = tipo !== undefined ? tipo : partial ? undefined : 'TECNICO';
    if (value !== undefined && !EMPLEADO_TIPOS.includes(value)) {
      errors.push('El tipo debe ser TECNICO o SUPERVISOR.');
    }
  }
  if (!partial || estado !== undefined) {
    const value = estado !== undefined ? estado : partial ? undefined : 'ACTIVO';
    if (value !== undefined && !EMPLEADO_ESTADOS.includes(value)) {
      errors.push('El estado debe ser ACTIVO o INACTIVO.');
    }
  }
  if (!partial || clave !== undefined) {
    if (!partial && (!clave || clave.length === 0)) {
      errors.push('La clave es obligatoria.');
    }
  }
  if (!partial || color !== undefined) {
    const value = color !== undefined ? color : partial ? undefined : '#7c3aed';
    if (value !== undefined && !COLOR_HEX_REGEX.test(value)) {
      errors.push('El color debe ser un valor hexadecimal válido (#RRGGBB).');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      nombre,
      telefono,
      tipo: tipo !== undefined ? tipo : partial ? undefined : 'TECNICO',
      estado: estado !== undefined ? estado : partial ? undefined : 'ACTIVO',
      clave,
      color: color !== undefined ? color : partial ? undefined : '#7c3aed',
    },
  };
}

function parseCoord(value, fieldName, min, max) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: null };
  }
  const num = Number(value);
  if (Number.isNaN(num) || num < min || num > max) {
    return { valid: false, error: `${fieldName} debe ser un número entre ${min} y ${max}.` };
  }
  return { valid: true, value: num };
}

function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: null };
  }
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    return { valid: false, error: `${fieldName} debe ser un número válido mayor o igual a 0.` };
  }
  return { valid: true, value: num };
}

function validateCliente(body, partial = false) {
  const errors = [];
  const nombre_empresa =
    body.nombre_empresa !== undefined ? String(body.nombre_empresa).trim() : undefined;
  const nombre_cliente =
    body.nombre_cliente !== undefined ? String(body.nombre_cliente).trim() : undefined;
  const direccion = body.direccion !== undefined ? String(body.direccion).trim() : undefined;
  const telefono = body.telefono !== undefined ? String(body.telefono).trim() : undefined;

  if (!partial || nombre_empresa !== undefined) {
    if (!nombre_empresa || nombre_empresa.length === 0) {
      errors.push('El nombre de la empresa es obligatorio.');
    }
  }
  if (!partial || nombre_cliente !== undefined) {
    if (!nombre_cliente || nombre_cliente.length === 0) {
      errors.push('El nombre del cliente es obligatorio.');
    }
  }
  if (!partial || direccion !== undefined) {
    if (!direccion || direccion.length === 0) {
      errors.push('La dirección es obligatoria.');
    }
  }
  if (!partial || telefono !== undefined) {
    if (!partial && (!telefono || !TELEFONO_REGEX.test(telefono))) {
      errors.push('El teléfono debe tener exactamente 8 dígitos.');
    } else if (partial && telefono && !TELEFONO_REGEX.test(telefono)) {
      errors.push('El teléfono debe tener exactamente 8 dígitos.');
    }
  }

  let latitud = { valid: true, value: null };
  let longitud = { valid: true, value: null };
  if (!partial || body.latitud !== undefined) {
    latitud = parseCoord(body.latitud, 'Latitud', -90, 90);
    if (!latitud.valid) errors.push(latitud.error);
  }
  if (!partial || body.longitud !== undefined) {
    longitud = parseCoord(body.longitud, 'Longitud', -180, 180);
    if (!longitud.valid) errors.push(longitud.error);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      nombre_empresa,
      nombre_cliente,
      telefono: telefono !== undefined ? telefono || null : undefined,
      direccion,
      latitud: latitud.value,
      longitud: longitud.value,
    },
  };
}

function parseDate(value, fieldName) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: `${fieldName} es obligatorio.` };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} no es una fecha válida.` };
  }
  return { valid: true, date, iso: value };
}

function validateEvento(body, partial = false, { requireTotalPrecio = false } = {}) {
  const errors = [];
  const titulo = body.titulo !== undefined ? String(body.titulo).trim() : undefined;
  const descripcion =
    body.descripcion !== undefined && body.descripcion !== null
      ? String(body.descripcion).trim()
      : body.descripcion === null
        ? null
        : undefined;
  const observaciones =
    body.observaciones !== undefined && body.observaciones !== null
      ? String(body.observaciones).trim()
      : body.observaciones === null
        ? null
        : undefined;
  const inicio = body.inicio;
  const fin = body.fin;
  const empleadoCodigo =
    body.empleado_codigo !== undefined ? Number(body.empleado_codigo) : undefined;
  const clienteCodigo =
    body.cliente_codigo !== undefined ? Number(body.cliente_codigo) : undefined;
  const estatus =
    body.estatus !== undefined ? String(body.estatus).trim().toLowerCase() : undefined;

  let totalprecio = { valid: true, value: null };
  let cotizado = { valid: true, value: null };

  if (!partial || body.totalprecio !== undefined) {
    totalprecio = parseOptionalNumber(body.totalprecio, 'Total precio');
    if (!totalprecio.valid) errors.push(totalprecio.error);
  }
  if (!partial || body.cotizado !== undefined) {
    cotizado = parseOptionalNumber(body.cotizado, 'Cotizado');
    if (!cotizado.valid) errors.push(cotizado.error);
  }

  if (!partial || titulo !== undefined) {
    if (!titulo || titulo.length === 0) errors.push('El título es obligatorio.');
  }

  let inicioParsed;
  let finParsed;
  if (!partial || inicio !== undefined) {
    inicioParsed = parseDate(inicio, 'Inicio');
    if (!inicioParsed.valid) errors.push(inicioParsed.error);
  }
  if (!partial || fin !== undefined) {
    finParsed = parseDate(fin, 'Fin');
    if (!finParsed.valid) errors.push(finParsed.error);
  }
  if (inicioParsed?.valid && finParsed?.valid) {
    if (inicioParsed.date >= finParsed.date) {
      errors.push('La fecha de fin debe ser posterior a la de inicio.');
    }
  }
  if (!partial || empleadoCodigo !== undefined) {
    if (!Number.isInteger(empleadoCodigo) || empleadoCodigo <= 0) {
      errors.push('Debe seleccionar un empleado válido.');
    }
  }
  if (!partial || clienteCodigo !== undefined) {
    if (!Number.isInteger(clienteCodigo) || clienteCodigo <= 0) {
      errors.push('Debe seleccionar un cliente válido.');
    }
  }
  if (!partial || estatus !== undefined) {
    const value = estatus !== undefined ? estatus : partial ? undefined : 'pendiente';
    if (value !== undefined && !EVENTO_ESTATUS.includes(value)) {
      errors.push('El estatus debe ser pendiente o realizado.');
    }
  }

  const estatusFinal = estatus !== undefined ? estatus : partial ? undefined : 'pendiente';
  if (
    (requireTotalPrecio || estatusFinal === 'realizado') &&
    (totalprecio.value === null || totalprecio.value === undefined)
  ) {
    errors.push('El total precio es obligatorio al marcar como realizado.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      titulo,
      descripcion: descripcion === undefined ? undefined : descripcion || null,
      observaciones: observaciones === undefined ? undefined : observaciones || null,
      inicio: inicioParsed?.iso,
      fin: finParsed?.iso,
      empleado_codigo: empleadoCodigo,
      cliente_codigo: clienteCodigo,
      estatus: estatusFinal,
      totalprecio: totalprecio.value,
      cotizado: cotizado.value,
    },
  };
}

function parseDateOnly(value, fieldName) {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: `${fieldName} es obligatorio.` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { valid: false, error: `${fieldName} debe tener formato YYYY-MM-DD.` };
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName} no es una fecha válida.` };
  }
  return { valid: true, date, iso: value };
}

const COTIZACION_STATUS = ['PENDIENTE', 'TERMINADA'];

function validateCotizacion(body, partial = false) {
  const errors = [];
  const cliente = body.cliente !== undefined ? String(body.cliente).trim() : undefined;
  const telefono = body.telefono !== undefined ? String(body.telefono).trim() : undefined;
  const detalles =
    body.detalles !== undefined && body.detalles !== null
      ? String(body.detalles).trim()
      : body.detalles === null
        ? null
        : undefined;
  const status = body.status !== undefined ? String(body.status).trim().toUpperCase() : undefined;

  let totalprecio = { valid: true, value: null };
  if (!partial || body.totalprecio !== undefined) {
    totalprecio = parseOptionalNumber(body.totalprecio, 'Total precio');
    if (!totalprecio.valid) errors.push(totalprecio.error);
  }

  let fechaParsed;
  let venceParsed;
  if (!partial || body.fecha !== undefined) {
    fechaParsed = parseDateOnly(body.fecha, 'Fecha');
    if (!fechaParsed.valid) errors.push(fechaParsed.error);
  }
  if (!partial || body.vence !== undefined) {
    venceParsed = parseDateOnly(body.vence, 'Vence');
    if (!venceParsed.valid) errors.push(venceParsed.error);
  }

  if (!partial || cliente !== undefined) {
    if (!cliente || cliente.length === 0) errors.push('El cliente es obligatorio.');
  }
  if (!partial || telefono !== undefined) {
    if (!telefono || telefono.length === 0) errors.push('El teléfono es obligatorio.');
  }
  if (!partial || status !== undefined) {
    const value = status !== undefined ? status : partial ? undefined : 'PENDIENTE';
    if (value !== undefined && !COTIZACION_STATUS.includes(value)) {
      errors.push('El status debe ser PENDIENTE o TERMINADA.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      fecha: fechaParsed?.iso,
      cliente,
      telefono,
      vence: venceParsed?.iso,
      totalprecio: totalprecio.value,
      detalles: detalles === undefined ? undefined : detalles || null,
      status: status !== undefined ? status : partial ? undefined : 'PENDIENTE',
    },
  };
}

const TICKET_STATUS = ['PENDIENTE', 'FINALIZADO'];
const TICKET_PRIORIDAD = ['ALTA', 'MEDIA', 'BAJA'];

function parseOptionalDateOnly(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: null };
  }
  return parseDateOnly(value, fieldName);
}

function sanitizeMysqlText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  let text = String(value).trim();
  text = text.replace(/\0/g, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return text || null;
}

function optionalText(value) {
  if (value === undefined) return undefined;
  return sanitizeMysqlText(value);
}

function optionalVarchar(value, fieldName, maxLen, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const text = sanitizeMysqlText(value);
  if (!text) return null;
  if (text.length > maxLen) {
    errors.push(`${fieldName} no puede superar ${maxLen} caracteres.`);
    return text.slice(0, maxLen);
  }
  return text;
}

function parseOptionalEmpleado(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function parseOptionalTotalPrecio(value, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    errors.push('Total precio debe ser un número mayor o igual a 0.');
    return null;
  }
  return Math.round(num * 100) / 100;
}

function validateTicket(body, partial = false) {
  const errors = [];
  const codigoEmpleado =
    body.codigo_empleado !== undefined ? parseOptionalEmpleado(body.codigo_empleado) : undefined;
  const codigoCliente =
    body.codigo_cliente !== undefined ? Number(body.codigo_cliente) : undefined;
  const reporteCliente =
    body.reporte_cliente !== undefined ? optionalText(body.reporte_cliente) : undefined;
  const reporteTecnico =
    body.reporte_tecnico !== undefined ? optionalText(body.reporte_tecnico) : undefined;
  const accesos =
    body.accesos !== undefined ? optionalVarchar(body.accesos, 'Accesos', 255, errors) : undefined;
  const notas = body.notas !== undefined ? optionalText(body.notas) : undefined;
  const insumos = body.insumos !== undefined ? optionalText(body.insumos) : undefined;
  const totalprecio =
    body.totalprecio !== undefined ? parseOptionalTotalPrecio(body.totalprecio, errors) : undefined;
  const status = body.status !== undefined ? String(body.status).trim().toUpperCase() : undefined;
  const prioridad =
    body.prioridad !== undefined ? String(body.prioridad).trim().toUpperCase() : undefined;

  let fechaInicioParsed;
  let fechaFinParsed;
  if (!partial || body.fecha_inicio !== undefined) {
    fechaInicioParsed = parseDateOnly(body.fecha_inicio, 'Fecha inicio');
    if (!fechaInicioParsed.valid) errors.push(fechaInicioParsed.error);
  }
  if (!partial || body.fecha_fin !== undefined) {
    fechaFinParsed = parseOptionalDateOnly(body.fecha_fin, 'Fecha fin');
    if (!fechaFinParsed.valid) errors.push(fechaFinParsed.error);
  }

  if (!partial || body.codigo_empleado !== undefined) {
    if (codigoEmpleado !== null && codigoEmpleado !== undefined) {
      if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
        errors.push('Debe seleccionar un empleado válido.');
      }
    }
  }
  if (!partial || codigoCliente !== undefined) {
    if (!Number.isInteger(codigoCliente) || codigoCliente <= 0) {
      errors.push('Debe seleccionar un cliente válido.');
    }
  }
  if (!partial || status !== undefined) {
    const value = status !== undefined ? status : partial ? undefined : 'PENDIENTE';
    if (value !== undefined && !TICKET_STATUS.includes(value)) {
      errors.push('El status debe ser PENDIENTE o FINALIZADO.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      fecha_inicio: fechaInicioParsed?.iso,
      fecha_fin: fechaFinParsed?.value,
      codigo_empleado: codigoEmpleado !== undefined ? codigoEmpleado : partial ? undefined : null,
      codigo_cliente: codigoCliente,
      reporte_cliente: reporteCliente,
      reporte_tecnico: reporteTecnico,
      accesos,
      notas,
      insumos,
      totalprecio,
      status: status !== undefined ? status : partial ? undefined : 'PENDIENTE',
      prioridad: prioridad !== undefined ? prioridad : partial ? undefined : 'MEDIA',
    },
  };
}

module.exports = {
  TELEFONO_REGEX,
  EVENTO_ESTATUS,
  EMPLEADO_TIPOS,
  EMPLEADO_ESTADOS,
  COTIZACION_STATUS,
  TICKET_STATUS,
  TICKET_PRIORIDAD,
  validateEmpleado,
  validateCliente,
  validateEvento,
  validateCotizacion,
  validateTicket,
  parseDateOnly,
  sanitizeMysqlText,
};
