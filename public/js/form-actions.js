export function setBtnLoading(btn, loading, loadingText = 'Cargando…') {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.prevHtml = btn.innerHTML;
    btn.innerHTML =
      `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${loadingText}`;
  } else if (btn.dataset.prevHtml) {
    btn.innerHTML = btn.dataset.prevHtml;
    delete btn.dataset.prevHtml;
  }
}

function getFormSubmitBtn(formId) {
  return document.querySelector(`button[type="submit"][form="${formId}"]`);
}

function getModalActionButtons(formId) {
  const form = document.getElementById(formId);
  const modal = form?.closest('.modal');
  if (!modal) return [];
  return [
    ...modal.querySelectorAll('.modal-footer button'),
    ...modal.querySelectorAll('.btn-close'),
  ];
}

export async function runFormAction(formId, loadingText, action) {
  const form = document.getElementById(formId);
  if (!form || form.dataset.busy === '1') return;

  form.dataset.busy = '1';
  const submitBtn = getFormSubmitBtn(formId);
  const modalBtns = getModalActionButtons(formId);

  setBtnLoading(submitBtn, true, loadingText);
  modalBtns.forEach((b) => {
    b.disabled = true;
  });

  try {
    await action();
  } finally {
    delete form.dataset.busy;
    setBtnLoading(submitBtn, false);
    modalBtns.forEach((b) => {
      b.disabled = false;
    });
  }
}

export async function runButtonAction(btn, action, { loadingText = '', iconOnly = false } = {}) {
  if (!btn || btn.disabled || btn.dataset.busy === '1') return;

  btn.dataset.busy = '1';
  if (iconOnly) {
    btn.disabled = true;
    btn.dataset.prevHtml = btn.innerHTML;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
  } else {
    setBtnLoading(btn, true, loadingText);
  }

  try {
    await action();
  } finally {
    delete btn.dataset.busy;
    if (iconOnly) {
      btn.disabled = false;
      if (btn.dataset.prevHtml) {
        btn.innerHTML = btn.dataset.prevHtml;
        delete btn.dataset.prevHtml;
      }
    } else {
      setBtnLoading(btn, false);
    }
  }
}
