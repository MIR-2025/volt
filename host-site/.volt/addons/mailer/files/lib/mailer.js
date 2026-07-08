// mailer.js — sends email. In dev (no SMTP config) it prints messages to the
// console so you can see them; in production it uses nodemailer when SMTP is
// configured — either a single SMTP_URL, or discrete SMTP_HOST/SMTP_PORT/
// SMTP_SECURE/SMTP_USER/SMTP_PASS vars — and the package is installed.

export async function createMailer() {
  // transport: SMTP_URL wins; otherwise build it from discrete host/port vars.
  const transportConfig = process.env.SMTP_URL
    ? process.env.SMTP_URL
    : process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: /^(1|true|yes|on)$/i.test(process.env.SMTP_SECURE || "") || Number(process.env.SMTP_PORT) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        }
      : null;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "App <no-reply@example.com>";

  if (transportConfig) {
    let nodemailer;
    try {
      nodemailer = (await import("nodemailer")).default;
    } catch {
      console.warn("[mailer] SMTP configured but 'nodemailer' isn't installed — using console. Run: npm install nodemailer");
    }
    if (nodemailer) {
      const transport = nodemailer.createTransport(transportConfig);
      return {
        name: "smtp",
        async send({ to, subject, text, html }) {
          await transport.sendMail({ to, from, subject, text, html });
        },
      };
    }
  }

  return {
    name: "console",
    async send({ to, subject, text }) {
      console.log(`\n📨  Email to ${to} — ${subject}\n    ${String(text || "").replace(/\n/g, "\n    ")}\n`);
    },
  };
}
