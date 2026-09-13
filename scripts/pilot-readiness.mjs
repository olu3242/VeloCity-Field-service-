const required = [
  "PILOT_BASE_URL",
  "PILOT_PASSWORD",
  "PILOT_CUSTOMER_EMAIL",
  "PILOT_PROVIDER_EMAIL",
  "PILOT_ADMIN_EMAIL",
];

const missing = required.filter((key) => !process.env[key]?.trim());
const insecurePassword = Boolean(process.env.PILOT_PASSWORD && process.env.PILOT_PASSWORD.length < 16);

if (missing.length || insecurePassword) {
  if (missing.length) console.error(`Missing pilot variables: ${missing.join(", ")}`);
  if (insecurePassword) console.error("PILOT_PASSWORD must contain at least 16 characters.");
  process.exit(1);
}

const baseUrl = new URL(process.env.PILOT_BASE_URL);
if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "127.0.0.1" && baseUrl.hostname !== "localhost") {
  console.error("PILOT_BASE_URL must use HTTPS outside local development.");
  process.exit(1);
}

console.log("Pilot configuration gate passed.");
