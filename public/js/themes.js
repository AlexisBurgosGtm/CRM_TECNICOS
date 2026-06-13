const THEME_KEY = 'app-theme';

export const THEMES = [
  { id: 'default', label: 'Default', preview: ['#5b21b6', '#a855f7'] },
  { id: 'invierno', label: 'Invierno', preview: ['#0c4a6e', '#38bdf8'] },
  { id: 'verano', label: 'Verano', preview: ['#c2410c', '#fbbf24'] },
  { id: 'cariño', label: 'Día del cariño', preview: ['#9f1239', '#fb7185'] },
  { id: 'carbono', label: 'Carbono', preview: ['#1f2937', '#6b7280'] },
  { id: 'black', label: 'Black', preview: ['#000000', '#404040'] },
  { id: 'construccion', label: 'Construcción', preview: ['#1a1a1a', '#d4a017'] },
];

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && THEMES.some((t) => t.id === stored)) return stored;
  return 'default';
}

function updateThemePickerUI(themeId) {
  document.querySelectorAll('.theme-picker-card').forEach((card) => {
    const active = card.dataset.themeId === themeId;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function applyTheme(themeId) {
  const theme = THEMES.some((t) => t.id === themeId) ? themeId : 'default';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = {
      default: '#5b21b6',
      invierno: '#0c4a6e',
      verano: '#ea580c',
      cariño: '#be123c',
      carbono: '#374151',
      black: '#000000',
      construccion: '#1a1a1a',
    };
    meta.setAttribute('content', colors[theme] || colors.default);
  }

  updateThemePickerUI(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function renderThemeSelector() {
  return `
    <button type="button" class="btn btn-outline-light btn-sm btn-theme-picker"
      data-theme-picker-btn title="Cambiar tema" aria-label="Cambiar tema">
      <i class="fa-solid fa-palette"></i>
    </button>`;
}

function renderThemeModal() {
  const cards = THEMES.map((t) => {
    const [c1, c2] = t.preview;
    return `
      <button type="button" class="theme-picker-card" data-theme-id="${t.id}"
        aria-pressed="false" aria-label="Tema ${t.label}">
        <span class="theme-picker-preview" style="background: linear-gradient(135deg, ${c1} 0%, ${c2} 100%)"></span>
        <span class="theme-picker-label">${t.label}</span>
        <i class="fa-solid fa-check theme-picker-check" aria-hidden="true"></i>
      </button>`;
  }).join('');

  return `
    <div class="modal fade" id="themePickerModal" tabindex="-1"
      aria-labelledby="themePickerModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered theme-picker-dialog">
        <div class="modal-content">
          <div class="modal-header modal-header-app py-2">
            <h6 class="modal-title mb-0" id="themePickerModalLabel">
              <i class="fa-solid fa-palette me-2"></i>Elegir tema
            </h6>
            <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body theme-picker-grid p-3">
            ${cards}
          </div>
        </div>
      </div>
    </div>`;
}

export function bindThemeSelector() {
  if (!document.getElementById('themePickerModal')) {
    document.body.insertAdjacentHTML('beforeend', renderThemeModal());
  }

  document.querySelectorAll('[data-theme-picker-btn]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const modalEl = document.getElementById('themePickerModal');
      if (!modalEl) return;
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
  });

  const grid = document.querySelector('.theme-picker-grid');
  if (grid && !grid.dataset.bound) {
    grid.dataset.bound = '1';
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.theme-picker-card');
      if (!card) return;
      applyTheme(card.dataset.themeId);
    });
  }

  const modal = document.getElementById('themePickerModal');
  if (modal && !modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('show.bs.modal', () => {
      updateThemePickerUI(getStoredTheme());
    });
  }

  updateThemePickerUI(getStoredTheme());
}
