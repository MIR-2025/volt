// mailer.js — sends email. In dev (no SMTP_URL) it prints messages to the
// console so you can see them; in production it uses nodemailer when SMTP_URL
// is set and the package is installed.

export async function createMailer() {
  const smtp = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM || "App <no-reply@example.com>";

  if (smtp) {
    let nodemailer;
    try {
      nodemailer = (await import("nodemailer")).default;
    } catch {
      console.warn("[mailer] SMTP_URL set but 'nodemailer' isn't installed — using console. Run: npm install nodemailer");
    }
    if (nodemailer) {
      const transport = nodemailer.createTransport(smtp);
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
