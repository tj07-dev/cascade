import { checkRateLimit, resetRateLimitStore } from "../rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRateLimitStore();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows first request", () => {
    const result = checkRateLimit("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("blocks after 10 requests", () => {
    const ip = "5.6.7.8";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const ip = "9.10.11.12";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    jest.advanceTimersByTime(61 * 60 * 1000);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(true);
  });
});
