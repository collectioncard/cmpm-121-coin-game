// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

interface Vector2 {
  x: number;
  y: number;
}

const cacheData = new Map<string, number>();

////**** Page Content ****////

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the number of coins the player has collected so far
let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!; // element `statusPanel` is defined in index.html
statusPanel.innerHTML = "No points yet...";

////**** Coin Caches ****////
function spawnCoinCache(position: Vector2) {
  const origin = OAKES_CLASSROOM;

  const cacheBounds = leaflet.latLngBounds(
    [
      origin.lat + position.x * TILE_DEGREES,
      origin.lng + position.y * TILE_DEGREES,
    ],
    [
      origin.lat + (position.x + 1) * TILE_DEGREES,
      origin.lng + (position.y + 1) * TILE_DEGREES,
    ],
  );

  leaflet.rectangle(cacheBounds, { color: "green", weight: 1 })
    .bindPopup(createPopup(position))
    .addTo(map);
}

function createPopup(position: Vector2): leaflet.Content {
  // Check to see if the dictionary has a value for the given position. If not, generate a new value.
  // We don't save the value because we don't need to store data unless it changes thx to seeded random
  let cacheValue = cacheData.get(`${position.x},${position.y}`) ??
    Math.floor(luck(`${position.x},${position.y}`) * 100);

  const cachePopup = document.createElement("div");
  cachePopup.innerHTML = `
        Position (${position.x},${position.y}) <br>
        Cache value: <span id="count">${cacheValue}</span> <br>
        <button id="collect">Collect</button> <button id="deposit">Deposit</button>
    `;

  cachePopup.querySelector("#collect")!.addEventListener("click", () => {
    if (cacheValue <= 0) return;

    playerPoints++;
    cacheValue--;
    cacheData.set(`${position.x},${position.y}`, cacheValue);
    statusPanel.innerHTML = `Points: ${playerPoints}`;
    cachePopup.querySelector("#count")!.textContent = cacheValue.toString();
  });

  cachePopup.querySelector("#deposit")!.addEventListener("click", () => {
    if (playerPoints <= 0) return;

    playerPoints--;
    cacheValue++;
    cacheData.set(`${position.x},${position.y}`, cacheValue);
    statusPanel.innerHTML = `Points: ${playerPoints}`;
    cachePopup.querySelector("#count")!.textContent = cacheValue.toString();
  });

  return cachePopup;
}

////**** Game Logic ****////

//Spawn caches in the neighborhood of the player
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCoinCache({ x: i, y: j });
    }
  }
}
