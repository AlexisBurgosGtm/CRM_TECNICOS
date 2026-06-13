export function mountFloatingFab({ id, ariaLabel, icon = 'fa-plus', extraClass = '' }) {
  document.getElementById(id)?.remove();
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = id;
  fab.className = `btn btn-primary fab-add-floating${extraClass ? ` ${extraClass}` : ''}`;
  fab.dataset.fabAdd = '1';
  fab.setAttribute('aria-label', ariaLabel);
  fab.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  document.body.appendChild(fab);
  return fab;
}
