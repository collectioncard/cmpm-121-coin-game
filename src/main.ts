// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

import { CoinCache } from "./coinCache.ts";
import { Coin, Vector2 } from "./types.ts";

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const MOVE_STEP = 1e-4;

// Location of our classroom (as identified on Google Maps)
const PLAYER_START = { x: 36.98949379578401, y: -122.06277128548504 };

const playerCoins: Coin[] = [];
const momentos = new Map<string, string>();

//encapsulate leaflet map logic
class mapData {
  map: leaflet.Map;
  playerMarker: leaflet.Marker;
  playerPolyline: leaflet.Polyline;
  cacheLayerGroup: leaflet.LayerGroup;

  constructor(containerId: string, playerStart: { x: number; y: number }) {
    this.map = leaflet.map(document.getElementById(containerId)!, {
      center: leaflet.latLng(playerStart.x, playerStart.y),
      zoom: GAMEPLAY_ZOOM_LEVEL,
      minZoom: GAMEPLAY_ZOOM_LEVEL,
      maxZoom: GAMEPLAY_ZOOM_LEVEL,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    this.cacheLayerGroup = leaflet.layerGroup().addTo(this.map);

    // Initialize the player marker at the start position
    this.playerMarker = leaflet.marker(
      leaflet.latLng(playerStart.x, playerStart.y),
    )
      .bindTooltip("That's you!")
      .addTo(this.map);

    const playerPath: leaflet.LatLng[] = [
      leaflet.latLng(playerStart.x, playerStart.y),
    ];

    this.playerPolyline = leaflet.polyline(playerPath, { color: "green" })
      .addTo(
        this.map,
      );
  }

  centerMapOnCache(position: Vector2) {
    const cacheLatLng = leaflet.latLng(
      position.x * TILE_DEGREES,
      position.y * TILE_DEGREES,
    );
    this.map.setView(cacheLatLng, GAMEPLAY_ZOOM_LEVEL);
  }

  movePlayerToLocation(lat: number, lng: number) {
    const newPos = leaflet.latLng(lat, lng);

    // Move player marker to new position
    this.playerMarker.setLatLng(newPos);
    this.playerPolyline.addLatLng(newPos);

    // Recenter map around new player position
    this.map.setView(newPos, GAMEPLAY_ZOOM_LEVEL);
  }

  createPopup(position: Vector2): leaflet.Content {
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

  spawnCoinCache(position: Vector2) {
    const originLat = position.x * TILE_DEGREES;
    const originLng = position.y * TILE_DEGREES;
    const cacheBounds = leaflet.latLngBounds(
      [originLat, originLng],
      [originLat + TILE_DEGREES, originLng + TILE_DEGREES],
    );

    leaflet.rectangle(cacheBounds, { color: "green", weight: 1 })
      .bindPopup(this.createPopup(position))
      .addTo(this.cacheLayerGroup);
  }

  generateAroundPlayer(position: Vector2) {
    const playerMapPos = toMapCoordinates(position);
    this.cacheLayerGroup.clearLayers();

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
        if (luck(`${x},${y}`) < CACHE_SPAWN_PROBABILITY) {
          this.spawnCoinCache({ x, y });
        }
      }
    }
  }
}

////**** Page Content ****////
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No coins yet...";

// Create map instance
const leafletMap = new mapData("map", PLAYER_START);

////**** Coin Cache Logic ****////

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
        leafletMap.centerMapOnCache(cachePosition);
      }
    });
  });

  if (coinCache === null) return;

  cachePopup.querySelector("#count")!.textContent =
    (coinCache.mints_remaining + coinCache.inventory.length).toString();
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
  leafletMap.generateAroundPlayer(position);
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
  const newLat = leafletMap.playerMarker.getLatLng().lat + dy;
  const newLng = leafletMap.playerMarker.getLatLng().lng + dx;
  movePlayerToLocation(newLat, newLng);
  saveGame();
}

function movePlayerToLocation(lat: number, lng: number) {
  leafletMap.movePlayerToLocation(lat, lng);
  generateAroundPlayer({ x: lat, y: lng });
}

//// *** Reset Game *** ////
document.getElementById("reset")!.addEventListener("click", resetGame);

function resetGame() {
  // Prompt user for confirmation
  if (!confirm("Are you sure you want to reset the game?")) return;

  localStorage.clear();
  location.reload();
}

////**** Game Logic ****////
loadGame();
generateAroundPlayer(PLAYER_START);

function saveGame() {
  localStorage.setItem(
    "momentos",
    JSON.stringify(Array.from(momentos.entries())),
  );
  localStorage.setItem("playerCoins", JSON.stringify(playerCoins));
  localStorage.setItem(
    "playerPath",
    JSON.stringify(leafletMap.playerPolyline.getLatLngs()),
  );
  //Get the player location coords in a Vector2
  const playerLocationVector = {
    x: leafletMap.playerMarker.getLatLng().lat,
    y: leafletMap.playerMarker.getLatLng().lng,
  };
  localStorage.setItem("playerLocation", JSON.stringify(playerLocationVector));
}

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
    leafletMap.playerPolyline.setLatLngs(parsedPlayerPath);
  }

  const storedPlayerCoins = localStorage.getItem("playerCoins");
  if (storedPlayerCoins) {
    playerCoins.length = 0;
    const parsedPlayerCoins: Coin[] = JSON.parse(storedPlayerCoins);
    parsedPlayerCoins.forEach((coin) => {
      playerCoins.push(coin);
    });
    //update the display
    updateDisplay(statusPanel);
  }

  if (localStorage.getItem("playerLocation")) {
    const playerLocation = JSON.parse(localStorage.getItem("playerLocation")!);
    leafletMap.movePlayerToLocation(playerLocation.x, playerLocation.y);
  }
}
