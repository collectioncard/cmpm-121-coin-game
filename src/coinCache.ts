import { Coin, Vector2 } from "./types.ts";

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

export class CoinCache implements Momento<string> {
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
