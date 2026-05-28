export class RipioFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RipioFetchError";
  }
}

interface RipioRate { ticker: string; sell_rate: string; }

export async function fetchRipioRate(): Promise<number> {
  const res = await fetch("https://app.ripio.com/api/v3/public/rates/?country=AR", {
    headers: {
      "accept": "*/*",
      "origin": "https://www.criptodolar.com",
      "referer": "https://www.criptodolar.com/",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new RipioFetchError(`Ripio returned HTTP ${res.status}`);

  const data: RipioRate[] = await res.json();
  const usdt = data.find((r) => r.ticker === "USDT_ARS");
  if (!usdt) throw new RipioFetchError("USDT_ARS ticker not found in Ripio response");

  const rate = parseFloat(usdt.sell_rate);
  if (isNaN(rate) || rate <= 0) throw new RipioFetchError(`Invalid sell_rate: ${usdt.sell_rate}`);

  return rate;
}
