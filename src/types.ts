interface Vector2 {
  x: number;
  y: number;
}

type Coin = {
  origin: Vector2;
  coin_number: number;
};

export type { Coin, Vector2 };
