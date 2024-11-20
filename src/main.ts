// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const MOVE_STEP = 1e-4;

// Location of our classroom (as identified on Google Maps)
const PLAYER_START = { x: 36.98949379578401, y: -122.06277128548504 };

interface Vector2 {
  x: number;
  y: number;
}

type Coin = {
  origin: Vector2;
  coin_number: number;
};

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class CoinCache implements Momento<string> {
  inventory: Coin[];
  last_coin: number;
  mints_remaining: number;
  position: Vector2;

  constructor(totalMints: number = 0, position: Vector2 = { x: 0, y: 0 }) {
    this.inventory = [];
    this.last_coin = 0;
    this.mints_remaining = totalMints;
    this.position = position;
  }

  leaveCoin(coin: Coin) {
    this.inventory.push(coin);
  }

  takeCoin(): Coin | undefined {
    if (this.inventory.length) return this.inventory.pop()!;
    if (this.mints_remaining > 0) {
      this.mints_remaining--;
      return { origin: this.position, coin_number: this.last_coin++ };
    }
    return undefined;
  }

  fromMomento(momento: string): void {
    const parsedMomento = JSON.parse(momento);
    this.inventory = parsedMomento.inventory;
    this.last_coin = parsedMomento.last_coin;
    this.mints_remaining = parsedMomento.mints_remaining;
    this.position = parsedMomento.position;
  }

  toMomento(): string {
    return JSON.stringify(this);
  }
}

const playerCoins: Coin[] = [];

const momentos = new Map<string, string>();

////**** Page Content ****////
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No coins yet...";

// Initialize the map
const map = leaflet.map(document.getElementById("map")!, {
  center: leaflet.latLng(PLAYER_START.x, PLAYER_START.y),
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add layer for OpenStreetMap tiles
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Add layer for cache markers
const cacheLayerGroup = leaflet.layerGroup().addTo(map);

const playerMarker = leaflet.marker(
  leaflet.latLng(PLAYER_START.x, PLAYER_START.y),
)
  .bindTooltip("That's you!")
  .addTo(map);

// Add player path
const playerPath: leaflet.LatLng[] = [
  leaflet.latLng(PLAYER_START.x, PLAYER_START.y),
];

// Create a polyline object and add it to the map
const playerPolyline = leaflet.polyline(playerPath, { color: "green" }).addTo(
  map,
);

////**** Coin Cache Logic ****////

function spawnCoinCache(position: Vector2) {
  const originLat = position.x * TILE_DEGREES;
  const originLng = position.y * TILE_DEGREES;
  const cacheBounds = leaflet.latLngBounds(
    [originLat, originLng],
    [originLat + TILE_DEGREES, originLng + TILE_DEGREES],
  );

  leaflet.rectangle(cacheBounds, { color: "green", weight: 1 })
    .bindPopup(createPopup(position))
    .addTo(cacheLayerGroup);
}

function createPopup(position: Vector2): leaflet.Content {
  const coinCache = getOrCreateCache(position);
  const cachePopup = document.createElement("div");

  cachePopup.innerHTML = `
        Position (${position.x},${position.y}) <br>
        Coins Remaining: <span id="count">${
    coinCache.mints_remaining + coinCache.inventory.length
  }</span> <br>
        <button id="collect">Collect</button> <button id="deposit">Deposit</button>
    `;

  cachePopup.querySelector("#deposit")!.addEventListener(
    "click",
    () => handleDeposit(coinCache, cachePopup),
  );
  cachePopup.querySelector("#collect")!.addEventListener(
    "click",
    () => handleCollect(coinCache, cachePopup),
  );

  return cachePopup;
}

// Save momentos to localStorage
function saveGame() {
  localStorage.setItem(
    "momentos",
    JSON.stringify(Array.from(momentos.entries())),
  );
  localStorage.setItem("playerPath", JSON.stringify(playerPath));
  localStorage.setItem("playerCoins", JSON.stringify(playerCoins));
}

// Load momentos from localStorage
function loadGame() {
  const storedMomentos = localStorage.getItem("momentos");
  if (storedMomentos) {
    const parsedMomentos = new Map<string, string>(JSON.parse(storedMomentos));
    parsedMomentos.forEach((value, key) => {
      momentos.set(key, value);
    });
  }

  const storedPlayerPath = localStorage.getItem("playerPath");
  if (storedPlayerPath) {
    const parsedPlayerPath = JSON.parse(storedPlayerPath);
    parsedPlayerPath.forEach((pos: { lat: number; lng: number }) => {
      playerPath.push(leaflet.latLng(pos.lat, pos.lng));
    });
    playerPolyline.setLatLngs(playerPath);
  }

  const storedPlayerCoins = localStorage.getItem("playerCoins");
  if (storedPlayerCoins) {
    const parsedPlayerCoins = JSON.parse(storedPlayerCoins);
    parsedPlayerCoins.forEach((coin: Coin) => {
      playerCoins.push(coin);
    });
  }

  updateDisplay(statusPanel);
}

// Update the handleDeposit and handleCollect functions to save momentos
function handleDeposit(coinCache: CoinCache, cachePopup: HTMLElement) {
  if (playerCoins.length > 0) {
    coinCache.leaveCoin(playerCoins.pop()!);
    updateDisplay(cachePopup, coinCache);
    momentos.set(
      `${coinCache.position.x},${coinCache.position.y}`,
      coinCache.toMomento(),
    );
    saveGame();
  }
}

function handleCollect(coinCache: CoinCache, cachePopup: HTMLElement) {
  const coin = coinCache.takeCoin();
  if (coin) {
    playerCoins.push(coin);
    updateDisplay(cachePopup, coinCache);
    momentos.set(
      `${coinCache.position.x},${coinCache.position.y}`,
      coinCache.toMomento(),
    );
    saveGame();
  }
}

////**** Helper Functions ****////

function updateDisplay(
  cachePopup: HTMLElement,
  coinCache: CoinCache | null = null,
) {
  const coinList = playerCoins.map((coin, index) =>
    `<span class="coin-identifier" data-index="${index}">${coin.origin.x}:${coin.origin.y}#${coin.coin_number}</span>`
  ).join("<br>");
  statusPanel.innerHTML = `Collected Coins:<br>${coinList}`;

  // Add event listeners to coin identifiers
  document.querySelectorAll(".coin-identifier").forEach((element) => {
    element.addEventListener("click", (event) => {
      const index = (event.target as HTMLElement).dataset.index;
      if (index !== undefined) {
        const coin = playerCoins[parseInt(index)];
        const cachePosition = { x: coin.origin.x, y: coin.origin.y };
        console.log("Centering map on cache at", cachePosition);
        centerMapOnCache(cachePosition);
      }
    });
  });

  if (coinCache === null) return;

  cachePopup.querySelector("#count")!.textContent =
    (coinCache.mints_remaining + coinCache.inventory.length).toString();
}

function centerMapOnCache(position: Vector2) {
  const cacheLatLng = leaflet.latLng(
    position.x * TILE_DEGREES,
    position.y * TILE_DEGREES,
  );
  map.setView(cacheLatLng, GAMEPLAY_ZOOM_LEVEL);
}

function getOrCreateCache(position: Vector2): CoinCache {
  const posKey = `${position.x},${position.y}`;

  if (!momentos.has(posKey)) {
    const newCache = new CoinCache(Math.floor(luck(posKey) * 100), position);
    momentos.set(posKey, newCache.toMomento());
  }

  const cache = new CoinCache();
  cache.fromMomento(momentos.get(posKey)!);
  return cache;
}

function generateAroundPlayer(position: Vector2) {
  const playerMapPos = toMapCoordinates(position);
  cacheLayerGroup.clearLayers();

  for (
    let x = playerMapPos.x - NEIGHBORHOOD_SIZE;
    x < playerMapPos.x + NEIGHBORHOOD_SIZE;
    x++
  ) {
    for (
      let y = playerMapPos.y - NEIGHBORHOOD_SIZE;
      y < playerMapPos.y + NEIGHBORHOOD_SIZE;
      y++
    ) {
      if (luck(`${x},${y}`) < CACHE_SPAWN_PROBABILITY) spawnCoinCache({ x, y });
    }
  }
}

function toMapCoordinates(position: Vector2): Vector2 {
  return {
    x: Math.floor(position.x / TILE_DEGREES),
    y: Math.floor(position.y / TILE_DEGREES),
  };
}

////**** Player Movement ****////
document.getElementById("north")!.addEventListener(
  "click",
  () => movePlayer(0, MOVE_STEP),
);
document.getElementById("south")!.addEventListener(
  "click",
  () => movePlayer(0, -MOVE_STEP),
);
document.getElementById("west")!.addEventListener(
  "click",
  () => movePlayer(-MOVE_STEP, 0),
);
document.getElementById("east")!.addEventListener(
  "click",
  () => movePlayer(MOVE_STEP, 0),
);

document.getElementById("toggleGPS")!.addEventListener("click", enableGPS);

function enableGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        movePlayerToLocation(latitude, longitude);
      },
      (error) => {
        console.error("Error getting geolocation: ", error);
      },
      {
        enableHighAccuracy: true,
      },
    );
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

function movePlayer(dx: number, dy: number) {
  movePlayerToLocation(
    playerMarker.getLatLng().lat + dy,
    playerMarker.getLatLng().lng + dx,
  );
}

function movePlayerToLocation(lat: number, lng: number) {
  const newPos = leaflet.latLng(lat, lng);

  playerPath.push(newPos);
  playerPolyline.setLatLngs(playerPath);

  playerMarker.setLatLng(newPos);
  map.setView(newPos, GAMEPLAY_ZOOM_LEVEL);
  generateAroundPlayer({ x: lat, y: lng });
}

//// *** Reset Game *** ////
document.getElementById("reset")!.addEventListener("click", resetGame);

function resetGame() {
  //prompt user for confirmation
  if (!confirm("Are you sure you want to reset the game?")) return;

  localStorage.clear();
  location.reload();
}

////**** Game Logic ****////
loadGame();
generateAroundPlayer(PLAYER_START);
