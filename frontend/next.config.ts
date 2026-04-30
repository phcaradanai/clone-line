import type { NextConfig } from "next";
import os from "os";

// ดึง IP ทั้งหมดในเครื่องเพื่ออนุญาตให้เข้าถึง dev server ได้จากทุก network
const getLocalIPs = () => {
  const interfaces = os.networkInterfaces();
  const ips = ["localhost:3000"];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4") {
        const ip = iface.address;
        ips.push(ip); // แบบไม่มีพอร์ต (ตามที่ Terminal แนะนำ)
        ips.push(`${ip}:3000`); // แบบมีพอร์ต
        ips.push(`http://${ip}:3000`); // แบบเต็ม
      }
    }
  }
  return ips;
};

const nextConfig: NextConfig = {
  /* config options here */
  // อนุญาตโดเมนของ Cloudflare Tunnel และ IP ในวงแลนทั้งหมด
  allowedDevOrigins: [
    ...getLocalIPs(),
    "*.trycloudflare.com",
    "trycloudflare.com"
  ], 
};

export default nextConfig;
