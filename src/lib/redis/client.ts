// Redis client via Upstash REST API — no npm package required.
// Uses fetch (available globally in Next.js 14) to communicate with
// Upstash's HTTP Redis endpoint. Falls back gracefully when not configured.

const REDIS_TIMEOUT_MS = 3_000;

type RedisValue = string | number | null;
type PipelineResult = { result: RedisValue } | { error: string };

export class RedisClient {
  private readonly url: string;
  private readonly token: string;

  constructor() {
    this.url = (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/$/, "");
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  }

  get isConfigured(): boolean {
    return Boolean(
      this.url &&
        this.token &&
        !this.url.includes("placeholder") &&
        !this.token.includes("placeholder")
    );
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }
  }

  async execute<T = RedisValue>(
    command: (string | number)[]
  ): Promise<T> {
    if (!this.isConfigured) throw new Error("Redis not configured");
    const res = await this.fetchWithTimeout(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const data = (await res.json()) as { result: T } | { error: string };
    if ("error" in data) throw new Error(`Redis error: ${data.error}`);
    return (data as { result: T }).result;
  }

  async pipeline(
    commands: (string | number)[][]
  ): Promise<RedisValue[]> {
    if (!this.isConfigured) throw new Error("Redis not configured");
    const res = await this.fetchWithTimeout(`${this.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    const data = (await res.json()) as PipelineResult[];
    return data.map((d) => {
      if ("error" in d) throw new Error(`Redis pipeline error: ${d.error}`);
      return (d as { result: RedisValue }).result;
    });
  }

  // ── High-level helpers ──────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.execute<string | null>(["GET", key]);
  }

  async set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean }
  ): Promise<string | null> {
    const cmd: (string | number)[] = ["SET", key, value];
    if (opts?.ex) cmd.push("EX", opts.ex);
    if (opts?.nx) cmd.push("NX");
    return this.execute<string | null>(cmd);
  }

  async del(...keys: string[]): Promise<number> {
    return this.execute<number>(["DEL", ...keys]);
  }

  async exists(key: string): Promise<number> {
    return this.execute<number>(["EXISTS", key]);
  }

  async incr(key: string): Promise<number> {
    return this.execute<number>(["INCR", key]);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.execute<number>(["EXPIRE", key, seconds]);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.execute<number>(["HSET", key, field, value]);
  }

  async hmset(key: string, pairs: Record<string, string>): Promise<string> {
    const args: (string | number)[] = ["HMSET", key];
    for (const [f, v] of Object.entries(pairs)) args.push(f, v);
    return this.execute<string>(args);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.execute<string | null>(["HGET", key, field]);
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const flat = await this.execute<string[] | null>(["HGETALL", key]);
    if (!flat || flat.length === 0) return null;
    const obj: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
    return obj;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.execute<number>(["ZADD", key, score, member]);
  }

  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<string[]> {
    return this.execute<string[]>(["ZRANGEBYSCORE", key, min, max]);
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    return this.execute<number>(["ZREMRANGEBYSCORE", key, min, max]);
  }

  async zcard(key: string): Promise<number> {
    return this.execute<number>(["ZCARD", key]);
  }

  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown> {
    return this.execute<unknown>([
      "EVAL",
      script,
      keys.length,
      ...keys,
      ...args,
    ]);
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.execute<string>(["PING"]);
      return result === "PONG";
    } catch {
      return false;
    }
  }
}

export const redis = new RedisClient();
