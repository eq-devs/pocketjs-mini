import { test, expect } from "bun:test";
import { physicalPhones, lanAddress } from "../bin/devices.ts";
import { parseAndroidDevices } from "../bin/android.ts";

test("Android discovery preserves unauthorized and offline states for diagnostics", () => {
  expect(parseAndroidDevices("List of devices attached\nemulator-5554 device product:sdk model:Pixel_2 transport_id:1\nphone unauthorized usb:1\nold offline\n")).toEqual([
    { id: "emulator-5554", state: "device", name: "Pixel 2" },
    { id: "phone", state: "unauthorized", name: "phone" },
    { id: "old", state: "offline", name: "old" },
  ]);
});

test("only connected physical iPhones are candidates", () => {
  const phone = { hardwareProperties: { deviceType: "iPhone" }, connectionProperties: { tunnelState: "connected" } };
  expect(physicalPhones({ result: { devices: [phone,
    { ...phone, connectionProperties: { tunnelState: "unavailable" } },
    { ...phone, hardwareProperties: { deviceType: "Apple Watch" } }] } })).toEqual([phone]);
});
test("physical transport requires a real private interface and never guesses between networks", () => {
  const address = (value: string) => ({ address: value, family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null } as const);
  const one = { en0: [address("192.168.1.2")] };
  expect(lanAddress(one)).toBe("192.168.1.2");
  expect(() => lanAddress(one, "192.168.1.3")).toThrow();
  expect(() => lanAddress({})).toThrow();
  const two = { ...one, en1: [address("10.0.0.2")] };
  expect(() => lanAddress(two)).toThrow();
  expect(lanAddress(two, "10.0.0.2")).toBe("10.0.0.2");
});
