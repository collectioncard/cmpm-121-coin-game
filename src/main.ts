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

// Location of our classroom (as identified on Google Maps)
const PLAYER_START = { x: 36.98949379578401, y: -122.06277128548504 };

interface Vector2 {
  x: number;
  y: number;
}

type CoinCache = {
  inventory: Coin[];
  last_coin: number;
  mints_remaining: number;
  leaveCoin: (coin: Coin) => void;
  takeCoin: () => Coin | undefined;
};

type Coin = {
  origin: Vector2;
  coin_number: number;
};

const cacheData = new Map<string, CoinCache>();
const playerCoins: Coin[] = [];

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

const _playerMarker = leaflet.marker(
  leaflet.latLng(PLAYER_START.x, PLAYER_START.y),
)
  .bindTooltip("That's you!")
  .addTo(map);

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

function handleDeposit(coinCache: CoinCache, cachePopup: HTMLElement) {
  if (playerCoins.length > 0) {
    coinCache.leaveCoin(playerCoins.pop()!);
    updateDisplay(cachePopup, coinCache);
  }
}

function handleCollect(coinCache: CoinCache, cachePopup: HTMLElement) {
  const coin = coinCache.takeCoin();
  if (coin) {
    playerCoins.push(coin);
    updateDisplay(cachePopup, coinCache);
  }
}

////**** Helper Functions ****////

function updateDisplay(cachePopup: HTMLElement, coinCache: CoinCache) {
  const coinList = playerCoins.map((coin) =>
    `${coin.origin.x}:${coin.origin.y}#${coin.coin_number}`
  ).join("<br>");
  statusPanel.innerHTML = `Collected Coins:<br>${coinList}`;

  cachePopup.querySelector("#count")!.textContent =
    (coinCache.mints_remaining + coinCache.inventory.length).toString();
}

function getOrCreateCache(position: Vector2): CoinCache {
  const posKey = `${position.x},${position.y}`;

  if (!cacheData.has(posKey)) {
    const newCache: CoinCache = {
      inventory: [],
      last_coin: 0,
      mints_remaining: Math.floor(luck(posKey) * 100),
      leaveCoin: function (coin) {
        this.inventory.push(coin);
      },
      takeCoin: function (): Coin | undefined {
        if (this.inventory.length) return this.inventory.pop()!;
        if (this.mints_remaining > 0) {
          this.mints_remaining--;
          return { origin: position, coin_number: this.last_coin++ };
        }
        return undefined;
      },
    };
    cacheData.set(posKey, newCache);
  }

  return cacheData.get(posKey)!;
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

////**** Game Logic ****////

generateAroundPlayer(PLAYER_START);
