export function toastSuccess(message) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: message,
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
  });
}

export function toastError(message) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title: message,
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
  });
}

export function toastWarning(message) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'warning',
    title: message,
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
  });
}

const confirmDialogDefaults = {
  showCancelButton: true,
  reverseButtons: true,
  confirmButtonColor: '#7c3aed',
  cancelButtonColor: '#6c757d',
};

export async function confirmAction(title, text) {
  const result = await Swal.fire({
    ...confirmDialogDefaults,
    title,
    text,
    icon: 'warning',
    confirmButtonText: 'Sí, continuar',
    cancelButtonText: 'Cancelar',
  });
  return result.isConfirmed;
}

export async function promptTotalPrecio() {
  const result = await Swal.fire({
    ...confirmDialogDefaults,
    title: 'Completar evento',
    text: 'Indique el monto cobrado al cliente Q',
    input: 'number',
    inputAttributes: { min: 0, step: '0.01' },
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
      if (value === '' || value === null) return 'Indique el monto cobrado al cliente.';
      if (Number(value) < 0) return 'El valor debe ser mayor o igual a 0.';
      return null;
    },
  });
  if (!result.isConfirmed) return null;
  return Number(result.value);
}

export function showError(message) {
  return Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message,
    confirmButtonColor: '#7c3aed',
  });
}

export async function confirmDeleteWithClave(title, text) {
  const result = await Swal.fire({
    ...confirmDialogDefaults,
    title,
    text,
    icon: 'warning',
    input: 'text',
    inputLabel: 'Clave de eliminación',
    inputPlaceholder: 'Ingrese la clave de la empresa',
    inputAttributes: {
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      maxlength: 64,
      class: 'swal2-input config-clave-mask',
      name: 'empresa-delete-clave',
      'data-lpignore': 'true',
      'data-1p-ignore': 'true',
      'data-form-type': 'other',
    },
    confirmButtonText: 'Eliminar',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
      if (!String(value || '').trim()) return 'Ingrese la clave de eliminación.';
      return null;
    },
  });
  if (!result.isConfirmed) return null;
  return String(result.value).trim();
}

export async function confirmMarcarPagadaFactura() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await Swal.fire({
    ...confirmDialogDefaults,
    title: 'Registrar pago',
    text: 'Indique la fecha de pago de la factura',
    icon: 'question',
    input: 'date',
    inputValue: today,
    confirmButtonText: 'Marcar como pagada',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
      if (!value) return 'Indique la fecha de pago.';
      return null;
    },
  });
  if (!result.isConfirmed) return null;
  return result.value;
}

export async function promptTicketNumber() {
  const result = await Swal.fire({
    ...confirmDialogDefaults,
    title: 'Buscar ticket',
    text: 'Ingrese el número de ticket',
    input: 'text',
    inputAttributes: {
      inputmode: 'numeric',
      pattern: '[0-9]*',
      autocomplete: 'off',
    },
    confirmButtonText: 'Aceptar',
    cancelButtonText: 'Cancelar',
    inputValidator: (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) return 'Ingrese un número de ticket.';
      if (!/^\d+$/.test(trimmed)) return 'Solo se permiten números.';
      return null;
    },
  });
  if (!result.isConfirmed) return null;
  return Number(result.value);
}
