import { config as loadDotenv } from "dotenv";

loadDotenv();

const requiredEnv = ["ADMIN_USERNAME", "ADMIN_PASSWORD"] as const;

function readEnv(key: (typeof requiredEnv)[number]) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getAdminCredentials() {
  const username = readEnv("ADMIN_USERNAME");
  const password = readEnv("ADMIN_PASSWORD");

  if (!username || !password) {
    throw new Error("ADMIN_USERNAME dan ADMIN_PASSWORD wajib diisi di .env");
  }

  return { username, password };
}

export function validateRequiredEnv() {
  for (const key of requiredEnv) {
    const value = readEnv(key);
    if (!value) {
      throw new Error(`${key} wajib diisi di .env`);
    }
  }
}
