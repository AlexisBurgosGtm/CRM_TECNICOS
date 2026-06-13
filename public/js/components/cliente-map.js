const DEFAULT_CENTER = { lat: 14.6349, lng: -90.5069 };

let mapInstance = null;
let markerInstance = null;

function getCoordInputs() {
  return {
    lat: document.getElementById('clienteLatitud'),
    lng: document.getElementById('clienteLongitud'),
  };
}

function updateCoordInputs(lat, lng) {
  const inputs = getCoordInputs();
  if (!inputs.lat || !inputs.lng) return;
  inputs.lat.value = Number(lat).toFixed(6);
  inputs.lng.value = Number(lng).toFixed(6);
}

function hasValidCoords(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo);
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

export function destroyClienteMap() {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerInstance = null;
  }
}

export async function initClienteMap({ containerId, lat, lng } = {}) {
  if (typeof L === 'undefined') return;

  destroyClienteMap();

  const container = document.getElementById(containerId);
  if (!container) return;

  let centerLat = lat;
  let centerLng = lng;

  if (!hasValidCoords(centerLat, centerLng)) {
    const device = await getCurrentPosition();
    if (device) {
      centerLat = device.lat;
      centerLng = device.lng;
    } else {
      centerLat = DEFAULT_CENTER.lat;
      centerLng = DEFAULT_CENTER.lng;
    }
    updateCoordInputs(centerLat, centerLng);
  } else {
    centerLat = Number(centerLat);
    centerLng = Number(centerLng);
  }

  updateCoordInputs(centerLat, centerLng);

  mapInstance = L.map(containerId, { scrollWheelZoom: true }).setView([centerLat, centerLng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance);

  markerInstance = L.marker([centerLat, centerLng], { draggable: true }).addTo(mapInstance);

  markerInstance.on('dragend', () => {
    const { lat: la, lng: lo } = markerInstance.getLatLng();
    updateCoordInputs(la, lo);
  });

  requestAnimationFrame(() => {
    mapInstance.invalidateSize();
    setTimeout(() => mapInstance?.invalidateSize(), 250);
  });
}
