// mailer.js — sends the magic-link email. In dev (no SMTP configured) it just
// prints the link to the console so you can copy it; in production it uses
// nodemailer if SMTP_URL is set and the package is installed.

export async function createMailer() {
  const smtp = process.env.SMTP_URL;
  const from = process.env.MAIL_FROM || "Guestbook <no-reply@example.com>";

  if (smtp) {
    let nodemailer;
    try {
      nodemailer = (await import("nodemailer")).default;
    } catch {
      console.warn("[mailer] SMTP_URL set but 'nodemailer' isn't installed — falling back to console. Run: npm install nodemailer");
    }
    if (nodemailer) {
      const transport = nodemailer.createTransport(smtp);
      return {
        name: "smtp",
        async sendMagicLink(email, link) {
          await transport.sendMail({
            to: email,
            from,
            subject: "Your guestbook login link",
            text: `Click to sign in: ${link}\n\nThis link expires shortly and can only be used once.`,
            html: `<p>Click to sign in:</p><p><a href="${link}">${link}</a></p><p>This link expires shortly and can only be used once.</p>`,
          });
        },
      };
    }
  }

  return {
    name: "console",
    async sendMagicLink(email, link) {
      console.log(`\n📨  Magic link for ${email}:\n    ${link}\n    (dev mode — paste this into your browser)\n`);
    },
  };
}
