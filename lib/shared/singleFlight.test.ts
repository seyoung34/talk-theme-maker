import { expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

it("shares concurrent work and releases success/failure for retry", async () => {
  const flight=createSingleFlight<number>();
  const load=vi.fn(async()=>42);
  expect(await Promise.all([flight.run("a",load),flight.run("a",load)])).toEqual([42,42]);
  expect(load).toHaveBeenCalledTimes(1);
  await flight.run("a",load);expect(load).toHaveBeenCalledTimes(2);
  const failure=vi.fn(async()=>{throw new Error("retry");});
  await expect(flight.run("b",failure)).rejects.toThrow("retry");
  expect(await flight.run("b",load)).toBe(42);
});
it("bounds retained keys without evicting work still awaited", async () => {
  const flight=createSingleFlight<number>(1);
  let finish!:(n:number)=>void;
  const first=flight.run("a",()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();
  const overflow=vi.fn(async()=>2);
  await Promise.all([flight.run("b",overflow),flight.run("b",overflow)]);
  expect(overflow).toHaveBeenCalledTimes(2);
  const duplicate=flight.run("a",async()=>99);
  finish(1);expect(await duplicate).toBe(1);expect(await first).toBe(1);
});
