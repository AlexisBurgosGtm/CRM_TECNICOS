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
